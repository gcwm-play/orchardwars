// Traffic on Orchard Road: one-way, west to east, cars in the general lanes and buses in the bus lane.
// Vehicles follow each other and stop at the signalled crossings when the lights are red. Their head
// and tail lights are what makes a wet road at night: the reflections streak across the asphalt.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { offsetLine, type Pt } from './path.ts';
import { rng } from './geo3d.ts';
import { RAIN_LOOK as L } from './look.ts';

/** Signal cycle in seconds: vehicles green, amber, then red while pedestrians cross. */
const CYCLE = 48;
const GREEN = 28;
const AMBER = 3;
export function lightState(t: number) {
  const c = ((t % CYCLE) + CYCLE) % CYCLE;
  const vg = c < GREEN;
  const va = !vg && c < GREEN + AMBER;
  const pedGreen = c >= GREEN + AMBER + 1.5 && c < CYCLE - 4;
  const pedFlash = c >= CYCLE - 4 && c < CYCLE - 1 && Math.floor(c * 3) % 2 === 0;
  return { vg, va, vr: !vg && !va, pg: pedGreen || pedFlash, pr: !(pedGreen || pedFlash) };
}

interface Vehicle {
  lane: number;
  u: number;
  v: number;
  vmax: number;
  bus: boolean;
  slot: number;
  braking: boolean;
}

export function makeTraffic(centre: Pt[], laneOffsets: number[], hasBus: boolean, stopsU: number[], low: boolean) {
  const rand = rng(77);
  const step = 2; // centre points are 2 m apart
  const length = (centre.length - 1) * step;
  const lanes = laneOffsets.map((o) => offsetLine(centre, o));
  const MAX_CARS = low ? 18 : 40;
  const MAX_BUSES = 4;

  // Car: body + cabin. Bus: one long box. Lights: flat panels at the front and back.
  const carGeo = mergeGeometries([
    new THREE.BoxGeometry(4.5, 0.7, 1.8).translate(0, 0.6, 0),
    new THREE.BoxGeometry(2.4, 0.55, 1.6).translate(-0.25, 1.22, 0),
  ])!;
  const busGeo = new THREE.BoxGeometry(12, 2.9, 2.5).translate(0, 1.75, 0);
  const paint = new THREE.MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0.5 });
  const cars = new THREE.InstancedMesh(carGeo, paint, MAX_CARS);
  const buses = new THREE.InstancedMesh(busGeo, new THREE.MeshStandardNodeMaterial({ color: L.bus, roughness: 0.4, metalness: 0.3 }), MAX_BUSES);
  const busWin = new THREE.InstancedMesh(new THREE.BoxGeometry(11, 0.9, 2.52).translate(0, 2.2, 0), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(L.busWindows).multiplyScalar(1.6) }), MAX_BUSES);
  const lightGeo = new THREE.PlaneGeometry(1, 1);
  const head = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }), MAX_CARS + MAX_BUSES);
  const tail = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }), MAX_CARS + MAX_BUSES);
  for (const m of [cars, buses, busWin, head, tail]) {
    m.frustumCulled = false;
    m.count = 0;
  }
  const carColours = L.cars.map((h) => new THREE.Color(h));
  for (let i = 0; i < MAX_CARS; i++) cars.setColorAt(i, carColours[Math.floor(rand() * carColours.length)]);
  const headCol = new THREE.Color(L.headlight).multiplyScalar(5);
  const tailCol = new THREE.Color(L.taillight).multiplyScalar(2.2);
  const brakeCol = new THREE.Color(L.taillight).multiplyScalar(6);
  for (let i = 0; i < MAX_CARS + MAX_BUSES; i++) {
    head.setColorAt(i, headCol);
    tail.setColorAt(i, tailCol);
  }

  const group = new THREE.Group();
  group.add(cars, buses, busWin, head, tail);

  const vehicles: Vehicle[] = [];
  const freeCars = Array.from({ length: MAX_CARS }, (_, i) => i);
  const freeBuses = Array.from({ length: MAX_BUSES }, (_, i) => i);
  const nextSpawn = laneOffsets.map(() => rand() * 4);

  function spawn(lane: number, u: number) {
    const bus = hasBus && lane === 0;
    const pool = bus ? freeBuses : freeCars;
    if (!pool.length) return;
    const behind = vehicles.filter((v) => v.lane === lane && v.u < u + 14 && v.u > u - 14);
    if (behind.length) return;
    vehicles.push({ lane, u, v: 10, vmax: bus ? 10 : 11 + rand() * 4, bus, slot: pool.shift()!, braking: false });
  }

  // Start with the road already busy.
  for (let lane = 0; lane < laneOffsets.length; lane++) {
    for (let u = 10; u < length - 10; u += 25 + rand() * 40) if (!(hasBus && lane === 0) || rand() < 0.12) spawn(lane, u);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);

  function placeAt(lane: number, u: number, out: THREE.Vector3) {
    const line = lanes[lane];
    const f = Math.max(0, Math.min(line.length - 1.001, u / step));
    const i = Math.floor(f);
    const t = f - i;
    out.set(line[i][0] + (line[i + 1][0] - line[i][0]) * t, 0.06, line[i][1] + (line[i + 1][1] - line[i][1]) * t);
    return Math.atan2(-(line[i + 1][1] - line[i][1]), line[i + 1][0] - line[i][0]);
  }

  function update(dt: number, clock: number) {
    const lights = lightState(clock);
    // Spawn at the west end.
    for (let lane = 0; lane < laneOffsets.length; lane++) {
      nextSpawn[lane] -= dt;
      if (nextSpawn[lane] <= 0) {
        spawn(lane, 0);
        nextSpawn[lane] = hasBus && lane === 0 ? 25 + rand() * 30 : 3 + rand() * 9;
      }
    }
    // Drive.
    for (const v of vehicles) {
      const half = v.bus ? 6 : 2.3;
      let target = v.vmax;
      // Keep a gap to the vehicle ahead in the same lane.
      let gap = Infinity;
      for (const o of vehicles) if (o !== v && o.lane === v.lane && o.u > v.u) gap = Math.min(gap, o.u - v.u - (o.bus ? 6 : 2.3) - half);
      target = Math.min(target, Math.max(0, (gap - 2.5) * 0.8));
      // Stop at the next signal unless it is green (or amber and too close to stop).
      if (!lights.vg) {
        const next = stopsU.find((s) => s > v.u + half - 0.5);
        if (next !== undefined) {
          const d = next - (v.u + half);
          if (d > (lights.va ? 6 : -0.5) && d < 45) target = Math.min(target, Math.max(0, (d - 0.5) * 0.7));
        }
      }
      const acc = target > v.v ? 2.2 : -6;
      v.braking = target < v.v - 0.3;
      v.v = Math.max(0, target > v.v ? Math.min(target, v.v + acc * dt) : Math.max(target, v.v + acc * dt));
      v.u += v.v * dt;
    }
    // Remove those that left the street.
    for (let i = vehicles.length - 1; i >= 0; i--) {
      if (vehicles[i].u > length - 2) {
        const v = vehicles[i];
        (v.bus ? freeBuses : freeCars).push(v.slot);
        vehicles.splice(i, 1);
      }
    }
    // Write instance matrices.
    let nc = 0;
    let nb = 0;
    let nl = 0;
    for (const v of vehicles) {
      const yaw = placeAt(v.lane, v.u, pos);
      q.setFromAxisAngle(yAxis, yaw);
      const dirX = Math.cos(yaw);
      const dirZ = -Math.sin(yaw);
      if (v.bus) {
        m.compose(pos, q, one);
        buses.setMatrixAt(nb, m);
        busWin.setMatrixAt(nb, m);
        nb++;
      } else {
        m.compose(pos, q, one);
        cars.setMatrixAt(nc, m);
        cars.setColorAt(nc, carColours[v.slot % carColours.length]);
        nc++;
      }
      const half = v.bus ? 6.02 : 2.27;
      const lw = v.bus ? 2.1 : 1.5;
      const ly = v.bus ? 0.7 : 0.62;
      // Head lights at the front, facing forward; tail lights at the back.
      const lq = new THREE.Quaternion().setFromAxisAngle(yAxis, yaw + Math.PI / 2);
      m.compose(new THREE.Vector3(pos.x + dirX * half, pos.y + ly, pos.z + dirZ * half), lq, new THREE.Vector3(lw, 0.16, 1));
      head.setMatrixAt(nl, m);
      m.compose(new THREE.Vector3(pos.x - dirX * half, pos.y + ly + 0.1, pos.z - dirZ * half), lq, new THREE.Vector3(lw, 0.14, 1));
      tail.setMatrixAt(nl, m);
      tail.setColorAt(nl, v.braking || v.v < 0.5 ? brakeCol : tailCol);
      nl++;
    }
    cars.count = nc;
    buses.count = nb;
    busWin.count = nb;
    head.count = tail.count = nl;
    for (const im of [cars, buses, busWin, head, tail]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    return lights;
  }

  return { group, update };
}
