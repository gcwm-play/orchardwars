// Small geometry helpers for the walk: a builder for merged meshes and flat strips along lines.

import * as THREE from 'three/webgpu';
import { normals, resample, type Pt } from './path.ts';

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

export type V3 = [number, number, number];
export const UP: V3 = [0, 1, 0];

/** Accumulates triangles for one merged mesh, with one extra float attribute block. */
export class Geo {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  extra: number[] = [];
  idx: number[] = [];
  constructor(readonly extraSize: number) {}

  vert(x: number, y: number, z: number, n: V3, c: THREE.Color, e: number[]) {
    this.pos.push(x, y, z);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c.r, c.g, c.b);
    for (let i = 0; i < this.extraSize; i++) this.extra.push(e[i] ?? 0);
    return this.pos.length / 3 - 1;
  }

  /** A quad from four corners in order around it; `n` is its normal. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, col: THREE.Color, ea: number[], eb = ea, ec = ea, ed = ea) {
    const i = this.vert(...a, n, col, ea);
    this.vert(...b, n, col, eb);
    this.vert(...c, n, col, ec);
    this.vert(...d, n, col, ed);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** A triangle with its normal worked out from the winding (counter-clockwise = front). */
  tri(a: V3, b: V3, c: V3, col: THREE.Color, e: number[]) {
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = ab.cross(ac).normalize();
    const nn: V3 = [n.x, n.y, n.z];
    const i = this.vert(...a, nn, col, e);
    this.vert(...b, nn, col, e);
    this.vert(...c, nn, col, e);
    this.idx.push(i, i + 1, i + 2);
  }

  get empty() {
    return this.idx.length === 0;
  }

  /** Builds the geometry; the extra floats go to attributes of up to 4 floats each, named in order. */
  build(...names: string[]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const n = this.pos.length / 3;
    names.forEach((name, k) => {
      const size = Math.min(4, this.extraSize - k * 4);
      const a = new Float32Array(n * size);
      for (let i = 0; i < n; i++) for (let j = 0; j < size; j++) a[i * size + j] = this.extra[i * this.extraSize + k * 4 + j];
      g.setAttribute(name, new THREE.BufferAttribute(a, size));
    });
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * A flat strip along a line at height y. Extra attribute: (kind, metres along, metres across from the
 * line, 0), so shaders can lay tiles, lanes and wheel ruts along the street.
 */
export function ribbon(g: Geo, line: Pt[], width: number, y: number, c: THREE.Color, kind: number, across = 0, along0 = 0) {
  if (line.length < 2) return;
  const n = normals(line);
  const start = g.pos.length / 3;
  let u = along0;
  for (let i = 0; i < line.length; i++) {
    if (i) u += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    const [x, z] = line[i];
    const [nx, nz] = n[i];
    g.vert(x + (nx * width) / 2, y, z + (nz * width) / 2, UP, c, [kind, u, across + width / 2, 0]);
    g.vert(x - (nx * width) / 2, y, z - (nz * width) / 2, UP, c, [kind, u, across - width / 2, 0]);
  }
  for (let i = 0; i < line.length - 1; i++) {
    const a = start + i * 2;
    g.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

/** Dashes along a line (`on` metres painted, `off` metres gap). */
export function dashes(g: Geo, line: Pt[], width: number, y: number, c: THREE.Color, kind: number, on: number, off: number) {
  const pts = resample(line, 0.5);
  let piece: Pt[] = [];
  pts.forEach((p, i) => {
    if ((i * 0.5) % (on + off) < on) piece.push(p);
    else if (piece.length) {
      ribbon(g, piece, width, y, c, kind);
      piece = [];
    }
  });
  ribbon(g, piece, width, y, c, kind);
}

/** Splits a line into the pieces whose points pass a test (for gaps at side roads). */
export function pieces(line: Pt[], keep: (p: Pt, i: number) => boolean): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  line.forEach((p, i) => {
    if (keep(p, i)) cur.push(p);
    else if (cur.length) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
  });
  if (cur.length > 1) out.push(cur);
  return out;
}

export const pts = (p: number[]): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < p.length; i += 2) out.push([p[i], p[i + 1]]);
  return out;
};

export function centroid(p: number[]): Pt {
  let x = 0;
  let z = 0;
  for (let i = 0; i < p.length; i += 2) {
    x += p[i];
    z += p[i + 1];
  }
  return [x / (p.length / 2), z / (p.length / 2)];
}

/** Bounding box of a flat ring. */
export function bbox(p: number[]) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    minX = Math.min(minX, p[i]);
    maxX = Math.max(maxX, p[i]);
    minZ = Math.min(minZ, p[i + 1]);
    maxZ = Math.max(maxZ, p[i + 1]);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Nearest point on a line, its index and the distance along the line to it. */
export function nearestOnLine(x: number, z: number, line: Pt[]) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = (line[i][0] - x) ** 2 + (line[i][1] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return { i: best, d: Math.sqrt(bd), p: line[best] };
}
