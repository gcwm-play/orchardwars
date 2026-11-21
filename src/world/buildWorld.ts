import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { worldRect } from './geo.ts';
import type { MapData, RoadKind } from './mapData.ts';
import { signedArea, reversePoints } from './polygon.ts';
import { TERRITORIES } from '../game/data.ts';
import type { CollisionGrid } from '../game/collision.ts';
import { TURF_GLSL, withTurf, type Turf } from './turf.ts';

// Builds the 3D city from map data. Everything of one kind is merged into a single
// mesh (one draw call), so thousands of buildings stay cheap on phones. Turf colours
// come from the Turf textures, so captures recolour the city without rebuilding it.

const ROAD_STYLE: Record<RoadKind, { y: number; color: number }> = {
  foot: { y: 0.1, color: 0x4a4658 },
  pedestrian: { y: 0.12, color: 0x5a5368 },
  service: { y: 0.14, color: 0x24222c },
  minor: { y: 0.16, color: 0x1f1d26 },
  secondary: { y: 0.18, color: 0x1c1a23 },
  primary: { y: 0.2, color: 0x1a1820 },
  major: { y: 0.22, color: 0x18161d },
};

/** Tiny deterministic random number generator, so the city looks the same every load. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export interface World {
  group: THREE.Group;
  /** Roof-top position of each stronghold's main building (for labels), else the anchor. */
  labelHeights: number[];
  update(time: number, dt: number): void;
}

/** Ground-level tint: how strongly the owner's colour shows on each surface. */
const tint = (amount: number) => `@@totalEmissiveRadiance += turfGround(diffuseColor.rgb, ${amount.toFixed(2)});`;

export function buildWorld(map: MapData, grid: CollisionGrid, turf: Turf): World {
  const group = new THREE.Group();
  group.name = 'city';
  const rect = worldRect();

  // Ground (pavements and plazas between the roads).
  const gw = rect.maxX - rect.minX + 1200;
  const gd = rect.maxZ - rect.minZ + 1200;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(gw, gd).rotateX(-Math.PI / 2),
    withTurf(new THREE.MeshStandardMaterial({ color: 0x2e2b38, roughness: 0.95 }), turf, tint(0.4)),
  );
  ground.position.set((rect.minX + rect.maxX) / 2, 0, (rect.minZ + rect.maxZ) / 2);
  ground.receiveShadow = true;
  group.add(ground);

  group.add(flatAreas(map.parks, 0.05, withTurf(new THREE.MeshStandardMaterial({ color: 0x2c5a3c, roughness: 1 }), turf, tint(0.2))));

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0d4a66,
    emissive: 0x06243a,
    roughness: 0.12,
    metalness: 0.4,
  });
  const water = flatAreas(map.water, 0.08, waterMat);
  water.receiveShadow = false;
  group.add(water);

  group.add(roads(map, turf));
  const city = buildings(map, turf);
  group.add(city.mesh, city.rims);
  group.add(trees(map, grid));
  group.add(stations(map));

  return {
    group,
    labelHeights: city.labelHeights,
    update(time, dt) {
      waterMat.emissiveIntensity = 0.9 + Math.sin(time * 0.8) * 0.15;
      turf.update(dt, time);
    },
  };
}

function flatAreas(polys: number[][], y: number, material: THREE.Material): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  for (const p of polys) {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < p.length; i += 2) pts.push(new THREE.Vector2(p[i], -p[i + 1]));
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
    g.rotateX(-Math.PI / 2); // shape y (= -z) becomes world z
    geos.push(g);
  }
  const merged = geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry();
  geos.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function roads(map: MapData, turf: Turf): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const marks: number[] = [];

  for (const road of map.roads) {
    if (road.w <= 0) continue;
    const style = ROAD_STYLE[road.k];
    c.setHex(style.color);
    const p = road.p;
    const n = p.length / 2;
    if (n < 2) continue;
    const half = road.w / 2;
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      // Direction of the segments either side of this point.
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(n - 1, i + 1);
      let ax = p[i * 2] - p[i0 * 2], az = p[i * 2 + 1] - p[i0 * 2 + 1];
      let bx = p[i1 * 2] - p[i * 2], bz = p[i1 * 2 + 1] - p[i * 2 + 1];
      const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
      ax /= la; az /= la; bx /= lb; bz /= lb;
      if (i === 0) { ax = bx; az = bz; }
      if (i === n - 1) { bx = ax; bz = az; }
      // Miter: average of the two normals, stretched so the road keeps its width at bends.
      let nx = -(az + bz), nz = ax + bx;
      const ln = Math.hypot(nx, nz) || 1;
      nx /= ln; nz /= ln;
      const dot = Math.max(0.35, nx * -az + nz * ax);
      const m = half / dot;
      let x = p[i * 2], z = p[i * 2 + 1];
      // Push the ends out a little so junctions have no gaps.
      if (i === 0) { x -= ax * half * 0.6; z -= az * half * 0.6; }
      if (i === n - 1) { x += bx * half * 0.6; z += bz * half * 0.6; }
      pos.push(x + nx * m, style.y, z + nz * m, x - nx * m, style.y, z - nz * m);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i > 0) {
        const a = base + (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    if (road.k === 'primary' || road.k === 'major' || road.k === 'secondary') dashes(p, style.y + 0.01, marks);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  fixUpward(g);
  const mesh = new THREE.Mesh(g, withTurf(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), turf, tint(0.16)));
  mesh.receiveShadow = true;

  // Glowing lane dashes along the bigger roads.
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(marks, 3));
  mg.computeVertexNormals();
  fixUpward(mg);
  const lines = new THREE.Mesh(
    mg,
    new THREE.MeshStandardMaterial({ color: 0xffd36e, emissive: 0xffb347, emissiveIntensity: 0.6 }),
  );
  mesh.add(lines);
  return mesh;
}

/** Make every triangle of a flat geometry face up (+y), so one side is enough. */
function fixUpward(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position');
  const index = g.getIndex();
  const tri = (k: number) => (index ? index.getX(k) : k);
  const count = index ? index.count : p.count;
  const arr = index ? (index.array as Uint32Array | Uint16Array) : null;
  const pa = p.array as Float32Array;
  for (let t = 0; t < count; t += 3) {
    const a = tri(t), b = tri(t + 1), c = tri(t + 2);
    const ux = p.getX(b) - p.getX(a), uz = p.getZ(b) - p.getZ(a);
    const vx = p.getX(c) - p.getX(a), vz = p.getZ(c) - p.getZ(a);
    if (uz * vx - ux * vz < 0) {
      if (arr) { arr[t + 1] = c; arr[t + 2] = b; }
      else for (let k = 0; k < 3; k++) {
        const tmp = pa[(t + 1) * 3 + k];
        pa[(t + 1) * 3 + k] = pa[(t + 2) * 3 + k];
        pa[(t + 2) * 3 + k] = tmp;
      }
    }
  }
  g.computeVertexNormals();
}

function dashes(p: number[], y: number, out: number[]) {
  const dash = 3, gap = 6, w = 0.18;
  let carry = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.01) continue;
    const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    const nx = -dz * w, nz = dx * w;
    for (let s = carry; s < len; s += dash + gap) {
      const e = Math.min(len, s + dash);
      const ax = x0 + dx * s, az = z0 + dz * s, bx = x0 + dx * e, bz = z0 + dz * e;
      out.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz);
      out.push(ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
      carry = s + dash + gap - len;
    }
  }
}

const WALL_COLORS = [0x6c6680, 0x5d6478, 0x7a7088, 0x58606e, 0x847a8c, 0x4f5868];

/** Which stronghold each named OSM building belongs to. */
const STRONGHOLD_BY_BUILDING = new Map<string, number>();
TERRITORIES.forEach((t, i) => t.buildings?.forEach((name) => STRONGHOLD_BY_BUILDING.set(name, i)));

function buildings(map: MapData, turf: Turf) {
  const pos: number[] = [];
  const col: number[] = [];
  const win: number[] = []; // (u along wall, v up the wall, seed); seed < 0 means no windows
  const tid: number[] = []; // (territory index, 1 if part of a stronghold)
  const c = new THREE.Color();
  const roof = new THREE.Color();
  const rand = rng(1965);
  const rimPos: number[] = [];
  const rimTurf: number[] = [];
  const labelHeights = TERRITORIES.map(() => 0);

  for (const b of map.buildings) {
    let p = b.p;
    if (signedArea(p) < 0) p = reversePoints(p);
    const n = p.length / 2;
    const h = b.h;
    const seed = rand();
    c.setHex(WALL_COLORS[Math.floor(rand() * WALL_COLORS.length)]);
    c.offsetHSL(0, 0, (rand() - 0.5) * 0.06);
    roof.setHex(0x3a3646).offsetHSL(0, 0, (rand() - 0.5) * 0.04);

    let cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += p[i * 2]; cz += p[i * 2 + 1]; }
    const stronghold = b.n !== undefined ? STRONGHOLD_BY_BUILDING.get(b.n) : undefined;
    const territory = stronghold ?? Math.max(0, turf.at(cx / n, cz / n));
    const strong = stronghold !== undefined ? 1 : 0;
    if (strong) labelHeights[territory] = Math.max(labelHeights[territory], Math.min(h, 60));
    if (h > 14 || strong) rim(p, h, territory, strong, rimPos, rimTurf);

    // Walls.
    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      // CCW ring: outward is to the right of a->b. Triangles a0,a1,b1 and a0,b1,b0 face outward.
      const quad = [
        [ax, 0, az, u, 0], [ax, h, az, u, h], [bx, h, bz, u + len, h],
        [ax, 0, az, u, 0], [bx, h, bz, u + len, h], [bx, 0, bz, u + len, 0],
      ];
      for (const v of quad) {
        pos.push(v[0], v[1], v[2]);
        // Darker near the ground for a bit of fake ambient occlusion.
        const shade = 0.55 + 0.45 * Math.min(1, v[1] / 25);
        col.push(c.r * shade, c.g * shade, c.b * shade);
        win.push(v[3], v[4], h > 7 ? seed : -1);
        tid.push(territory, strong);
      }
      u += len;
    }

    // Roof.
    const contour: THREE.Vector2[] = [];
    for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(p[i * 2], p[i * 2 + 1]));
    for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) {
      let [a, bb, cc] = t;
      const ux = contour[bb].x - contour[a].x, uz = contour[bb].y - contour[a].y;
      const vx = contour[cc].x - contour[a].x, vz = contour[cc].y - contour[a].y;
      if (uz * vx - ux * vz < 0) [bb, cc] = [cc, bb];
      for (const k of [a, bb, cc]) {
        pos.push(contour[k].x, h, contour[k].y);
        col.push(roof.r, roof.g, roof.b);
        win.push(0, 0, -1);
        tid.push(territory, strong);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('win', new THREE.Float32BufferAttribute(win, 3));
  g.setAttribute('turf', new THREE.Float32BufferAttribute(tid, 2));
  g.computeVertexNormals();

  const mat = withTurf(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05 }),
    turf,
    `varying vec3 vWin;
varying vec2 vTurf;
float winHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
@@
vec4 own = turfOwner(vTurf.x);
vec4 flags = turfFlags(vTurf.x);
float strong = vTurf.y;
float pulse = 0.55 + 0.45 * sin(uTime * 4.0);
// Buildings take the colour of the gang that holds their turf; strongholds most of all.
diffuseColor.rgb = mix(diffuseColor.rgb, own.rgb * 0.75, 0.22 + strong * 0.4);
totalEmissiveRadiance += own.rgb * (strong * 0.18 + own.a * 0.35 + flags.r * 0.3 * pulse + flags.g * 0.12 * pulse + flags.b * 0.12);
if (vWin.z >= 0.0) {
  vec2 cellSize = vec2(3.4, 3.6);
  vec2 cell = floor(vWin.xy / cellSize);
  vec2 f = fract(vWin.xy / cellSize);
  float pane = step(0.18, f.x) * step(f.x, 0.82) * step(0.28, f.y) * step(f.y, 0.78);
  float r = winHash(cell + vWin.z * 97.0);
  float lit = step(0.58, r) * step(1.0, cell.y);
  vec3 warm = vec3(1.0, 0.72, 0.38);
  vec3 cold = vec3(0.35, 0.85, 1.0);
  vec3 wc = r > 0.88 ? mix(cold, own.rgb, 0.6) : warm;
  totalEmissiveRadiance += pane * lit * wc * 1.2;
  diffuseColor.rgb *= 1.0 - pane * 0.45;
  // Shop fronts: a glowing strip along the ground floor, in the gang's colour.
  float shop = step(0.6, vWin.y) * step(vWin.y, 2.8) * step(0.5, winHash(vec2(floor(vWin.x / 9.0), vWin.z)));
  totalEmissiveRadiance += shop * mix(warm, own.rgb, 0.7) * 0.7;
}`,
    `attribute vec3 win;
attribute vec2 turf;
varying vec3 vWin;
varying vec2 vTurf;
@@vWin = win;
vTurf = turf;`,
  );

  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'buildings';

  // Neon edges along the roofs, in the colour of the gang that holds the turf.
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rimPos, 3));
  rg.setAttribute('turf', new THREE.Float32BufferAttribute(rimTurf, 2));
  const rimMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  rimMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, turf.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 turf;\nvarying vec2 vTurf;\nvarying vec3 vTurfPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTurf = turf;\nvTurfPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TURF_GLSL}\nvarying vec2 vTurf;`)
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 own = turfOwner(vTurf.x);\nvec4 diffuseColor = vec4(own.rgb * (2.0 + vTurf.y * 1.2 + own.a * 1.0), opacity);',
      );
  };
  const rims = new THREE.Mesh(rg, rimMat);
  rims.name = 'roof-neon';
  return { mesh, rims, labelHeights };
}

/** A thin glowing band just under the roof line, facing outward. Strongholds get a thicker one. */
function rim(p: number[], h: number, territory: number, strong: number, pos: number[], turfOut: number[]) {
  const n = p.length / 2;
  const y0 = h - (strong ? 2.2 : 0.9), y1 = h - 0.35, out = 0.06;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = ((bz - az) / len) * out, nz = (-(bx - ax) / len) * out;
    pos.push(ax + nx, y0, az + nz, ax + nx, y1, az + nz, bx + nx, y1, bz + nz);
    pos.push(ax + nx, y0, az + nz, bx + nx, y1, bz + nz, bx + nx, y0, bz + nz);
    for (let v = 0; v < 6; v++) turfOut.push(territory, strong);
  }
}

function treeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.22, 0.3, 2.6, 5).translate(0, 1.3, 0);
  const canopy = new THREE.IcosahedronGeometry(2.1, 0).scale(1, 0.85, 1).translate(0, 3.9, 0);
  const paint = (g: THREE.BufferGeometry, hex: number) => {
    const cc = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [cc.r, cc.g, cc.b]), 3));
    return g.toNonIndexed();
  };
  const merged = mergeGeometries([paint(trunk.toNonIndexed(), 0x5a3f2e), paint(canopy.toNonIndexed(), 0xffffff)]);
  merged.computeVertexNormals();
  return merged;
}

function trees(map: MapData, grid: CollisionGrid): THREE.InstancedMesh {
  const spots: number[] = map.trees.slice();
  // Scatter extra trees inside parks.
  const rand = rng(2077);
  for (const p of map.parks) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
      minZ = Math.min(minZ, p[i + 1]); maxZ = Math.max(maxZ, p[i + 1]);
    }
    const area = Math.abs(signedArea(p));
    const want = Math.min(400, Math.floor(area / 180));
    for (let k = 0, tries = 0; k < want && tries < want * 4; tries++) {
      const x = minX + rand() * (maxX - minX);
      const z = minZ + rand() * (maxZ - minZ);
      if (!inRing(x, z, p) || grid.blocked(x, z)) continue;
      spots.push(x, z);
      k++;
    }
  }
  const count = Math.min(20000, spots.length / 2);
  const mesh = new THREE.InstancedMesh(
    treeGeometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
    count,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const color = new THREE.Color();
  const greens = [0x3f8a4e, 0x4f9a3e, 0x2f7a5a, 0x5aa04a, 0x3a7046];
  for (let i = 0; i < count; i++) {
    const k = rand() * 0.6 + 0.75;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    m.compose(v.set(spots[i * 2], 0, spots[i * 2 + 1]), q, s.set(k, k * (0.9 + rand() * 0.3), k));
    mesh.setMatrixAt(i, m);
    color.setHex(greens[Math.floor(rand() * greens.length)]);
    mesh.setColorAt(i, color);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'trees';
  return mesh;
}

function inRing(x: number, z: number, p: number[]) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const zi = p[i + 1], zj = p[j + 1];
    if (zi > z !== zj > z && x < ((p[j] - p[i]) * (z - zi)) / (zj - zi) + p[i]) inside = !inside;
  }
  return inside;
}

function stations(map: MapData): THREE.Group {
  const g = new THREE.Group();
  const pylon = new THREE.CylinderGeometry(0.6, 0.9, 9, 6).translate(0, 4.5, 0);
  const ring = new THREE.TorusGeometry(2.2, 0.18, 6, 24).rotateX(Math.PI / 2).translate(0, 9.4, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x113344, emissive: 0x2fd4e6, emissiveIntensity: 1.6 });
  for (const s of map.stations) {
    const a = new THREE.Mesh(pylon, mat);
    const b = new THREE.Mesh(ring, mat);
    a.position.set(s.x, 0, s.z);
    b.position.set(s.x, 0, s.z);
    a.castShadow = true;
    g.add(a, b);
  }
  g.name = 'stations';
  return g;
}
