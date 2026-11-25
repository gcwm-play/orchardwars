// Puts the street together from walk.json: ground, buildings, signs, props and traffic.

import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { buildBuildings } from './buildings.ts';
import { buildGround } from './ground.ts';
import { buildProps } from './props.ts';
import { mallNames, neonAndScreens, TextAtlas, TextQuads } from './signs.ts';
import { makeTraffic } from './traffic.ts';
import { offsetLine, resample, type WalkRoute } from './path.ts';
import type { WalkData } from './walkData.ts';
import { RAIN_LOOK as L } from './look.ts';

export { rng } from './geo3d.ts';

/** Lightning brightness, shared by the shaders that light up with it. */
const makeFlash = () => uniform(0);
export type Flash = ReturnType<typeof makeFlash>;

export interface StreetQuality {
  reflectionScale: number;
  low: boolean;
  xmas: boolean;
}

export interface Street {
  group: THREE.Group;
  lamps: THREE.Vector3[];
  flash: Flash;
  /** Advance traffic and the lights. */
  update(dt: number, clock: number): void;
}

export function buildStreet(data: WalkData, route: WalkRoute, q: StreetQuality): Street {
  const group = new THREE.Group();
  const flash = makeFlash();
  const reach = 320;

  const ground = buildGround(data, route, reach, q.reflectionScale);
  group.add(ground.mesh, ground.mirror);

  const buildings = buildBuildings(data.parts, route.walk, reach, q.low);
  group.add(buildings.mesh);

  const atlas = new TextAtlas();
  const text = new TextQuads(atlas);
  mallNames(data.labels, buildings.frontages, route.walk, text);
  group.add(neonAndScreens(buildings.frontages, route.walk, flash));

  // "BUS LANE" painted in the bus lane every 70 m.
  if (ground.hasBus) {
    const lane = offsetLine(route.centre, ground.laneOffsets[0]);
    const spots = resample(lane, 70).slice(1, -1);
    spots.forEach(([x, z]) => {
      const k = Math.min(lane.length - 2, Math.max(0, Math.round(lane.findIndex((p) => Math.hypot(p[0] - x, p[1] - z) < 2.1))));
      const dx = lane[k + 1][0] - lane[k][0];
      const dz = lane[k + 1][1] - lane[k][1];
      const l = Math.hypot(dx, dz) || 1;
      // Read by drivers: the words run across the lane, bottom towards the driver.
      const right = new THREE.Vector3(dz / l, 0, -dx / l);
      const up = new THREE.Vector3(dx / l, 0, dz / l);
      text.add('BUS LANE', new THREE.Vector3(x, 0.08, z), right.negate(), up, 1.6, new THREE.Color(L.busText), ground.laneW * 0.8);
    });
  }

  const props = buildProps(data, route, data.parts, ground.signals, ground.mouth, text, { reach, xmas: q.xmas, low: q.low });
  group.add(props.group);
  group.add(text.build());

  const traffic = makeTraffic(route.centre, ground.laneOffsets, ground.hasBus, ground.stopsU, q.low);
  group.add(traffic.group);

  return {
    group,
    lamps: props.lamps,
    flash,
    update(dt, clock) {
      const s = traffic.update(dt, clock);
      props.lights.vr.value = s.vr ? 1 : 0;
      props.lights.va.value = s.va ? 1 : 0;
      props.lights.vg.value = s.vg ? 1 : 0;
      props.lights.pr.value = s.pr ? 1 : 0;
      props.lights.pg.value = s.pg ? 1 : 0;
    },
  };
}
