// Text and glowing signs: a canvas text atlas shared by mall names, bus-stop boards, the MRT totem
// and road words; neon signs and animated LED screens on the mall podiums.

import * as THREE from 'three/webgpu';
import { attribute, float, floor, fract, hash, instanceIndex, mix, positionWorld, sin, smoothstep, step, texture, time, uv, vec2, vec3 } from 'three/tsl';
import type { Frontage } from './buildings.ts';
import { STYLE } from './buildings.ts';
import { rng } from './geo3d.ts';
import { distToLine, type Pt } from './path.ts';
import { pointInRing } from '../world/polygon.ts';
import type { Label } from './walkData.ts';
import { RAIN_LOOK as L } from './look.ts';
import type { Flash } from './street.ts';

interface Entry {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  aspect: number;
}

/** Draws strings into one canvas texture and hands out their rectangles. */
export class TextAtlas {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private x = 0;
  private y = 0;
  private rowH = 0;
  private readonly cache = new Map<string, Entry>();
  readonly texture: THREE.CanvasTexture;

  constructor(readonly size = 2048) {
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  add(text: string, px = 96, weight = 700): Entry {
    const key = `${weight}|${px}|${text}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const c = this.ctx;
    c.font = `${weight} ${px}px ${L.signFont}`;
    const w = Math.ceil(c.measureText(text).width) + px * 0.4;
    const h = Math.ceil(px * 1.3);
    if (this.x + w > this.size) {
      this.x = 0;
      this.y += this.rowH;
      this.rowH = 0;
    }
    if (this.y + h > this.size) throw new Error('Text atlas is full');
    c.fillStyle = '#fff';
    c.textBaseline = 'middle';
    c.fillText(text, this.x + px * 0.2, this.y + h / 2);
    const s = this.size;
    // Canvas rows run down; texture v runs up (flipY).
    const e = { u0: this.x / s, u1: (this.x + w) / s, v0: 1 - (this.y + h) / s, v1: 1 - this.y / s, aspect: w / h };
    this.x += w;
    this.rowH = Math.max(this.rowH, h);
    this.cache.set(key, e);
    return e;
  }
}

/** Collects flat text quads (glowing, coloured per quad) into one mesh. */
export class TextQuads {
  private pos: number[] = [];
  private uvs: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  constructor(readonly atlas: TextAtlas) {}

  /**
   * A text quad centred at `c`, spanning `right` (unit vector along the text) and `up`,
   * `height` metres tall (width from the text's shape), facing right × up.
   */
  add(text: string, c: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, height: number, colour: THREE.Color, maxWidth = Infinity, px = 96, lift = 0) {
    const e = this.atlas.add(text, px);
    // Readable from the front only (right × up), nudged off whatever it is stuck to.
    c = c.clone().addScaledVector(right.clone().cross(up).normalize(), lift);
    let h = height;
    let w = h * e.aspect;
    if (w > maxWidth) {
      w = maxWidth;
      h = w / e.aspect;
    }
    const i = this.pos.length / 3;
    const corners = [
      [-0.5, -0.5, e.u0, e.v0],
      [0.5, -0.5, e.u1, e.v0],
      [0.5, 0.5, e.u1, e.v1],
      [-0.5, 0.5, e.u0, e.v1],
    ];
    for (const [a, b, uu, vv] of corners) {
      const p = c.clone().addScaledVector(right, a * w).addScaledVector(up, b * h);
      this.pos.push(p.x, p.y, p.z);
      this.uvs.push(uu, vv);
      this.col.push(colour.r, colour.g, colour.b);
    }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return { w, h };
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const a = texture(this.atlas.texture, uv()).a;
    m.colorNode = attribute('color', 'vec3');
    m.opacityNode = a;
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    return mesh;
  }
}

/** Mall and landmark names on the walls that face the street. */
export function mallNames(labels: Label[], frontages: Frontage[], walk: Pt[], quads: TextQuads) {
  const rand = rng(88);
  const done = new Set<string>();
  const sorted = labels
    .map((l) => ({ l, d: Math.min(...Array.from({ length: l.p.length / 2 }, (_, i) => distToLine(l.p[2 * i], l.p[2 * i + 1], walk))) }))
    .filter((x) => x.d < 90)
    .sort((a, b) => a.d - b.d);
  for (const { l } of sorted) {
    if (done.has(l.n)) continue;
    // The building's longest wall that faces the walk.
    let best: Frontage | null = null;
    let score = -Infinity;
    for (const f of frontages) {
      const mx = (f.a[0] + f.b[0]) / 2 - f.n[0] * 0.6;
      const mz = (f.a[1] + f.b[1]) / 2 - f.n[1] * 0.6;
      if (f.len < 10 || f.dWalk > 70 || !pointInRing(mx, mz, l.p)) continue;
      const near = nearest(walk, mx, mz);
      const facing = (near[0] - mx) * f.n[0] + (near[1] - mz) * f.n[1];
      if (facing < 0.3 * Math.hypot(near[0] - mx, near[1] - mz)) continue;
      const sc = Math.min(f.len, 40) - f.dWalk * 0.5;
      if (sc > score) {
        score = sc;
        best = f;
      }
    }
    if (!best) continue;
    done.add(l.n);
    const f = best;
    const right = new THREE.Vector3(f.b[0] - f.a[0], 0, f.b[1] - f.a[1]).normalize().negate();
    const outN = new THREE.Vector3(f.n[0], 0, f.n[1]);
    const y = Math.max(7, Math.min(l.h - 3, 18, f.top - 2.5));
    const c = new THREE.Vector3((f.a[0] + f.b[0]) / 2, y, (f.a[1] + f.b[1]) / 2).addScaledVector(outN, 0.25);
    const tint = new THREE.Color(L.signWhite).lerp(new THREE.Color(L.neon[Math.floor(rand() * L.neon.length)]), 0.25).multiplyScalar(3.2);
    quads.add(l.n.toUpperCase(), c, right, new THREE.Vector3(0, 1, 0), 3, tint, f.len * 0.8);
  }
}

function nearest(line: Pt[], x: number, z: number): Pt {
  let best = line[0];
  let bd = Infinity;
  for (const p of line) {
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Buildings whose street front is a giant LED screen. */
const MEDIA_WALLS = ['ION Orchard'];

/** Neon signs and LED screens on podium walls that face the walk. */
export function neonAndScreens(frontages: Frontage[], walk: Pt[], flash: Flash) {
  const rand = rng(1965);
  const signs: { m: THREE.Matrix4; col: THREE.Color; tall: boolean }[] = [];
  const screens: { m: THREE.Matrix4 }[] = [];
  const media: THREE.Matrix4[] = [];
  for (const f of frontages) {
    const mediaWall = f.owner !== undefined && MEDIA_WALLS.includes(f.owner);
    if (f.dWalk > (mediaWall ? 130 : 70) || f.base > (mediaWall ? 12 : 1) || f.top < 9) continue;
    const mx = (f.a[0] + f.b[0]) / 2;
    const mz = (f.a[1] + f.b[1]) / 2;
    const near = nearest(walk, mx, mz);
    const facing = (near[0] - mx) * f.n[0] + (near[1] - mz) * f.n[1];
    if (facing < (mediaWall ? 0 : 0.2) * Math.hypot(near[0] - mx, near[1] - mz)) continue;
    const along = new THREE.Vector3(f.b[0] - f.a[0], 0, f.b[1] - f.a[1]).normalize();
    const out = new THREE.Vector3(f.n[0], 0, f.n[1]);
    // Landmark media walls (ION Orchard's facade is one huge screen), and a big screen on some podiums.
    // A landmark's media wall covers every street-facing wall segment from the podium base up;
    // its picture runs on across the segments (see mediaMaterial), so a curved facade is one screen.
    if (mediaWall && f.top > 14) {
      const bottom = Math.max(f.base, 6) + 0.4;
      const sh = f.top - bottom - 0.6;
      const m = new THREE.Matrix4().makeBasis(along.clone().negate(), new THREE.Vector3(0, 1, 0), out);
      m.setPosition(mx + out.x * 0.25, bottom + sh / 2, mz + out.z * 0.25);
      m.scale(new THREE.Vector3(f.len + 0.05, sh, 1));
      media.push(m);
      continue;
    }
    if (f.style === STYLE.podium && f.len > 16 && f.top > 14 && rand() < 0.55) {
      const sw = Math.min(f.len * 0.45, 16);
      const sh = Math.min(sw * 0.56, f.top - 8);
      const t = 0.3 + rand() * 0.4;
      const m = new THREE.Matrix4().makeBasis(along.clone().negate(), new THREE.Vector3(0, 1, 0), out);
      m.setPosition(f.a[0] + (f.b[0] - f.a[0]) * t + out.x * 0.3, 6.5 + sh / 2, f.a[1] + (f.b[1] - f.a[1]) * t + out.z * 0.3);
      m.scale(new THREE.Vector3(sw, sh, 1));
      screens.push({ m });
      continue;
    }
    if (rand() > 0.6) continue;
    const count = Math.max(1, Math.min(3, Math.floor(f.len / 14)));
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count + (rand() - 0.5) * 0.15;
      const px = f.a[0] + (f.b[0] - f.a[0]) * t;
      const pz = f.a[1] + (f.b[1] - f.a[1]) * t;
      const blade = rand() < 0.4;
      const tall = blade || rand() < 0.3;
      const sw = tall ? 1.2 + rand() * 0.6 : Math.min(f.len * 0.5, 2.5 + rand() * 4);
      const sh = tall ? 3 + rand() * 3 : 0.9 + rand() * 1.2;
      const y = Math.min(f.top - sh / 2 - 0.5, 6.2 + sh / 2 + rand() * 4);
      const m = new THREE.Matrix4();
      if (blade) {
        m.makeBasis(out, new THREE.Vector3(0, 1, 0), along);
        m.setPosition(px + out.x * (0.4 + sw / 2), y, pz + out.z * (0.4 + sw / 2));
      } else {
        m.makeBasis(along.clone().negate(), new THREE.Vector3(0, 1, 0), out);
        m.setPosition(px + out.x * 0.15, y, pz + out.z * 0.15);
      }
      m.scale(new THREE.Vector3(sw, sh, 1));
      signs.push({ m, col: new THREE.Color(L.neon[Math.floor(rand() * L.neon.length)]), tall });
    }
  }
  const group = new THREE.Group();
  for (const tall of [false, true]) {
    const list = signs.filter((s) => s.tall === tall);
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), signMaterial(tall, flash), list.length);
    list.forEach((s, i) => {
      mesh.setMatrixAt(i, s.m);
      mesh.setColorAt(i, s.col);
    });
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  if (screens.length) {
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), screenMaterial(), screens.length);
    screens.forEach((s, i) => mesh.setMatrixAt(i, s.m));
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  if (media.length) {
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mediaMaterial(), media.length);
    media.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

/**
 * A building-sized LED media wall: the picture is laid out in world space (along x + z and up), so it
 * flows across all the panels of a curved facade. Slow colour fields, a sweeping light and big shapes.
 */
function mediaMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const along = positionWorld.x.sub(positionWorld.z).mul(0.025);
  const up = positionWorld.y.mul(0.06);
  const slide = floor(time.div(8));
  const hs = hash(slide.add(4.2));
  const field = sin(along.mul(2.2).add(time.mul(0.35)).add(hs.mul(6))).mul(sin(up.mul(3).sub(time.mul(0.25)).add(along))).mul(0.5).add(0.5);
  const base = mix(mix(vec3(...L.screenA), vec3(...L.screenB), field), vec3(...L.screenC), smoothstep(0.6, 1, hs).mul(field));
  const sweep = smoothstep(0.1, 0.0, fract(along.mul(0.5).sub(time.mul(0.08))).sub(0.5).abs());
  const shape = step(0.55, sin(along.mul(1.3).add(hs.mul(9))).mul(0.5).add(0.5).mul(step(0.3, fract(up.mul(0.5)))));
  const pixel = step(0.12, fract(positionWorld.y.mul(8))).mul(0.3).add(0.7);
  m.colorNode = base.mul(field.mul(0.8).add(0.4)).add(base.mul(shape.mul(0.8))).add(vec3(1).mul(sweep.mul(0.35))).mul(pixel).mul(2.2);
  return m;
}

/** Neon signs: a glowing border and blocky "lettering" that flickers now and then. */
function signMaterial(tall: boolean, flash: Flash) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const p = uv();
  const seed = float(instanceIndex).mul(7.31);
  const inside = step(0.07, p.x).mul(step(p.x, 0.93)).mul(step(0.07, p.y)).mul(step(p.y, 0.93));
  const border = float(1).sub(inside);
  const cols = tall ? 1 : 5;
  const rows = tall ? 5 : 1;
  const gp = vec2(p.x.sub(0.12).div(0.76).mul(cols), p.y.sub(0.15).div(0.7).mul(rows));
  const inGrid = step(0.0, gp.x).mul(step(gp.x, cols)).mul(step(0.0, gp.y)).mul(step(gp.y, rows));
  const sub = floor(fract(gp).mul(3));
  const letter = floor(gp);
  const bit = step(0.42, hash(sub.x.add(sub.y.mul(3)).add(letter.x.mul(11)).add(letter.y.mul(23)).add(seed)));
  const pad = fract(gp.mul(3));
  const block = step(0.12, pad.x).mul(step(pad.x, 0.88)).mul(step(0.12, pad.y)).mul(step(pad.y, 0.88));
  const glyph = bit.mul(block).mul(inGrid);
  const flicker = float(1).sub(step(0.97, hash(floor(time.mul(9)).add(seed))).mul(0.75));
  m.colorNode = vec3(1, 1, 1).mul(border.mul(1.7).add(glyph.mul(1.35)).add(0.1).mul(flicker)).add(flash.mul(0.5));
  return m;
}

/** LED screens: slow colour fields, a sweeping band and blocky "headlines", changing every few seconds. */
function screenMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const p = uv();
  const seed = float(instanceIndex).mul(3.7);
  const slide = floor(time.div(6).add(hash(seed)));
  const hs = hash(slide.add(seed.mul(17)));
  const field = sin(p.x.mul(3).add(time.mul(0.7)).add(hs.mul(6))).mul(sin(p.y.mul(2.3).sub(time.mul(0.5)))).mul(0.5).add(0.5);
  const base = mix(vec3(...L.screenA), vec3(...L.screenB), field).mul(mix(0.6, 1.2, hs));
  const band = smoothstep(0.08, 0.0, fract(p.x.sub(time.mul(0.15))).sub(0.5).abs());
  const headline = step(0.62, p.y).mul(step(p.y, 0.78)).mul(step(0.1, p.x)).mul(step(p.x, mix(0.5, 0.9, hs)));
  const pixel = step(0.15, fract(p.x.mul(160))).mul(step(0.15, fract(p.y.mul(90)))).mul(0.25).add(0.75);
  const border = float(1).sub(step(0.015, p.x).mul(step(p.x, 0.985)).mul(step(0.025, p.y)).mul(step(p.y, 0.975)));
  m.colorNode = base.add(vec3(1).mul(band.mul(0.4))).add(vec3(1).mul(headline.mul(0.9))).mul(pixel).mul(1.6).mul(float(1).sub(border)).add(vec3(0.02).mul(border));
  return m;
}
