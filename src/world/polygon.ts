// Small 2D geometry helpers used by the map tool and the game. Points are flat [x, z, ...] arrays.

/** Douglas-Peucker simplification of a polyline (or an open ring). */
export function simplify(p: number[], tolerance: number): number[] {
  const n = p.length / 2;
  if (n <= 2) return p.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = p[a * 2], az = p[a * 2 + 1];
    const bx = p[b * 2], bz = p[b * 2 + 1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1e-12;
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = p[i * 2], pz = p[i * 2 + 1];
      let t = ((px - ax) * dx + (pz - az) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ez = az + t * dz - pz;
      const d = ex * ex + ez * ez;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

/** Signed area of a ring; positive when the points go counter-clockwise in x/z. */
export function signedArea(p: number[]): number {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
  return a / 2;
}

export function pointInRing(x: number, z: number, p: number[]): boolean {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1];
    const xj = p[j * 2], zj = p[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Join way segments (lists of points) that share endpoints into closed rings,
 * as OSM multipolygon relations need. Unclosable leftovers are dropped.
 */
export function stitchRings(segments: number[][]): number[][] {
  const left = segments.filter((s) => s.length >= 4).map((s) => s.slice());
  const rings: number[][] = [];
  const same = (p: number[], i: number, q: number[], j: number) =>
    Math.abs(p[i] - q[j]) < 1e-6 && Math.abs(p[i + 1] - q[j + 1]) < 1e-6;
  while (left.length) {
    let ring = left.shift()!;
    let grew = true;
    while (!same(ring, 0, ring, ring.length - 2) && grew) {
      grew = false;
      for (let k = 0; k < left.length; k++) {
        const s = left[k];
        const end = ring.length - 2;
        if (same(ring, end, s, 0)) ring = ring.concat(s.slice(2));
        else if (same(ring, end, s, s.length - 2)) ring = ring.concat(reversePoints(s).slice(2));
        else if (same(ring, 0, s, s.length - 2)) ring = s.concat(ring.slice(2));
        else if (same(ring, 0, s, 0)) ring = reversePoints(s).concat(ring.slice(2));
        else continue;
        left.splice(k, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 8 && same(ring, 0, ring, ring.length - 2)) rings.push(ring.slice(0, -2));
  }
  return rings;
}

export function reversePoints(p: number[]): number[] {
  const out: number[] = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
}

/** Drop the repeated closing point of a ring, if present. */
export function openRing(p: number[]): number[] {
  const n = p.length;
  if (n >= 4 && p[0] === p[n - 2] && p[1] === p[n - 1]) return p.slice(0, -2);
  return p;
}
