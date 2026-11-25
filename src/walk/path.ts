// Street geometry for the rainy walk: picks one real street out of the map data and works out the
// line a walker follows along its pavement. Pure functions (no DOM, no three.js) so they are testable.

import type { Building, Road } from '../world/mapData.ts';
import { pointInRing } from '../world/polygon.ts';

export type Pt = [x: number, z: number];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function toPts(p: number[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < p.length; i += 2) out.push([p[i], p[i + 1]]);
  return out;
}

export function lineLength(line: Pt[]) {
  let L = 0;
  for (let i = 1; i < line.length; i++) L += dist(line[i - 1], line[i]);
  return L;
}

/**
 * Joins the pieces of a named road (OSM splits streets into many ways) into its longest continuous
 * chain, running west to east. Footpaths with the same name are ignored.
 */
export function streetLine(roads: Road[], name: string, tolerance = 1.5): { line: Pt[]; width: number } {
  const parts = roads.filter((r) => r.n === name && r.k !== 'foot' && r.k !== 'pedestrian');
  const segs = parts.map((r) => toPts(r.p));
  const used = new Array(segs.length).fill(false);
  let best: Pt[] = [];
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    let chain = segs[s].slice();
    for (let grew = true; grew; ) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        const g = segs[i];
        const head = chain[0];
        const tail = chain[chain.length - 1];
        if (dist(tail, g[0]) < tolerance) chain = chain.concat(g.slice(1));
        else if (dist(tail, g[g.length - 1]) < tolerance) chain = chain.concat(g.slice(0, -1).reverse());
        else if (dist(head, g[g.length - 1]) < tolerance) chain = g.slice(0, -1).concat(chain);
        else if (dist(head, g[0]) < tolerance) chain = g.slice(1).reverse().concat(chain);
        else continue;
        used[i] = grew = true;
      }
    }
    if (lineLength(chain) > lineLength(best)) best = chain;
  }
  if (best.length && best[0][0] > best[best.length - 1][0]) best.reverse();
  // The most common width along the street (some short pieces are wider at junctions).
  const widths = parts.map((r) => r.w).sort((a, b) => a - b);
  return { line: best, width: widths[Math.floor(widths.length / 2)] ?? 12 };
}

/** The part of a west-to-east line between two x values. */
export function clipX(line: Pt[], x0: number, x1: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    const prev = line[i - 1];
    const lerpAt = (x: number): Pt => {
      const t = (x - prev[0]) / (p[0] - prev[0]);
      return [x, prev[1] + (p[1] - prev[1]) * t];
    };
    if (prev && prev[0] < x0 && p[0] >= x0) out.push(lerpAt(x0));
    if (p[0] >= x0 && p[0] <= x1) out.push(p);
    if (prev && prev[0] <= x1 && p[0] > x1) {
      out.push(lerpAt(x1));
      break;
    }
  }
  return out;
}

/** Points every `step` metres along a line. */
export function resample(line: Pt[], step: number): Pt[] {
  const out: Pt[] = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const d = dist(a, b);
    let t = step - carry;
    while (t <= d) {
      out.push([a[0] + ((b[0] - a[0]) * t) / d, a[1] + ((b[1] - a[1]) * t) / d]);
      t += step;
    }
    carry = d - (t - step);
  }
  const last = line[line.length - 1];
  if (dist(out[out.length - 1], last) > step * 0.3) out.push(last);
  return out;
}

/** Moving-average smoothing (ends stay put), to take the kinks out of OSM corners. */
export function smooth(line: Pt[], radius: number, passes = 2): Pt[] {
  let cur = line;
  for (let k = 0; k < passes; k++) {
    cur = cur.map((p, i) => {
      if (i === 0 || i === cur.length - 1) return p;
      let x = 0;
      let z = 0;
      let n = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(cur.length - 1, i + radius); j++) {
        x += cur[j][0];
        z += cur[j][1];
        n++;
      }
      return [x / n, z / n] as Pt;
    });
  }
  return cur;
}

/** Left-hand normal of the line at each point (+z is south, so heading east the left is north, -z). */
export function normals(line: Pt[]): Pt[] {
  return line.map((_, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [dz / l, -dx / l] as Pt;
  });
}

/** The line moved sideways by `d` metres (positive = to the left). */
export function offsetLine(line: Pt[], d: number): Pt[] {
  const n = normals(line);
  return line.map((p, i) => [p[0] + n[i][0] * d, p[1] + n[i][1] * d] as Pt);
}

/** Distance from a point to a polyline. */
export function distToLine(x: number, z: number, line: Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const [bx, bz] = line[i];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** Bounding-circle test then exact: is the building within `r` metres of the line? */
export function buildingNear(b: Building, line: Pt[], r: number): boolean {
  for (let i = 0; i < b.p.length; i += 2) if (distToLine(b.p[i], b.p[i + 1], line) < r) return true;
  return false;
}

export interface WalkRoute {
  /** Road centreline of the stretch (west to east), resampled every 2 m and smoothed. */
  centre: Pt[];
  /** Carriageway width in metres. */
  width: number;
  /** The line the walker follows, on the pavement. */
  walk: Pt[];
  length: number;
}

/**
 * The walking route: a stretch of a named street between two x values, on the pavement on one side.
 * Where a building's footprint reaches over the pavement the walker keeps closer to the kerb.
 */
export function walkRoute(
  roads: Road[],
  buildings: Building[],
  opts: { street: string; x0: number; x1: number; side: 1 | -1; pavement: number },
): WalkRoute {
  const { line, width } = streetLine(roads, opts.street);
  const centre = smooth(resample(clipX(line, opts.x0, opts.x1), 2), 4, 3);
  const n = normals(centre);
  const near = buildings.filter((b) => buildingNear(b, centre, 60));
  const kerb = width / 2 + 1.2;
  const want = width / 2 + opts.pavement;
  const offs = centre.map((p, i) => {
    let d = want;
    const inside = (dd: number) =>
      near.some((b) => pointInRing(p[0] + n[i][0] * dd * opts.side, p[1] + n[i][1] * dd * opts.side, b.p));
    // Step towards the kerb until the walker (and an arm's length either side of them) is in the open.
    while (d > kerb && (inside(d) || inside(d + 1.5))) d -= 0.5;
    return d;
  });
  // Ease the sideways offset so the walker doesn't zigzag around building corners.
  const eased = offs.map((_, i) => {
    let m = Infinity;
    for (let j = Math.max(0, i - 8); j <= Math.min(offs.length - 1, i + 8); j++) m = Math.min(m, offs[j]);
    return m;
  });
  const soft = smooth(eased.map((d) => [d, 0] as Pt), 6, 2).map((p) => p[0]);
  const walk = centre.map((p, i) => [p[0] + n[i][0] * soft[i] * opts.side, p[1] + n[i][1] * soft[i] * opts.side] as Pt);
  return { centre, width, walk, length: lineLength(walk) };
}
