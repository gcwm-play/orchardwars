import * as THREE from 'three';
import { GANGS, TERRITORIES, type GangId } from '../game/data.ts';
import type { TerritoryMap } from './territoryMap.ts';

// Who owns what, on the graphics card. Two small textures drive every turf colour:
//   ids:   a top-down grid saying which territory each patch of ground belongs to
//   state: one texel per territory with its owner's colour (row 0) and highlight flags (row 1)
// Changing an owner updates one texel, so captures recolour whole districts instantly.

const WIDTH = 64; // max territories

export class Turf {
  readonly uniforms: {
    uTurfIds: { value: THREE.DataTexture };
    uTurfState: { value: THREE.DataTexture };
    uTurfRect: { value: THREE.Vector4 };
    uTurfTexel: { value: THREE.Vector2 };
    uTime: { value: number };
  };
  private readonly state = new Uint8Array(WIDTH * 2 * 4);
  private readonly stateTex: THREE.DataTexture;
  private readonly flash = new Float32Array(WIDTH);
  private readonly color = new THREE.Color();

  constructor(readonly map: TerritoryMap) {
    const ids = new THREE.DataTexture(map.ids, map.cols, map.rows, THREE.RedFormat, THREE.UnsignedByteType);
    ids.magFilter = ids.minFilter = THREE.NearestFilter;
    ids.needsUpdate = true;
    this.stateTex = new THREE.DataTexture(this.state, WIDTH, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.stateTex.magFilter = this.stateTex.minFilter = THREE.NearestFilter;
    // Row 1, alpha: 255 for strongholds (drawn with stripes and a brighter border).
    TERRITORIES.forEach((t, i) => (this.state[(WIDTH + i) * 4 + 3] = t.kind === 'mall' ? 255 : 0));
    this.stateTex.needsUpdate = true;
    this.uniforms = {
      uTurfIds: { value: ids },
      uTurfState: { value: this.stateTex },
      uTurfRect: { value: new THREE.Vector4(map.minX, map.minZ, map.cols * map.cell, map.rows * map.cell) },
      uTurfTexel: { value: new THREE.Vector2(1 / map.cols, 1 / map.rows) },
      uTime: { value: 0 },
    };
  }

  setOwners(owners: GangId[]) {
    owners.forEach((g, i) => {
      this.color.set(GANGS[g].color);
      this.state[i * 4] = Math.round(this.color.r * 255);
      this.state[i * 4 + 1] = Math.round(this.color.g * 255);
      this.state[i * 4 + 2] = Math.round(this.color.b * 255);
    });
    this.stateTex.needsUpdate = true;
  }

  /** Light up a territory briefly (after a capture or a battle). */
  pulse(t: number, strength = 1) {
    this.flash[t] = Math.max(this.flash[t], strength);
  }

  /** selected: chosen territory; targets: where it can attack or move to. */
  setHighlight(selected: number | null, targets: number[], hover: number | null) {
    for (let i = 0; i < TERRITORIES.length; i++) {
      const o = (WIDTH + i) * 4;
      this.state[o] = i === selected ? 255 : 0;
      this.state[o + 1] = targets.includes(i) ? 255 : 0;
      this.state[o + 2] = i === hover ? 255 : 0;
    }
    this.stateTex.needsUpdate = true;
  }

  update(dt: number, time: number) {
    this.uniforms.uTime.value = time;
    let dirty = false;
    for (let i = 0; i < TERRITORIES.length; i++) {
      const f = this.flash[i];
      const a = Math.round(Math.min(1, f) * 255);
      if (this.state[i * 4 + 3] !== a) {
        this.state[i * 4 + 3] = a;
        dirty = true;
      }
      if (f > 0) this.flash[i] = Math.max(0, f - dt * 1.4);
    }
    if (dirty) this.stateTex.needsUpdate = true;
  }

  /** Territory index at a world point (for clicks), or -1 outside the map. */
  at(x: number, z: number): number {
    const c = Math.floor((x - this.map.minX) / this.map.cell);
    const r = Math.floor((z - this.map.minZ) / this.map.cell);
    if (c < 0 || r < 0 || c >= this.map.cols || r >= this.map.rows) return -1;
    return this.map.ids[r * this.map.cols + c];
  }
}

/** GLSL shared by every material that shows turf. Needs vTurfPos (world position). */
export const TURF_GLSL = /* glsl */ `
uniform sampler2D uTurfIds;
uniform sampler2D uTurfState;
uniform vec4 uTurfRect;
uniform vec2 uTurfTexel;
uniform float uTime;
varying vec3 vTurfPos;

vec2 turfUv(vec2 xz) { return (xz - uTurfRect.xy) / uTurfRect.zw; }
float turfIdAt(vec2 uv) { return floor(texture2D(uTurfIds, uv).r * 255.0 + 0.5); }
vec4 turfOwner(float id) { return texture2D(uTurfState, vec2((id + 0.5) / ${WIDTH}.0, 0.25)); }
vec4 turfFlags(float id) { return texture2D(uTurfState, vec2((id + 0.5) / ${WIDTH}.0, 0.75)); }

// Ground-level turf: tint, glowing borders, and highlights. Returns emissive; tints diffuse in place.
vec3 turfGround(inout vec3 diffuse, float tintAmount) {
  vec2 uv = turfUv(vTurfPos.xz);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
  float id = turfIdAt(uv);
  vec3 owner = turfOwner(id).rgb;
  vec4 flags = turfFlags(id);
  float mall = flags.a;
  diffuse = mix(diffuse, owner * 0.6, tintAmount * (1.0 + mall * 0.6));
  // Strongholds: diagonal stripes across the whole territory.
  float stripe = step(0.62, fract((vTurfPos.x + vTurfPos.z) / 16.0));
  diffuse = mix(diffuse, owner * 0.85, mall * stripe * tintAmount * 0.9);
  // Border: a neighbouring sample belongs to another territory.
  float b = 0.0;
  b += step(0.5, abs(turfIdAt(uv + vec2(uTurfTexel.x, 0.0)) - id));
  b += step(0.5, abs(turfIdAt(uv - vec2(uTurfTexel.x, 0.0)) - id));
  b += step(0.5, abs(turfIdAt(uv + vec2(0.0, uTurfTexel.y)) - id));
  b += step(0.5, abs(turfIdAt(uv - vec2(0.0, uTurfTexel.y)) - id));
  vec3 glow = owner * min(b, 1.0) * (0.9 + mall * 0.9);
  float pulse = 0.55 + 0.45 * sin(uTime * 4.0);
  glow += vec3(1.0) * flags.r * 0.22 * pulse;            // selected
  glow += vec3(1.0, 0.25, 0.3) * flags.g * 0.2 * pulse;  // valid target
  glow += owner * flags.b * 0.15;                        // hover
  glow += owner * turfOwner(id).a * 0.35;                // capture flash
  return glow;
}
`;

/** Hook a standard material up to the turf textures. `fragment` runs after emissive is set. */
export function withTurf(material: THREE.Material, turf: Turf, fragment: string, extraVertex = '') {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, turf.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vTurfPos;\n${extraVertex.split('@@')[0] ?? ''}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\nvTurfPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n${extraVertex.split('@@')[1] ?? ''}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TURF_GLSL}\n${fragment.split('@@')[0]}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${fragment.split('@@')[1] ?? ''}`);
  };
  return material;
}
