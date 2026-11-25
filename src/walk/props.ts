// Street furniture for the walk, placed from OSM where it is mapped: bus stops (with their real names),
// MRT entrances, covered walkways, traffic and pedestrian lights at signalled crossings, bollards and
// benches; plus street lamps and rows of rain trees along Orchard Road (with fairy lights in season).

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { abs, attribute, float, hash, instancedBufferAttribute, instanceIndex, mix, sin, step, time, uniform, vec3 } from 'three/tsl';
import { Geo, nearestOnLine, pts, rng, type V3 } from './geo3d.ts';
import { distToLine, normals, offsetLine, resample, type Pt, type WalkRoute } from './path.ts';
import { KERB, type Signal } from './ground.ts';
import type { TextQuads } from './signs.ts';
import type { Part, WalkData } from './walkData.ts';
import { pointInRing } from '../world/polygon.ts';
import { RAIN_LOOK as L } from './look.ts';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A box with its long side along `dir` (unit x/z vector). */
function box(g: Geo, c: THREE.Vector3, dir: Pt, len: number, wid: number, hgt: number, col: THREE.Color, emit = 0) {
  const a = V(dir[0], 0, dir[1]).normalize();
  const s = V(-dir[1], 0, dir[0]).normalize();
  const up = V(0, 1, 0);
  const half = [len / 2, wid / 2, hgt / 2];
  // Each face: normal n, half-size dn along it, an axis t1 (half-size d1), and the half-size d2 along
  // t2 = n × t1, so that t1 × t2 = n and the corners wind counter-clockwise seen from outside.
  const faces: [THREE.Vector3, THREE.Vector3, number, number, number][] = [
    [a, s, half[0], half[1], half[2]],
    [a.clone().negate(), s.clone().negate(), half[0], half[1], half[2]],
    [s, a.clone().negate(), half[1], half[0], half[2]],
    [s.clone().negate(), a, half[1], half[0], half[2]],
    [up, a, half[2], half[0], half[1]],
    [up.clone().negate(), a, half[2], half[0], half[1]],
  ];
  for (const [n, t1x, dn, d1, d2] of faces) {
    const t2x = n.clone().cross(t1x).normalize();
    const o = c.clone().addScaledVector(n, dn);
    const corner = (i: number, j: number): V3 => {
      const p = o.clone().addScaledVector(t1x, i * d1).addScaledVector(t2x, j * d2);
      return [p.x, p.y, p.z];
    };
    g.quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), [n.x, n.y, n.z], col, [emit, 0, 0, 0]);
  }
}

export interface PropsOut {
  group: THREE.Group;
  lamps: THREE.Vector3[];
  /** Traffic-light state, 0 or 1 each: vehicle red/amber/green, pedestrian red/green. */
  lights: { vr: THREE.UniformNode<'float', number>; va: THREE.UniformNode<'float', number>; vg: THREE.UniformNode<'float', number>; pr: THREE.UniformNode<'float', number>; pg: THREE.UniformNode<'float', number> };
}

export function buildProps(
  data: WalkData,
  route: WalkRoute,
  parts: Part[],
  signals: Signal[],
  mouth: (x: number, z: number) => boolean,
  text: TextQuads,
  opts: { reach: number; xmas: boolean; low: boolean },
): PropsOut {
  const { centre, width: w, walk } = route;
  const g = new Geo(4);
  const rand = rng(31);
  const c = (hex: string) => new THREE.Color(hex);
  const group = new THREE.Group();
  const groundY = (x: number, z: number) => (distToLine(x, z, centre) < w / 2 + 16 ? KERB : 0.03);
  const n = normals(centre);
  const dirAt = (i: number): Pt => [-n[i][1], n[i][0]];
  const nearWalk = (x: number, z: number, r: number) => distToLine(x, z, walk) < r;
  const solid = parts.filter((p) => !p.canopy && p.b < 3 && distToLine(p.p[0], p.p[1], centre) < 80);
  const inBuilding = (x: number, z: number) => solid.some((p) => pointInRing(x, z, p.p));

  // ---- Bus stops on Orchard Road.
  const stopSpots: Pt[] = [];
  for (const s of data.busStops) {
    const near = nearestOnLine(s.x, s.z, centre);
    if (near.d > w / 2 + 12 || !nearWalk(s.x, s.z, 60)) continue;
    const side = Math.sign((s.x - near.p[0]) * n[near.i][0] + (s.z - near.p[1]) * n[near.i][1]) || 1;
    const dir = dirAt(near.i);
    const out: Pt = [n[near.i][0] * side, n[near.i][1] * side];
    const at = (d: number, along = 0, y = 0) =>
      V(near.p[0] + out[0] * (w / 2 + d) + dir[0] * along, KERB + y, near.p[1] + out[1] * (w / 2 + d) + dir[1] * along);
    stopSpots.push([at(2.5).x, at(2.5).z]);
    box(g, at(2.4, 0, 2.95), dir, 10, 3.2, 0.18, c(L.shelter));
    box(g, at(2.4, 0, 2.83), dir, 8, 0.25, 0.04, c(L.canopyLightHex), 4);
    box(g, at(3.7, 0, 1.3), dir, 9, 0.05, 2.2, c(L.shelterGlass), 0.15);
    box(g, at(3.6, 3.6, 1.15), dir, 1.4, 0.12, 1.9, c(L.advert), 2.2);
    for (const k of [-4.6, 0, 4.6]) box(g, at(3.6, k, 1.45), dir, 0.12, 0.12, 2.9, c(L.pole));
    box(g, at(3.2, -1, 0.45), dir, 4, 0.5, 0.08, c(L.bench));
    // The stop's sign: a pole at the kerb with a lit board carrying the stop's name.
    box(g, at(0.6, -5.5, 1.6), dir, 0.1, 0.1, 3.2, c(L.pole));
    box(g, at(0.6, -5.5, 2.85), dir, 2.2, 0.08, 0.55, c(L.stopBoard), 0.35);
    const name = s.n.replace('Station', 'Stn');
    for (const f of [1, -1]) {
      text.add(name, at(0.6, -5.5, 2.85), V(dir[0] * f, 0, dir[1] * f), V(0, 1, 0), 0.22, c(L.stopText).multiplyScalar(1.4), 2.0, 64, 0.06);
    }
  }

  // ---- MRT entrances near the walk: a canopy over the stairs and the station's name.
  for (const e of data.mrt) {
    if (!nearWalk(e.x, e.z, 45)) continue;
    const near = nearestOnLine(e.x, e.z, centre);
    const dir = dirAt(near.i);
    const y = groundY(e.x, e.z);
    box(g, V(e.x, y + 3.3, e.z), dir, 6.5, 4, 0.25, c(L.shelter));
    box(g, V(e.x, y + 3.15, e.z), dir, 5.5, 0.3, 0.04, c(L.canopyLightHex), 4);
    for (const [a, b] of [[-3, -1.8], [3, -1.8], [-3, 1.8], [3, 1.8]]) {
      box(g, V(e.x + dir[0] * a - dir[1] * b, y + 1.6, e.z + dir[1] * a + dir[0] * b), dir, 0.12, 0.12, 3.2, c(L.pole));
    }
    const station = (e.n.split(' (')[0] || 'MRT').toUpperCase();
    for (const f of [1, -1]) {
      text.add(`${station} MRT`, V(e.x, y + 3.75, e.z), V(dir[0] * f, 0, dir[1] * f), V(0, 1, 0), 0.45, c(L.mrtText).multiplyScalar(2), 6, 72, 2.05);
    }
  }

  // ---- Covered walkways mapped in OSM.
  for (const line of data.covered) {
    const P = pts(line);
    if (!P.some(([x, z]) => nearWalk(x, z, 120))) continue;
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, z0] = P[i];
      const [x1, z1] = P[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.5) continue;
      const dir: Pt = [(x1 - x0) / len, (z1 - z0) / len];
      const y = groundY((x0 + x1) / 2, (z0 + z1) / 2);
      const mid = V((x0 + x1) / 2, y + 3.3, (z0 + z1) / 2);
      box(g, mid, dir, len + 0.3, 3.2, 0.2, c(L.shelter));
      box(g, mid.clone().setY(y + 3.18), dir, len, 0.3, 0.04, c(L.canopyLightHex), 3);
      for (let t = 0; t < len; t += 6) {
        for (const sd of [-1.5, 1.5]) box(g, V(x0 + dir[0] * t - dir[1] * sd, y + 1.6, z0 + dir[1] * t + dir[0] * sd), dir, 0.14, 0.14, 3.2, c(L.pole));
      }
    }
  }

  // ---- Traffic and pedestrian lights.
  const lightPos: { p: THREE.Vector3; face: THREE.Vector3; kind: number }[] = [];
  for (const s of signals) {
    const near = nearestOnLine(s.x, s.z, centre);
    const toRoad = V(near.p[0] - s.x, 0, near.p[1] - s.z).normalize();
    const face = V(s.face[0], 0, s.face[1]);
    box(g, V(s.x, KERB + 1.9, s.z), [face.x, face.z], 0.16, 0.16, 3.8, c(L.pole));
    // Vehicle head facing oncoming traffic.
    const vh = V(s.x, KERB + 3.4, s.z).addScaledVector(toRoad, 0.3);
    box(g, vh, [face.x, face.z], 0.3, 0.38, 1.05, c(L.signalBox));
    [0, 1, 2].forEach((k) => lightPos.push({ p: vh.clone().addScaledVector(face, 0.16).setY(vh.y + 0.32 - k * 0.32), face, kind: k }));
    // Pedestrian head facing across the road.
    const ph = V(s.x, KERB + 2.5, s.z).addScaledVector(toRoad, 0.2);
    box(g, ph, [toRoad.z, -toRoad.x], 0.3, 0.32, 0.62, c(L.signalBox));
    [3, 4].forEach((k) => lightPos.push({ p: ph.clone().addScaledVector(toRoad, 0.17).setY(ph.y + (k === 3 ? 0.14 : -0.14)), face: toRoad, kind: k }));
  }
  const lights = {
    vr: uniform(0), va: uniform(0), vg: uniform(1), pr: uniform(1), pg: uniform(0),
  };
  if (lightPos.length) {
    const sig = new Float32Array(lightPos.map((l) => l.kind));
    const geo = new THREE.CircleGeometry(0.12, 12);
    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const k = instancedBufferAttribute(new THREE.InstancedBufferAttribute(sig, 1), 'float') as unknown as THREE.Node<'float'>;
    const is = (v: number) => step(abs(k.sub(v)), 0.5);
    const on = is(0).mul(lights.vr).add(is(1).mul(lights.va)).add(is(2).mul(lights.vg)).add(is(3).mul(lights.pr)).add(is(4).mul(lights.pg));
    mat.colorNode = vec3(1).mul(mix(0.05, 5, on));
    const mesh = new THREE.InstancedMesh(geo, mat, lightPos.length);
    const cols = [L.signalRed, L.signalAmber, L.signalGreen, L.signalRed, L.signalGreen];
    const m = new THREE.Matrix4();
    lightPos.forEach((l, i) => {
      m.lookAt(V(0, 0, 0), l.face.clone().negate(), V(0, 1, 0)).setPosition(l.p);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(cols[l.kind]));
    });
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ---- Bollards and benches.
  for (let i = 0; i < data.bollards.length; i += 2) {
    const [x, z] = [data.bollards[i], data.bollards[i + 1]];
    if (nearWalk(x, z, 80)) box(g, V(x, groundY(x, z) + 0.45, z), [1, 0], 0.22, 0.22, 0.9, c(L.bollard));
  }
  for (let i = 0; i < data.benches.length; i += 2) {
    const [x, z] = [data.benches[i], data.benches[i + 1]];
    if (nearWalk(x, z, 80)) box(g, V(x, groundY(x, z) + 0.42, z), dirAt(nearestOnLine(x, z, centre).i), 1.8, 0.5, 0.1, c(L.bench));
  }

  // ---- Street lamps along both kerbs.
  const lamps: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const kerbLine = resample(offsetLine(centre, s * (w / 2 + 0.9)), 32);
    const kn = normals(kerbLine);
    kerbLine.forEach(([x, z], i) => {
      if (mouth(x, z) || signals.some((q) => Math.hypot(q.x - x, q.z - z) < 4) || stopSpots.some((p) => Math.hypot(p[0] - x, p[1] - z) < 7)) return;
      const inward: Pt = [-kn[i][0] * s, -kn[i][1] * s];
      box(g, V(x, KERB + 4.6, z), inward, 0.2, 0.2, 9.2, c(L.pole));
      box(g, V(x + inward[0] * 1.1, KERB + 9.1, z + inward[1] * 1.1), inward, 2.2, 0.14, 0.14, c(L.pole));
      const head = V(x + inward[0] * 2.1, KERB + 8.95, z + inward[1] * 2.1);
      box(g, head, inward, 0.9, 0.45, 0.14, c(L.lamp), 4);
      lamps.push(head);
    });
  }

  const props = new THREE.Mesh(g.build('aProp'), propMaterial());
  props.frustumCulled = false;
  group.add(props);

  // ---- Rain trees: a row along each kerb and a second row further back where the pavement is wide.
  const trees: Pt[] = [];
  const clear = (x: number, z: number, walkGap: number) =>
    !mouth(x, z) &&
    !nearWalk(x, z, walkGap) &&
    !inBuilding(x, z) &&
    !signals.some((q) => Math.hypot(q.x - x, q.z - z) < 6) &&
    !stopSpots.some((p) => Math.hypot(p[0] - x, p[1] - z) < 8) &&
    !lamps.some((l) => Math.hypot(l.x - x, l.z - z) < 3.5);
  for (const s of [-1, 1]) {
    for (const [x, z] of resample(offsetLine(centre, s * (w / 2 + 2.3)), 11)) {
      const p: Pt = [x + (rand() - 0.5) * 1.5, z + (rand() - 0.5) * 1.5];
      if (clear(p[0], p[1], 2.5)) trees.push(p);
    }
    for (const [x, z] of resample(offsetLine(centre, s * (w / 2 + 10)), 15)) {
      const p: Pt = [x + (rand() - 0.5) * 3, z + (rand() - 0.5) * 3];
      if (clear(p[0], p[1], 3.5)) trees.push(p);
    }
  }
  for (let i = 0; i < data.trees.length; i += 2) {
    const [x, z] = [data.trees[i], data.trees[i + 1]];
    if (nearWalk(x, z, 160) && !nearWalk(x, z, 2.5)) trees.push([x, z]);
  }
  if (trees.length) group.add(...treeMeshes(trees, groundY, rand, opts.xmas, opts.low));

  return { group, lamps, lights };
}

function propMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.4 });
  const e = attribute('aProp', 'vec4').x;
  const col = attribute('color', 'vec3');
  m.colorNode = col;
  m.emissiveNode = col.mul(e);
  return m;
}

/** Rain trees: thick trunks and wide, flat, umbrella-shaped crowns. */
function treeMeshes(trees: Pt[], groundY: (x: number, z: number) => number, rand: () => number, xmas: boolean, low: boolean) {
  const blobs: THREE.BufferGeometry[] = [];
  const ring = 6;
  blobs.push(new THREE.IcosahedronGeometry(1, 1).scale(1.1, 0.75, 1.1).translate(0, 0.15, 0));
  for (let k = 0; k < ring; k++) {
    const a = (k / ring) * Math.PI * 2 + 0.3;
    blobs.push(new THREE.IcosahedronGeometry(0.8, 1).scale(1, 0.6, 1).translate(Math.cos(a) * 1.05, -0.1 + (k % 2) * 0.12, Math.sin(a) * 1.05));
  }
  const crownGeo = mergeGeometries(blobs)!;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.5, 1, 7), new THREE.MeshStandardNodeMaterial({ color: L.trunk, roughness: 0.9 }), trees.length);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardNodeMaterial({ color: L.leaves, roughness: 0.7, flatShading: true }), trees.length);
  const tcol = new THREE.Color();
  const crowns: { c: THREE.Vector3; r: number; ry: number }[] = [];
  trees.forEach(([x, z], i) => {
    const y0 = groundY(x, z);
    const th = 5.5 + rand() * 2.5;
    const r = 2.6 + rand() * 1.4;
    const cy = y0 + th + r * 0.25;
    trunk.setMatrixAt(i, new THREE.Matrix4().compose(V(x, y0 + th / 2, z), new THREE.Quaternion(), V(1, th, 1)));
    crown.setMatrixAt(i, new THREE.Matrix4().compose(V(x, cy, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), V(r * 1.6, r, r * 1.6)));
    crown.setColorAt(i, tcol.setHSL(0.28 + rand() * 0.08, 0.35, 0.55 + rand() * 0.45));
    crowns.push({ c: V(x, cy, z), r: r * 1.6 * 1.7, ry: r * 0.7 });
  });
  const out: THREE.Object3D[] = [trunk, crown];
  for (const m of out) m.frustumCulled = false;
  if (xmas) {
    // Fairy lights hanging in the crowns: the Orchard Road light-up season.
    const per = low ? 30 : 70;
    const count = crowns.length * per;
    const bulbs = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.1, 0), bulbMaterial(), count);
    const m = new THREE.Matrix4();
    const bc = new THREE.Color();
    let i = 0;
    for (const t of crowns) {
      for (let k = 0; k < per; k++) {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * t.r * 0.95;
        const yy = t.c.y - t.ry * (0.2 + rand() * 0.9) * (1 - (d / t.r) * 0.6);
        m.makeTranslation(t.c.x + Math.cos(a) * d, yy, t.c.z + Math.sin(a) * d);
        bulbs.setMatrixAt(i, m);
        const pick = rand();
        bulbs.setColorAt(i, pick < 0.7 ? bc.set(L.fairyWarm) : bc.set(L.neon[Math.floor(rand() * L.neon.length)]));
        i++;
      }
    }
    bulbs.frustumCulled = false;
    out.push(bulbs);
  }
  return out;
}

function bulbMaterial() {
  const m = new THREE.MeshBasicNodeMaterial();
  const h = hash(float(instanceIndex).mul(1.37));
  const twinkle = sin(time.mul(h.mul(2).add(1)).add(h.mul(40))).mul(0.5).add(0.5);
  m.colorNode = vec3(1).mul(mix(1.2, 4.5, twinkle));
  return m;
}
