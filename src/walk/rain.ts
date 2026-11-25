// Falling rain: thin streaks in a box that travels with the camera. Each drop's position is worked out
// on the GPU from a random seed and the time, so nothing is updated from JavaScript per frame.

import * as THREE from 'three/webgpu';
import { abs, attribute, cameraPosition, cross, float, fract, length, normalize, sin, smoothstep, time, vec3 } from 'three/tsl';
import { RAIN_LOOK } from './look.ts';
import { rng, type Flash } from './street.ts';

export function makeRain(count: number, flash: Flash) {
  const rand = rng(7);
  const corner = new Float32Array(count * 8);
  const seed = new Float32Array(count * 16);
  const idx = new Uint32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const s = [rand(), rand(), rand(), rand()];
    const cs = [-1, 0, 1, 0, -1, 1, 1, 1];
    for (let k = 0; k < 4; k++) {
      corner[i * 8 + k * 2] = cs[k * 2];
      corner[i * 8 + k * 2 + 1] = cs[k * 2 + 1];
      seed.set(s, i * 16 + k * 4);
    }
    const v = i * 4;
    idx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 12), 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));

  const c = attribute('aCorner', 'vec2');
  const sd = attribute('aSeed', 'vec4');
  const box = vec3(34, 20, 34);
  const fall = vec3(0.16, -1, 0.05);
  const dir = normalize(fall);
  const speed = sd.w.mul(4).add(9);
  // Start position plus distance fallen, wrapped into the box around the camera.
  const p = sd.xyz.mul(box).add(fall.mul(time.mul(speed)));
  const boxCentre = cameraPosition.add(vec3(0, 6, 0));
  const centre = boxCentre.add(fract(p.sub(boxCentre).div(box)).sub(0.5).mul(box));
  const toCam = normalize(cameraPosition.sub(centre));
  const side = normalize(cross(dir, toCam));
  const len = sd.w.mul(0.35).add(0.45);
  const d = length(centre.sub(cameraPosition));

  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.positionNode = centre.add(dir.mul(c.y.sub(0.5).mul(len))).add(side.mul(c.x.mul(0.012)));
  const fade = smoothstep(1.2, 3.5, d).mul(float(1).sub(smoothstep(11, 17, d)));
  const alpha = float(1).sub(abs(c.x)).mul(sin(c.y.mul(Math.PI))).mul(fade).mul(0.2);
  m.colorNode = vec3(...RAIN_LOOK.rain).mul(alpha).mul(flash.mul(3).add(1));
  m.fog = false;

  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return mesh;
}
