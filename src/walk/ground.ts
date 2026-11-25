// The ground for the walk: Orchard Road's carriageway with its real lane count and bus lane, raised
// kerbs and gutters, tiled pavements, crossings and stop lines where OSM has them, side streets, and a
// wet shader with puddles (in gutters and wheel ruts), mirror reflections and rain rings.

import * as THREE from 'three/webgpu';
import {
  abs, attribute, cameraPosition, float, floor, fract, hash, length, max, mix, mx_noise_float, normalGeometry,
  normalize, positionWorld, pow, reflector, screenUV, smoothstep, step, time, vec2, vec3,
} from 'three/tsl';
import { dashes, Geo, pieces, pts, ribbon, UP } from './geo3d.ts';
import { distToLine, normals, offsetLine, resample, type Pt, type WalkRoute } from './path.ts';
import type { WalkData } from './walkData.ts';
import { RAIN_LOOK as L } from './look.ts';

/** Height of Orchard Road's raised pavements. */
export const KERB = 0.15;

/** Ground kinds (first value of the aGround attribute). */
const K = { ground: 0, pavement: 1, road: 2, paint: 3, gutter: 4, kerb: 5, busPaint: 6, tactile: 7 } as const;

export interface Signal {
  /** Where the pole stands, and the direction the vehicle lights face (towards oncoming traffic). */
  x: number;
  z: number;
  face: Pt;
  /** True for the pedestrian light at a crossing end. */
  ped: boolean;
}

export function buildGround(data: WalkData, route: WalkRoute, reach: number, reflectionScale: number) {
  const g = new Geo(4);
  const col = (hex: string) => new THREE.Color(hex);
  const { centre, width: w } = route;
  const mid = centre[Math.floor(centre.length / 2)];

  // Open ground under everything.
  const S = 1600;
  const b = g.pos.length / 3;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = mid[0] + (dx * S) / 2;
    const z = mid[1] + (dz * S) / 2;
    g.vert(x, 0, z, UP, col(L.ground), [K.pavement, x, z, 0]);
  }
  g.idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);

  // Side streets (flat, with flat pavements).
  const near = (p: number[]) => {
    for (let i = 0; i < p.length; i += 2) if (distToLine(p[i], p[i + 1], centre) < reach) return true;
    return false;
  };
  const side = data.roads.filter((r) => r.n !== 'Orchard Road' && near(r.p));
  for (const r of side) {
    const line = pts(r.p);
    if (r.w > 5) ribbon(g, line, r.w + 6, 0.03, col(L.pavement), K.pavement);
    ribbon(g, line, r.w, 0.05, col(L.asphalt), K.road);
  }

  // Where side streets (not driveways) meet Orchard Road, the kerb and pavement stop.
  const mouths = side.filter((r) => r.w > 5);
  const n = normals(centre);
  const open = (s: number) => (p: Pt, i: number) => {
    const kx = p[0] + n[i][0] * s * (w / 2 + 1.5);
    const kz = p[1] + n[i][1] * s * (w / 2 + 1.5);
    return !mouths.some((r) => distToLine(kx, kz, pts(r.p)) < r.w / 2 + 2);
  };

  // Orchard Road.
  ribbon(g, centre, w, 0.06, col(L.asphalt), K.road);
  const PAVE = 16;
  for (const s of [-1, 1]) {
    const keep = open(s);
    const paveLine = offsetLine(centre, s * (w / 2 + PAVE / 2));
    for (const piece of pieces(centre, keep)) {
      const idx = centre.indexOf(piece[0]);
      const pl = paveLine.slice(idx, idx + piece.length);
      ribbon(g, pl, PAVE, KERB, col(L.pavement), K.pavement, s * (w / 2 + PAVE / 2), idx * 2);
      // Kerb: a granite edge on top and a vertical face down to the road.
      const edge = offsetLine(piece, s * (w / 2 + 0.15));
      ribbon(g, edge, 0.3, KERB + 0.002, col(L.kerb), K.kerb);
      kerbFace(g, offsetLine(piece, (s * w) / 2), s, col(L.kerb));
    }
    // Gutter along the kerb, where the water runs.
    ribbon(g, offsetLine(centre, s * (w / 2 - 0.3)), 0.6, 0.064, col(L.gutter), K.gutter, s * (w / 2 - 0.3));
  }

  // Lanes: Orchard Road is one-way; the left-hand (north) lane is a full-day bus lane.
  const orchard = data.roads.filter((r) => r.n === 'Orchard Road' && r.lanes);
  const lanes = mode(orchard.map((r) => r.lanes!)) ?? Math.max(2, Math.round(w / 3.4));
  const hasBus = orchard.filter((r) => r.bus).length > orchard.length / 2;
  const laneW = w / lanes;
  const laneOffsets: number[] = [];
  for (let k = 0; k < lanes; k++) laneOffsets.push(w / 2 - laneW * (k + 0.5)); // k = 0 is the left (north) lane
  for (let k = 1; k < lanes; k++) {
    const line = offsetLine(centre, w / 2 - laneW * k);
    if (k === 1 && hasBus) ribbon(g, line, 0.2, 0.07, col(L.busPaint), K.busPaint);
    else dashes(g, line, 0.14, 0.07, col(L.paint), K.paint, 3, 6);
  }
  ribbon(g, offsetLine(centre, -(w / 2 - 0.45)), 0.12, 0.07, col(L.paint), K.paint);

  // Crossings, stop lines and tactile paving, from OSM.
  const stopsU: number[] = [];
  const signals: Signal[] = [];
  const dir = (i: number): Pt => {
    const a = centre[Math.max(0, i - 1)];
    const c = centre[Math.min(centre.length - 1, i + 1)];
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    return [(c[0] - a[0]) / l, (c[1] - a[1]) / l];
  };
  for (const c of data.crossings) {
    const line = pts(c.p);
    if (line.length < 2) continue;
    const midC = line[Math.floor(line.length / 2)];
    const onOrchard = distToLine(midC[0], midC[1], centre) < w / 2 + 3;
    if (!onOrchard && !near(c.p)) continue;
    const y = onOrchard ? 0.075 : 0.065;
    if (c.signals) {
      for (const s of [-1, 1]) ribbon(g, offsetLine(line, s * 1.6), 0.2, y, col(L.paint), K.paint);
    } else dashes(g, line, 3, y, col(L.paint), K.paint, 0.6, 0.6);
    if (!onOrchard) continue;
    // Index of the crossing along Orchard Road, then a stop line upstream (traffic runs west to east).
    let bi = 0;
    let bd = Infinity;
    centre.forEach((p, i) => {
      const d = Math.hypot(p[0] - midC[0], p[1] - midC[1]);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const [dx, dz] = dir(bi);
    if (c.signals) {
      stopsU.push(bi * 2 - 5);
      const stop = offsetLine(line, 0).map(([x, z]) => [x - dx * 4.5, z - dz * 4.5] as Pt);
      ribbon(g, stop, 0.4, y, col(L.paint), K.paint);
    }
    // Yellow tactile tiles and (for signalled crossings) light poles at both ends.
    for (const end of [line[0], line[line.length - 1]]) {
      const tl: Pt[] = [
        [end[0] - dx * 1.2, end[1] - dz * 1.2],
        [end[0] + dx * 1.2, end[1] + dz * 1.2],
      ];
      ribbon(g, tl, 0.8, KERB + 0.004, col(L.tactile), K.tactile);
      if (c.signals) {
        const toMid: Pt = [midC[0] - end[0], midC[1] - end[1]];
        const l = Math.hypot(...toMid) || 1;
        signals.push({ x: end[0] - (toMid[0] / l) * 0.8 - dx * 2, z: end[1] - (toMid[1] / l) * 0.8 - dz * 2, face: [-dx, -dz], ped: true });
      }
    }
  }

  const wet = groundMaterial(reflectionScale);
  const mesh = new THREE.Mesh(g.build('aGround'), wet.material);
  mesh.frustumCulled = false;
  const mouthLines = mouths.map((r) => ({ line: pts(r.p), w: r.w }));
  /** Is this point in the mouth of a side street (where nothing should stand)? */
  const mouth = (x: number, z: number) => mouthLines.some((r) => distToLine(x, z, r.line) < r.w / 2 + 2.5);
  return { mesh, mirror: wet.mirror, laneOffsets, hasBus, stopsU: stopsU.sort((a, c) => a - c), signals, laneW, mouth };
}

function mode(list: number[]) {
  const counts = new Map<number, number>();
  for (const v of list) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | undefined;
  let bc = 0;
  for (const [v, c] of counts) if (c > bc) [best, bc] = [v, c];
  return best;
}

/** The vertical face of a kerb from the road up to the pavement, facing the road. */
function kerbFace(g: Geo, line: Pt[], s: number, c: THREE.Color) {
  const pl = resample(line, 2);
  const n = normals(pl);
  for (let i = 0; i < pl.length - 1; i++) {
    const [x0, z0] = pl[i];
    const [x1, z1] = pl[i + 1];
    const nn: [number, number, number] = [-n[i][0] * s, 0, -n[i][1] * s];
    g.quad([x0, 0.06, z0], [x1, 0.06, z1], [x1, KERB, z1], [x0, KERB, z0], nn, c, [K.kerb, 0, 0, 0]);
  }
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
  const active = step(0.7, hash(h.mul(13.7).add(floor(time.mul(speed).add(h.mul(7))))));
  const ring = smoothstep(0.035, 0.0, abs(r.sub(t.mul(0.42)))).mul(fadeOut.mul(fadeOut)).mul(active);
  const dir = d.div(max(r, 0.001));
  return vec3(dir.x.mul(ring), dir.y.mul(ring), ring);
}

function groundMaterial(reflectionScale: number) {
  const m = new THREE.MeshStandardNodeMaterial();
  const ga = attribute('aGround', 'vec4');
  const kind = ga.x;
  const u = ga.y;
  const v = ga.z;
  const is = (k: number) => step(abs(kind.sub(k)), 0.5);
  const xz = positionWorld.xz;
  const flat = step(0.5, normalGeometry.y);

  // Pavement tiles (0.6 m, laid along the street), each a slightly different shade.
  const tg = vec2(u.div(0.6), v.div(0.6));
  const tile = floor(tg);
  const tf = fract(tg);
  const joint = step(tf.x, 0.04).add(step(tf.y, 0.04)).min(1);
  const tileShade = hash(tile.x.mul(3.7).add(tile.y.mul(91.1))).mul(0.25).add(0.85);
  const pave = is(K.pavement);

  // Asphalt grain and patches.
  const grain = mx_noise_float(vec3(xz.x.mul(3.1), 0, xz.y.mul(3.1))).mul(0.12).add(1);
  const patch = smoothstep(0.35, 0.45, mx_noise_float(vec3(xz.x.mul(0.05), 7.7, xz.y.mul(0.05))));
  const road = is(K.road);

  // Water: puddles in low spots, along wheel ruts (0.85 m either side of each lane's centre)
  // and in the gutters; less on pavements and open ground.
  const big = mx_noise_float(vec3(xz.x.mul(0.07), 0, xz.y.mul(0.07)));
  const small = mx_noise_float(vec3(xz.x.mul(0.45), 3.1, xz.y.mul(0.45)));
  const laneFrac = fract(v.div(3.4)).sub(0.5).abs();
  const rut = smoothstep(0.12, 0.0, abs(laneFrac.sub(0.25))).mul(road);
  const pool = smoothstep(0.08, 0.3, big.add(small.mul(0.25)).add(rut.mul(0.25)));
  const puddle = max(pool.mul(mix(0.35, 1, road.add(is(K.gutter)).min(1))), is(K.gutter)).mul(flat);

  // Water running along the gutter.
  const flow = mx_noise_float(vec3(u.mul(1.5).sub(time.mul(1.4)), v.mul(6), 0)).mul(is(K.gutter));

  const rip = ripples(xz, 2.6, 1.1, 0.0).add(ripples(xz.add(vec2(0.37, 0.71)), 3.7, 1.4, 5.0));
  const base = attribute('color', 'vec3')
    .mul(mix(float(1), tileShade.mul(float(1).sub(joint.mul(0.45))), pave))
    .mul(mix(float(1), grain.mul(mix(1, 0.8, patch)), road));
  m.colorNode = base.mul(mix(0.6, 0.3, puddle));
  m.roughnessNode = mix(mix(float(0.5), float(0.35), road), float(0.05), puddle);
  m.metalnessNode = float(0);

  const refl = reflector({ resolutionScale: reflectionScale, generateMipmaps: true, bounces: false });
  refl.target.rotateX(-Math.PI / 2);
  refl.target.position.y = 0.1;
  const ruv = screenUV.flipX().add(vec2(rip.x, rip.y).mul(mix(0.004, 0.018, puddle))).add(vec2(flow.mul(0.01), 0));
  const sharp = refl.sample(ruv);
  const smear = refl.sample(ruv.add(vec2(0, 0.012))).level(float(2.5))
    .add(refl.sample(ruv.add(vec2(0, 0.03))).level(float(3)))
    .add(refl.sample(ruv.sub(vec2(0, 0.012))).level(float(2.5)))
    .mul(1 / 3);
  const view = normalize(cameraPosition.sub(positionWorld));
  const fresnel = mix(float(0.05), float(1), pow(float(1).sub(max(view.y, 0)), 4));
  const wetness = mix(0.2, 1.0, puddle).mul(flat);
  const mirror = mix(smear.rgb, sharp.rgb, puddle);
  m.emissiveNode = mirror.mul(fresnel).mul(wetness).mul(0.75)
    .add(vec3(...L.ripple).mul(rip.z.mul(0.06)).mul(puddle))
    .add(vec3(...L.ripple).mul(smoothstep(0.3, 0.7, flow).mul(0.04)));
  return { material: m, mirror: refl.target };
}
