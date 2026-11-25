// Builds the street-level scene for the rainy walk: wet ground with reflections and ripples,
// buildings with lit windows and shopfronts, neon signs, street lamps and trees.
// Everything static is merged into a few meshes; repeated props are instanced.

import * as THREE from 'three/webgpu';
import {
  abs, attribute, cameraPosition, float, floor, fract, hash, instanceIndex, length, max, mix, mx_noise_float,
  normalGeometry, normalize, positionWorld, pow, reflector, screenUV, smoothstep, step, time, uniform, uv,
  vec2, vec3,
} from 'three/tsl';
import type { MapData } from '../world/mapData.ts';
import { distToLine, normals, offsetLine, resample, type Pt, type WalkRoute } from './path.ts';
import { RAIN_LOOK } from './look.ts';

/** Small seeded random number generator, so the street looks the same on every visit. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Accumulates triangles for one merged mesh. */
class Geo {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  extra: number[] = [];
  idx: number[] = [];

  vert(x: number, y: number, z: number, n: [number, number, number], c: THREE.Color, e: [number, number]) {
    this.pos.push(x, y, z);
    this.nor.push(...n);
    this.col.push(c.r, c.g, c.b);
    this.extra.push(...e);
    return this.pos.length / 3 - 1;
  }

  build(extraName: string) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute(extraName, new THREE.Float32BufferAttribute(this.extra, 2));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const UP: [number, number, number] = [0, 1, 0];

/** Lightning brightness, shared by the shaders that light up with it. */
const makeFlash = () => uniform(0);
export type Flash = ReturnType<typeof makeFlash>;

/** A flat strip along a line. `kind` goes to the shader (0 ground, 1 pavement, 2 road, 3 paint). */
function ribbon(g: Geo, line: Pt[], width: number, y: number, c: THREE.Color, kind: number) {
  if (line.length < 2) return;
  const n = normals(line);
  const start = g.pos.length / 3;
  for (let i = 0; i < line.length; i++) {
    const [x, z] = line[i];
    const [nx, nz] = n[i];
    g.vert(x + (nx * width) / 2, y, z + (nz * width) / 2, UP, c, [kind, 0]);
    g.vert(x - (nx * width) / 2, y, z - (nz * width) / 2, UP, c, [kind, 0]);
  }
  for (let i = 0; i < line.length - 1; i++) {
    const a = start + i * 2;
    g.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

/** Dashes along a line (`on` metres painted, `off` metres gap). */
function dashes(g: Geo, line: Pt[], width: number, y: number, c: THREE.Color, on: number, off: number) {
  const pts = resample(line, 0.5);
  let piece: Pt[] = [];
  pts.forEach((p, i) => {
    const d = (i * 0.5) % (on + off);
    if (d < on) piece.push(p);
    else if (piece.length) {
      ribbon(g, piece, width, y, c, 3);
      piece = [];
    }
  });
  ribbon(g, piece, width, y, c, 3);
}

export interface Street {
  group: THREE.Group;
  /** Lamp head positions (for the moving point lights). */
  lamps: THREE.Vector3[];
  /** 0 to 1: how bright the lightning is right now. */
  flash: Flash;
}

export interface StreetQuality {
  reflectionScale: number;
  lights: number;
}

export function buildStreet(map: MapData, route: WalkRoute, q: StreetQuality): Street {
  const L = RAIN_LOOK;
  const group = new THREE.Group();
  const rand = rng(1965);
  const flash = makeFlash();
  const mid = route.walk[Math.floor(route.walk.length / 2)];
  const reach = 340;
  const roadsNear = map.roads.filter((r) => {
    for (let i = 0; i < r.p.length; i += 2) if (distToLine(r.p[i], r.p[i + 1], route.centre) < reach) return true;
    return false;
  });

  // ---- Ground: one merged mesh, wet and reflective.
  const ground = new Geo();
  const c = (hex: string) => new THREE.Color(hex);
  const S = 1400;
  const base = ground.pos.length / 3;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ground.vert(mid[0] + (dx * S) / 2, 0, mid[1] + (dz * S) / 2, UP, c(L.ground), [0, 0]);
  ground.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  const pts = (p: number[]) => {
    const out: Pt[] = [];
    for (let i = 0; i < p.length; i += 2) out.push([p[i], p[i + 1]]);
    return out;
  };
  for (const r of roadsNear) {
    const line = pts(r.p);
    if (r.k === 'foot' || r.k === 'pedestrian') ribbon(ground, line, r.w, 0.03, c(L.pavement), 1);
    else {
      ribbon(ground, line, r.w + 7, 0.02, c(L.pavement), 1);
      ribbon(ground, line, r.w, 0.05, c(L.asphalt), 2);
    }
  }
  // The walked street gets wide pavements, kerbs and lane paint.
  const w = route.width;
  ribbon(ground, route.centre, w + 22, 0.025, c(L.pavement), 1);
  ribbon(ground, route.centre, w, 0.06, c(L.asphalt), 2);
  for (const s of [-1, 1]) ribbon(ground, offsetLine(route.centre, s * (w / 2 + 0.2)), 0.4, 0.065, c(L.kerb), 1);
  const lanes = Math.max(2, Math.round(w / 3.4));
  for (let k = 1; k < lanes; k++) dashes(ground, offsetLine(route.centre, -w / 2 + (k * w) / lanes), 0.14, 0.07, c(L.paint), 3, 6);
  for (const s of [-1, 1]) ribbon(ground, offsetLine(route.centre, s * (w / 2 - 0.5)), 0.12, 0.07, c(L.paint), 3);

  const wet = groundMaterial(q);
  group.add(new THREE.Mesh(ground.build('aKind'), wet.material), wet.mirror);

  // ---- Buildings: extruded footprints with real heights.
  const walls = new Geo();
  const near = map.buildings.filter((b) => {
    for (let i = 0; i < b.p.length; i += 2) if (distToLine(b.p[i], b.p[i + 1], route.centre) < reach) return true;
    return false;
  });
  const wallCols = L.walls.map((h) => c(h));
  const signs: { m: THREE.Matrix4; col: THREE.Color; tall: boolean }[] = [];
  near.forEach((b, bi) => {
    const ring = pts(b.p);
    // Wind the ring the same way for every building, so wall normals point outwards.
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i];
      const [x1, z1] = ring[(i + 1) % ring.length];
      area += x0 * z1 - x1 * z0;
    }
    if (area < 0) ring.reverse();
    const h = Math.max(b.h, 6);
    const col = wallCols[Math.floor(rand() * wallCols.length)];
    const seed = (bi * 0.6180339) % 1;
    let u = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i];
      const [x1, z1] = ring[(i + 1) % ring.length];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.01) continue;
      // The ring now has a positive area in x/z (clockwise seen from above, as z points south),
      // so (dz, -dx) points out of the building.
      const nx = (z1 - z0) / len;
      const nz = -(x1 - x0) / len;
      const n: [number, number, number] = [nx, 0, nz];
      const a = walls.vert(x0, 0, z0, n, col, [u, seed]);
      walls.vert(x1, 0, z1, n, col, [u + len, seed]);
      walls.vert(x0, h, z0, n, col, [u, seed]);
      walls.vert(x1, h, z1, n, col, [u + len, seed]);
      walls.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);

      // Neon signs on walls that face the walk.
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      const dWalk = distToLine(mx, mz, route.walk);
      if (len > 4 && dWalk < 75 && h > 8) {
        const toWalk = nearestPoint(mx, mz, route.walk);
        const facing = (toWalk[0] - mx) * nx + (toWalk[1] - mz) * nz;
        if (facing > 0.2 * Math.hypot(toWalk[0] - mx, toWalk[1] - mz) && rand() < 0.9) {
          const count = Math.max(1, Math.min(4, Math.floor(len / 11)));
          for (let k = 0; k < count; k++) {
            const t = (k + 0.5) / count + (rand() - 0.5) * 0.2;
            const px = x0 + (x1 - x0) * t;
            const pz = z0 + (z1 - z0) * t;
            const blade = rand() < 0.45;
            const tall = blade || rand() < 0.35;
            const sw = tall ? 1.3 + rand() * 0.8 : Math.min(len * 0.6, 3 + rand() * 5);
            const sh = tall ? 3.5 + rand() * 4 : 1.1 + rand() * 1.6;
            const y = Math.min(h - sh / 2 - 0.5, 5.2 + sh / 2 + rand() * 8);
            const m = new THREE.Matrix4();
            const along = new THREE.Vector3((x1 - x0) / len, 0, (z1 - z0) / len);
            const out = new THREE.Vector3(nx, 0, nz);
            if (blade) {
              // Sticks out from the wall, readable from up and down the street.
              m.makeBasis(out, new THREE.Vector3(0, 1, 0), along);
              m.setPosition(px + nx * (0.4 + sw / 2), y, pz + nz * (0.4 + sw / 2));
            } else {
              m.makeBasis(along.clone().negate(), new THREE.Vector3(0, 1, 0), out);
              m.setPosition(px + nx * 0.12, y, pz + nz * 0.12);
            }
            m.scale(new THREE.Vector3(sw, sh, 1));
            signs.push({ m, col: c(L.neon[Math.floor(rand() * L.neon.length)]), tall });
          }
        }
      }
      u += len;
    }
    // Flat roof.
    const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const r0 = walls.pos.length / 3;
    const roofCol = c(L.roof);
    for (const [x, z] of ring) walls.vert(x, h, z, UP, roofCol, [0, -1]);
    // triangulateShape winds triangles to match the contour; flip so they face up.
    for (const [a, b2, c2] of tris) walls.idx.push(r0 + a, r0 + c2, r0 + b2);
  });
  group.add(new THREE.Mesh(walls.build('aFacade'), buildingMaterial()));

  // ---- Neon signs (two instanced meshes: wide and tall, with differently shaped "lettering").
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

  // ---- Street lamps along both kerbs of the walked street.
  const lamps: THREE.Vector3[] = [];
  const lampMats: THREE.Matrix4[] = [];
  const headMats: THREE.Matrix4[] = [];
  for (const s of [-1, 1]) {
    const kerbLine = resample(offsetLine(route.centre, s * (w / 2 + 1.2)), 30);
    const n = normals(kerbLine);
    kerbLine.forEach(([x, z], i) => {
      const inward = new THREE.Vector3(-n[i][0] * s, 0, -n[i][1] * s);
      lampMats.push(new THREE.Matrix4().makeTranslation(x, 4.5, z));
      const head = new THREE.Vector3(x, 8.8, z).addScaledVector(inward, 1.8);
      const hm = new THREE.Matrix4().lookAt(new THREE.Vector3(), inward, new THREE.Vector3(0, 1, 0));
      hm.setPosition(head.x - inward.x * 0.9, 8.95, head.z - inward.z * 0.9);
      headMats.push(hm);
      lamps.push(head);
    });
  }
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.14, 9, 6), new THREE.MeshStandardNodeMaterial({ color: L.pole, roughness: 0.5, metalness: 0.6 }), lampMats.length);
  lampMats.forEach((m, i) => poles.setMatrixAt(i, m));
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 2.1), poles.material, headMats.length);
  headMats.forEach((m, i) => arms.setMatrixAt(i, m));
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, 0.9), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(L.lamp).multiplyScalar(3) }), lamps.length);
  lamps.forEach((p, i) => heads.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  for (const m of [poles, arms, heads]) {
    m.frustumCulled = false;
    group.add(m);
  }

  // ---- Trees: any mapped in OpenStreetMap, plus a row along each kerb (OSM has none mapped on this
  // stretch, but Orchard Road is lined with big rain trees).
  const trees: Pt[] = [];
  for (const s of [-1, 1]) {
    for (const [x, z] of resample(offsetLine(route.centre, s * (w / 2 + 1.6)), 12)) {
      const p: Pt = [x + (rand() - 0.5) * 2, z + (rand() - 0.5) * 2];
      if (lamps.every((l) => Math.hypot(l.x - p[0], l.z - p[1]) > 5) && distToLine(p[0], p[1], route.walk) > 2.5) trees.push(p);
    }
  }
  for (let i = 0; i < map.trees.length; i += 2) {
    const x = map.trees[i];
    const z = map.trees[i + 1];
    if (distToLine(x, z, route.centre) < reach * 0.6 && distToLine(x, z, route.walk) > 2) trees.push([x, z]);
  }
  if (trees.length) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.38, 1, 6), new THREE.MeshStandardNodeMaterial({ color: L.trunk, roughness: 0.9 }), trees.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardNodeMaterial({ color: L.leaves, roughness: 0.7, flatShading: true }), trees.length);
    const tcol = new THREE.Color();
    trees.forEach(([x, z], i) => {
      const th = 5.5 + rand() * 3;
      const cr = 3.5 + rand() * 2.5;
      trunk.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, th / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, th, 1)));
      crown.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, th + cr * 0.4, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), new THREE.Vector3(cr * 1.3, cr * 0.75, cr * 1.3)));
      crown.setColorAt(i, tcol.setHSL(0.3 + rand() * 0.08, 0.35, 0.6 + rand() * 0.4));
    });
    for (const m of [trunk, crown]) {
      m.frustumCulled = false;
      group.add(m);
    }
  }

  return { group, lamps, flash };
}

function nearestPoint(x: number, z: number, line: Pt[]): Pt {
  let best: Pt = line[0];
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

/** Rain-drop rings on a grid of cells: returns (dx, dz, ring strength). */
function ripples(p: THREE.Node<'vec2'>, scale: number, speed: number, salt: number) {
  const q = p.mul(scale);
  const cell = floor(q);
  const f = fract(q).sub(0.5);
  const h = hash(cell.x.mul(17.13).add(cell.y.mul(311.7)).add(salt));
  const centre = vec2(hash(h.mul(91.3)), hash(h.mul(47.9))).sub(0.5).mul(0.5);
  const d = f.sub(centre);
  const r = length(d);
  const t = fract(time.mul(speed).add(h.mul(7)));
  const fadeOut = float(1).sub(t);
  // Only some cells have a drop landing at any moment.
  const active = step(0.45, hash(h.mul(13.7).add(floor(time.mul(speed).add(h.mul(7))))));
  const ring = smoothstep(0.035, 0.0, abs(r.sub(t.mul(0.42)))).mul(fadeOut.mul(fadeOut)).mul(active);
  const dir = d.div(max(r, 0.001));
  return vec3(dir.x.mul(ring), dir.y.mul(ring), ring);
}

/** Wet asphalt and paving: dark, glossy, with puddles that mirror the street and rain rings. */
function groundMaterial(q: StreetQuality) {
  const m = new THREE.MeshStandardNodeMaterial();
  const kind = attribute('aKind', 'vec2').x;
  const xz = positionWorld.xz;
  const big = mx_noise_float(vec3(xz.x.mul(0.07), 0, xz.y.mul(0.07)));
  const small = mx_noise_float(vec3(xz.x.mul(0.45), 3.1, xz.y.mul(0.45)));
  // Puddles collect on the road and the pavement, less on the open ground.
  const puddle = smoothstep(0.08, 0.3, big.add(small.mul(0.25))).mul(step(0.5, kind).mul(0.75).add(0.25));
  const rip = ripples(xz, 2.6, 1.1, 0.0).add(ripples(xz.add(vec2(0.37, 0.71)), 3.7, 1.4, 5.0));
  const wet = mix(0.22, 1.0, puddle);

  const base = attribute('color', 'vec3');
  // Wet surfaces are darker; paint stays brighter.
  m.colorNode = base.mul(mix(0.55, 0.3, puddle));
  m.roughnessNode = mix(float(0.42), float(0.06), puddle);
  m.metalnessNode = float(0);

  const refl = reflector({ resolutionScale: q.reflectionScale, generateMipmaps: true, bounces: false });
  refl.target.rotateX(-Math.PI / 2);
  // Ripples bend the mirror image; the rest of the wet surface smears it into vertical streaks.
  const ruv = screenUV.flipX().add(vec2(rip.x, rip.y).mul(0.018));
  const sharp = refl.sample(ruv);
  const smear = refl.sample(ruv.add(vec2(0, 0.012))).level(float(2.5))
    .add(refl.sample(ruv.add(vec2(0, 0.03))).level(float(3)))
    .add(refl.sample(ruv.sub(vec2(0, 0.012))).level(float(2.5)))
    .mul(1 / 3);
  const view = normalize(cameraPosition.sub(positionWorld));
  const fresnel = mix(float(0.06), float(1), pow(float(1).sub(max(view.y, 0)), 4));
  const mirror = mix(smear.rgb, sharp.rgb, puddle);
  m.emissiveNode = mirror.mul(fresnel).mul(wet).mul(0.7).add(vec3(...RAIN_LOOK.ripple).mul(rip.z.mul(0.05)));
  // The mirror plane (its target) has to be in the scene.
  return { material: m, mirror: refl.target };
}

/** Facades: wall colour, rows of windows (some lit), glowing shopfronts at street level. */
function buildingMaterial() {
  const L = RAIN_LOOK;
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, side: THREE.DoubleSide });
  const fa = attribute('aFacade', 'vec2');
  const u = fa.x;
  const seed = fa.y;
  const y = positionWorld.y;
  const wall = step(abs(normalGeometry.y), 0.5);
  const g = vec2(u.div(2.9), y.div(3.5));
  const cell = floor(g);
  const f = fract(g);
  const win = step(0.16, f.x).mul(step(f.x, 0.84)).mul(step(0.24, f.y)).mul(step(f.y, 0.8));
  const h1 = hash(cell.x.mul(12.9898).add(cell.y.mul(78.233)).add(seed.mul(1000)));
  const h2 = hash(h1.mul(43.7).add(seed));
  const upper = step(5.6, y);
  const lit = step(1 - L.windowsLit, h1);
  const winCol = mix(vec3(...L.warm), vec3(...L.cool), step(0.72, h2)).mul(h2.mul(0.8).add(0.4));
  // Shopfronts: a lit glass band at street level, broken by pillars.
  const bay = fract(u.div(7.5));
  const shop = step(0.35, y).mul(step(y, 4.3)).mul(step(0.07, bay)).mul(step(bay, 0.93));
  const shopOn = step(0.22, hash(floor(u.div(7.5)).add(seed.mul(531))));
  const shopHash = hash(floor(u.div(7.5)).add(seed.mul(97)));
  // Brighter towards the floor, like a lit display behind the glass.
  const shopCol = mix(vec3(...L.shopWarm), vec3(...L.shopCool), step(0.6, shopHash)).mul(shopHash.mul(0.6).add(0.3)).mul(float(1.2).sub(y.mul(0.18)));
  const canopy = step(4.3, y).mul(step(y, 4.75));
  const glassMask = win.mul(upper).add(shop).mul(wall);
  m.colorNode = mix(attribute('color', 'vec3').mul(0.45), vec3(...L.glass), glassMask.min(1));
  m.roughnessNode = mix(float(0.8), float(0.15), glassMask.min(1));
  m.emissiveNode = winCol.mul(win).mul(upper).mul(lit).mul(wall).mul(1.1)
    .add(shopCol.mul(shop).mul(shopOn).mul(wall))
    .add(vec3(...L.canopy).mul(canopy).mul(wall));
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
  // Each "letter" is a 3x3 block pattern.
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
