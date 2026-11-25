// Buildings for the walk, from the OSM 3D building parts in walk.json: walls with real heights and
// colours, flat/pyramid/mansard/dome roofs, canopies, and a facade shader that picks a style from the
// mapped material (punched windows, glass curtain wall, metal-clad mall podium). Lit windows and
// shopfronts use "interior mapping": a fake room behind the glass that shifts with the view.

import * as THREE from 'three/webgpu';
import {
  abs, attribute, cameraPosition, clamp, color, cross, dot, float, floor, fract, hash, length, max, min, mix,
  mx_noise_float, normalGeometry, normalize, positionWorld, pow, reflect, smoothstep, step, time, vec2, vec3,
} from 'three/tsl';
import { bbox, centroid, Geo, pts, rng, type V3 } from './geo3d.ts';
import { distToLine, type Pt } from './path.ts';
import type { Part } from './walkData.ts';
import { RAIN_LOOK as L } from './look.ts';

type F = THREE.Node<'float'>;
type V = THREE.Node<'vec3'>;

/** Facade styles (the shader's `style` value). */
export const STYLE = { punched: 0, glass: 1, podium: 2, fascia: 7, canopyUnder: 8, roof: 9 } as const;

/** A wall facing the street, for placing signs and screens. */
export interface Frontage {
  a: Pt;
  b: Pt;
  /** Outward normal. */
  n: Pt;
  len: number;
  base: number;
  top: number;
  style: number;
  /** Distance to the walking line. */
  dWalk: number;
  /** Building name, when mapped. */
  owner?: string;
}

const PARAPET = 1.1;

function pickStyle(part: Part, area: number, rand: () => number): number {
  if (part.m === 'glass') return STYLE.glass;
  if (part.m === 'metal') return STYLE.podium;
  // Big low blocks at street level are mall podiums: few windows.
  if (part.b < 1 && part.h <= 32 && area > 1500) return STYLE.podium;
  if (part.m === 'plain' && part.h > 45 && rand() < 0.35) return STYLE.glass;
  return STYLE.punched;
}

function wallColour(part: Part, style: number, rand: () => number) {
  if (part.c) return new THREE.Color(part.c);
  const list = style === STYLE.glass ? L.glassWalls : style === STYLE.podium ? L.podiumWalls : part.m === 'stone' ? L.stoneWalls : L.walls;
  return new THREE.Color(list[Math.floor(rand() * list.length)]);
}

export function buildBuildings(parts: Part[], walk: Pt[], reach: number, low: boolean) {
  const g = new Geo(8);
  const rand = rng(2024);
  const frontages: Frontage[] = [];
  const near = parts.filter((p) => {
    for (let i = 0; i < p.p.length; i += 2) if (distToLine(p.p[i], p.p[i + 1], walk) < reach) return true;
    return false;
  });

  near.forEach((part, pi) => {
    const ring = pts(part.p);
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i];
      const [x1, z1] = ring[(i + 1) % ring.length];
      area += x0 * z1 - x1 * z0;
    }
    if (area < 0) ring.reverse();
    area = Math.abs(area) / 2;
    const seed = (pi * 0.6180339 + 0.13) % 1;
    const ground = part.b < 1 ? 1 : 0;
    const wallCol = wallColour(part, pickStyle(part, area, rand), rand);
    const style = part.canopy ? STYLE.fascia : pickStyle(part, area, rand);
    const roofCol = part.rc ? new THREE.Color(part.rc) : new THREE.Color(L.roof);
    const top = part.h;
    // Canopies are thin slabs; buildings get walls, with a parapet above flat roofs.
    const wallBase = part.canopy ? top - 0.4 : part.b;
    const wallTop = part.canopy ? top : top + (part.r === 'flat' && top > 8 ? PARAPET : 0);
    const e = (u: number, st = style) => [u, seed, st, part.b, top, ground, 0, 0];

    let u = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i];
      const [x1, z1] = ring[(i + 1) % ring.length];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) continue;
      // Positive area in x/z with z south: (dz, -dx) points out of the building.
      const nx = (z1 - z0) / len;
      const nz = -(x1 - x0) / len;
      const n: V3 = [nx, 0, nz];
      g.quad([x0, wallBase, z0], [x1, wallBase, z1], [x1, wallTop, z1], [x0, wallTop, z0], n, wallCol, e(u), e(u + len), e(u + len), e(u));
      if (!part.canopy && len > 6) {
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;
        const dWalk = distToLine(mx, mz, walk);
        frontages.push({ a: [x0, z0], b: [x1, z1], n: [nx, nz], len, base: part.b, top, style, dWalk, owner: part.o });
      }
      u += len;
    }

    // Roofs.
    const roofE = e(0, STYLE.roof);
    const c = centroid(part.p);
    const ringAt = (y: number, s: number): V3[] => ring.map(([x, z]) => [c[0] + (x - c[0]) * s, y, c[1] + (z - c[1]) * s]);
    const cap = (r3: V3[], st: number, col: THREE.Color, down = false) => {
      const tris = THREE.ShapeUtils.triangulateShape(r3.map((p) => new THREE.Vector2(p[0], p[2])), []);
      for (const [a, b, cc] of tris) {
        const t: [V3, V3, V3] = [r3[a], r3[b], r3[cc]];
        // Face up (or down for the underside of a canopy).
        const ny = (t[1][2] - t[0][2]) * (t[2][0] - t[0][0]) - (t[1][0] - t[0][0]) * (t[2][2] - t[0][2]);
        if (ny < 0 !== down) t.reverse();
        g.tri(t[0], t[1], t[2], col, e(0, st));
      }
    };
    const outward = (a: V3, b: V3, cc: V3) => {
      // Order a slanted face so its normal points out and up.
      const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const ac = new THREE.Vector3(cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]);
      const nrm = ab.cross(ac);
      const mid = new THREE.Vector3((a[0] + b[0]) / 2 - c[0], 0, (a[2] + b[2]) / 2 - c[1]);
      return nrm.dot(mid) + nrm.y >= 0;
    };
    const slope = (lo: V3[], hi: V3[]) => {
      for (let i = 0; i < lo.length; i++) {
        const j = (i + 1) % lo.length;
        for (const [a, b, cc] of [[lo[i], lo[j], hi[j]], [lo[i], hi[j], hi[i]]] as [V3, V3, V3][]) {
          if (outward(a, b, cc)) g.tri(a, b, cc, roofCol, roofE);
          else g.tri(a, cc, b, roofCol, roofE);
        }
      }
    };

    if (part.canopy) {
      cap(ringAt(top, 1), STYLE.roof, roofCol);
      cap(ringAt(top - 0.4, 1), STYLE.canopyUnder, wallCol, true);
    } else if (part.r === 'pyramid') {
      const apex: V3 = [c[0], top + part.rh, c[1]];
      slope(ringAt(top, 1), ring.map(() => apex));
    } else if (part.r === 'dome') {
      let lo = ringAt(top, 1);
      for (let k = 1; k <= 4; k++) {
        const a = (k / 4) * (Math.PI / 2);
        const hi = ringAt(top + Math.sin(a) * part.rh, Math.max(0.04, Math.cos(a)));
        slope(lo, hi);
        lo = hi;
      }
      cap(lo, STYLE.roof, roofCol);
    } else if (part.r === 'mansard' || part.r === 'gable') {
      const hi = ringAt(top + part.rh, part.r === 'gable' ? 0.25 : 0.6);
      slope(ringAt(top, 1), hi);
      cap(hi, STYLE.roof, roofCol);
    } else {
      cap(ringAt(top, 1), STYLE.roof, roofCol);
      // Inside face of the parapet.
      if (wallTop > top) {
        const inner = ringAt(top, 1);
        for (let i = 0; i < inner.length; i++) {
          const a = inner[i];
          const b = inner[(i + 1) % inner.length];
          g.quad([a[0], top, a[2]], [a[0], wallTop, a[2]], [b[0], wallTop, b[2]], [b[0], top, b[2]], [0, 1, 0], roofCol, roofE);
        }
      }
    }
  });

  const mesh = new THREE.Mesh(g.build('aFacade', 'aFacade2'), facadeMaterial(low));
  mesh.frustumCulled = false;
  const box = bbox(near.flatMap((p) => p.p));
  return { mesh, frontages, count: near.length, box };
}

// ------------------------------------------------------------------------------------------
// Facade shader.

const vec = (c: number[]) => vec3(c[0], c[1], c[2]);
const is = (style: F, k: number) => step(abs(style.sub(k)), 0.5);

/**
 * A room behind a window. (px, py): point on the glass in room coordinates (metres, 0..W, 0..H);
 * (vx, vy, vz): view ray in the wall's frame (along the wall, up, into the building).
 * Returns the colour seen: back wall, side walls, floor and a lit ceiling, darker further in.
 */
function room(px: F, py: F, W: number, H: number, D: number, vx: F, vy: F, vz: F, tint: V, seed: F, shop = false): V {
  const ivx = float(1).div(vx.add(1e-5));
  const ivy = float(1).div(vy.add(1e-5));
  const tx = max(float(W).sub(px).mul(ivx), px.negate().mul(ivx));
  const ty = max(float(H).sub(py).mul(ivy), py.negate().mul(ivy));
  const tz = float(D).div(max(vz, 0.05));
  const t = min(min(tx, ty), tz);
  const hx = px.add(vx.mul(t));
  const hy = py.add(vy.mul(t));
  const hz = vz.mul(t).div(D).clamp(0, 1);
  const back = step(tz, min(tx, ty));
  const yHit = float(1).sub(back).mul(step(ty, tx));
  const floorHit = yHit.mul(step(vy, 0));
  const ceil = yHit.sub(floorHit);
  const side = float(1).sub(back).sub(yHit);
  const lamp = smoothstep(0.45, 0.0, length(vec2(hx.div(W).sub(0.5), hz.sub(0.5))));
  const shade = back.mul(0.85).add(side.mul(0.62)).add(floorHit.mul(0.38)).add(ceil.mul(lamp.mul(1.6).add(0.75)));
  // A dark piece of furniture against the back wall, placed differently in each room.
  const fx = hash(seed.add(3.1)).mul(0.5);
  const furn = back.mul(step(hy, float(H).mul(hash(seed.add(1.7)).mul(0.25).add(0.2)))).mul(step(float(W).mul(fx), hx)).mul(step(hx, float(W).mul(fx.add(0.4))));
  let col = tint.mul(shade).mul(mix(1, 0.5, hz)).mul(float(1).sub(furn.mul(0.75)));
  if (shop) {
    // Shops: a bright poster on the back wall, racks along the sides, a display table in front.
    const hp = hash(seed.add(9.3));
    const poster = back.mul(step(float(W).mul(0.3), hx)).mul(step(hx, float(W).mul(0.7))).mul(step(float(H).mul(0.35), hy)).mul(step(hy, float(H).mul(0.85)));
    const posterCol = mix(mix(vec3(...L.posterA), vec3(...L.posterB), step(0.5, hp)), vec3(...L.posterC), step(0.8, hp));
    const racks = side.mul(step(fract(hy.mul(2.2)), 0.06)).mul(0.5);
    col = mix(col, posterCol.mul(1.6), poster).mul(float(1).sub(racks.mul(0.6)));
  }
  return col;
}

function facadeMaterial(low: boolean) {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
  const fa = attribute('aFacade', 'vec4');
  const fb = attribute('aFacade2', 'vec4');
  const u = fa.x;
  const seed = fa.y;
  const style = fa.z;
  const base = fa.w;
  const top = fb.x;
  const ground = fb.y;
  const y = positionWorld.y;
  const N = normalGeometry;
  const T = normalize(cross(N, vec3(0, 1, 0)).add(vec3(1e-4, 0, 0)));
  const wall = step(abs(N.y), 0.3);
  const Vw = normalize(positionWorld.sub(cameraPosition));
  const vx = dot(Vw, T);
  const vy = Vw.y;
  const vz = dot(Vw, N).negate();
  const albedo = attribute('color', 'vec3');

  // Fake reflection of the night sky and the glow of the city, for glass.
  const R = reflect(Vw, N);
  const env = mix(color(L.sky[1]), color(L.sky[0]), pow(clamp(R.y, 0, 1), 0.6)).add(color(L.cityGlow).mul(smoothstep(0.25, -0.1, R.y)));
  const fres = mix(float(0.08), float(0.9), pow(float(1).sub(abs(vz)), 3));

  const below = step(y, top); // not the parapet
  const shopZone = ground.mul(step(y, 4.8)).mul(wall);
  const fasciaZone = ground.mul(step(4.8, y)).mul(step(y, 5.6)).mul(wall);
  const upperStart = max(base, ground.mul(5.6));
  const upper = step(upperStart, y).mul(below).mul(wall).mul(float(1).sub(shopZone)).mul(float(1).sub(fasciaZone));

  // ---- Punched windows (concrete and stone): 3.2 m bays, 3.6 m floors.
  const W = 3.2;
  const H = 3.6;
  const ly = y.sub(base);
  const g = vec2(u.div(W), ly.div(H));
  const cell = floor(g);
  const f = fract(g);
  const win = step(0.2, f.x).mul(step(f.x, 0.8)).mul(step(0.24, f.y)).mul(step(f.y, 0.84));
  const frame = step(0.16, f.x).mul(step(f.x, 0.84)).mul(step(0.2, f.y)).mul(step(f.y, 0.88)).sub(win);
  const sill = step(0.17, f.y).mul(step(f.y, 0.2)).mul(step(0.14, f.x)).mul(step(f.x, 0.86));
  const h1 = hash(cell.x.mul(12.9898).add(cell.y.mul(78.233)).add(seed.mul(1000)));
  const h2 = hash(h1.mul(43.7).add(seed));
  const lit = step(1 - L.windowsLit, h1);
  const curtain = step(h2, 0.35);
  const roomTint = mix(vec(L.warm), vec(L.cool), step(0.75, h2)).mul(h2.mul(0.5).add(0.6));
  const winRoom = low
    ? roomTint.mul(0.8)
    : room(f.x.mul(W), f.y.mul(H), W, H, 4.5, vx, vy, vz, roomTint, h1.mul(91));
  const winLight = mix(winRoom, roomTint.mul(vec3(1, 0.85, 0.7)).mul(0.9), curtain).mul(lit);
  const punched = is(style, STYLE.punched).mul(upper);

  // ---- Glass curtain wall: mullions every 1.6 m, opaque floor bands, open-plan floors behind.
  const gW = 9.6;
  const gH = 3.9;
  const gg = vec2(u.div(gW), ly.div(gH));
  const gcell = floor(gg);
  const gf = fract(gg);
  const mullion = step(fract(u.div(1.6)), 0.04).add(step(gf.y, 0.13)).min(1);
  const gh = hash(gcell.x.mul(7.1).add(gcell.y.mul(131.3)).add(seed.mul(500)));
  const glit = step(0.62, gh);
  const officeTint = mix(vec(L.office), vec(L.warm), step(0.8, hash(gh.mul(9.1)))).mul(0.85);
  const officeRoom = low ? officeTint.mul(0.7) : room(gf.x.mul(gW), gf.y.mul(gH), gW, gH, 9, vx, vy, vz, officeTint, gh.mul(37));
  const glass = is(style, STYLE.glass).mul(upper);

  // ---- Metal-clad mall podium: panel seams, an up-lit wash and a few light strips.
  const seams = step(fract(y.div(1.2)), 0.03).add(step(fract(u.div(3)), 0.015)).min(1);
  const podium = is(style, STYLE.podium).mul(upper);
  const wash = smoothstep(10, 0, y.sub(upperStart)).mul(0.1);
  const strip = step(fract(u.div(14).add(seed)), 0.012).mul(step(0.5, hash(floor(u.div(14)).add(seed.mul(77)))));

  // ---- Shopfronts at street level: 6 m bays between pillars, a lit shop behind each, some shuttered.
  const bayW = 6;
  const bay = fract(u.div(bayW));
  const bayId = floor(u.div(bayW));
  const pillar = step(bay, 0.07).add(step(0.93, bay)).min(1);
  const glassBand = step(0.3, y).mul(step(y, 4.4)).mul(float(1).sub(pillar));
  const sh = hash(bayId.add(seed.mul(531)));
  const shutter = step(sh, 0.18);
  const shopTint = mix(mix(vec(L.shopWarm), vec(L.shopCool), step(0.45, hash(sh.mul(17.3)))), vec(L.shopAccent), step(0.8, hash(sh.mul(5.7)))).mul(hash(sh.mul(2.9)).mul(0.6).add(0.55));
  const shopRoom = low ? shopTint.mul(0.6) : room(bay.mul(bayW), y.sub(0.3), bayW, 4.1, 7, vx, vy, vz, shopTint, sh.mul(53), true);
  const shutterCol = vec3(0.12, 0.12, 0.13).mul(step(fract(y.mul(5)), 0.8).mul(0.4).add(0.6));
  const shop = shopZone.mul(glassBand);

  // ---- Weathering: rain stains running down from ledges, grime near the ground.
  const streak = mx_noise_float(vec3(u.mul(1.3), y.mul(0.06), seed.mul(13)));
  const stain = float(1).sub(smoothstep(0.1, 0.7, streak).mul(0.28));
  const grime = mix(0.55, 1, smoothstep(0, 2.2, y.sub(base)));
  const wet = mx_noise_float(vec3(u.mul(0.2), y.mul(0.3).add(time.mul(0.5)), seed));
  const plainWall = albedo.mul(stain).mul(grime).mul(0.4);

  // Downlights in a 4 m grid under canopies.
  const dl = fract(positionWorld.xz.div(4)).sub(0.5);
  const downlights = smoothstep(0.12, 0.0, length(dl));

  // Base colour: dark glass where there are windows, otherwise the wall.
  const isWin = punched.mul(win).add(shop).add(glass.mul(float(1).sub(mullion))).min(1);
  const isRoof = is(style, STYLE.roof);
  m.colorNode = mix(
    mix(plainWall.mul(float(1).sub(frame.mul(punched).mul(0.5))).add(vec3(0.05).mul(sill.mul(punched))), vec(L.glass), isWin)
      .mul(float(1).sub(seams.mul(podium).mul(0.5))),
    albedo.mul(0.5),
    isRoof,
  );
  m.roughnessNode = mix(mix(float(0.55), float(0.32), smoothstep(-0.2, 0.6, wet)), float(0.08), isWin);
  m.metalnessNode = podium.mul(0.5);

  const glassEnv = env.mul(fres);
  const emissive = winLight.mul(1.25).mul(win).mul(punched)
    .add(glassEnv.mul(0.5).mul(win).mul(punched).mul(float(1).sub(lit)))
    .add(officeRoom.mul(glit).mul(1.1).add(glassEnv.mul(mix(vec3(1), albedo.mul(2), 0.5)).mul(0.7)).mul(glass).mul(float(1).sub(mullion)))
    .add(vec(L.podiumWash).mul(wash).add(vec(L.podiumStrip).mul(strip).mul(2.5)).mul(podium))
    .add(mix(shopRoom.mul(0.6).add(glassEnv.mul(0.25)), shutterCol, shutter).mul(shop))
    .add(vec(L.fascia).mul(step(fract(y.sub(4.8).div(0.8)), 0.12)).mul(fasciaZone).mul(1.5))
    .add(vec(L.canopyLight).mul(is(style, STYLE.canopyUnder)).mul(downlights.mul(3).add(0.02)));
  m.emissiveNode = emissive;
  return m;
}
