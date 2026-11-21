// Splits the city into territories (every point belongs to the nearest anchor) and works out
// which territories border each other. Water only counts as a border where a road crosses it,
// so the Singapore River can only be crossed at its bridges.

import { TERRITORIES } from '../game/data.ts';
import { CollisionGrid } from '../game/collision.ts';
import { project, worldRect, type XZ } from './geo.ts';
import type { MapData } from './mapData.ts';

export const anchors: XZ[] = TERRITORIES.map((t) => project(t.lat, t.lon));

/** Index into TERRITORIES of the territory that owns world point (x, z). */
export function territoryAt(x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const dx = anchors[i][0] - x;
    const dz = anchors[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export interface TerritoryMap {
  /** Grid of territory indices covering the world rectangle. */
  ids: Uint8Array;
  cols: number;
  rows: number;
  cell: number;
  minX: number;
  minZ: number;
  /** adjacency[i] lists the territories bordering territory i. */
  adjacency: number[][];
}

/** Metres of shared land border needed before two territories count as neighbours. */
const MIN_BORDER = 24;

export function buildTerritoryMap(map: MapData, cell = 4): TerritoryMap {
  const rect = worldRect();
  const cols = Math.ceil((rect.maxX - rect.minX) / cell);
  const rows = Math.ceil((rect.maxZ - rect.minZ) / cell);
  const ids = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const z = rect.minZ + (r + 0.5) * cell;
    for (let c = 0; c < cols; c++) ids[r * cols + c] = territoryAt(rect.minX + (c + 0.5) * cell, z);
  }

  // Land mask: not water, or water with a road over it (a bridge).
  const water = new CollisionGrid(cell, rect);
  for (const p of map.water) water.fillPolygon(p);
  const bridge = new Uint8Array(cols * rows);
  for (const road of map.roads) {
    if (road.k === 'foot' || road.k === 'service') continue;
    const p = road.p;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const len = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
      const steps = Math.max(1, Math.ceil(len / (cell / 2)));
      for (let s = 0; s <= steps; s++) {
        const x = p[i] + ((p[i + 2] - p[i]) * s) / steps;
        const z = p[i + 1] + ((p[i + 3] - p[i + 1]) * s) / steps;
        const c = Math.floor((x - rect.minX) / cell);
        const r = Math.floor((z - rect.minZ) / cell);
        if (c >= 0 && r >= 0 && c < cols && r < rows) bridge[r * cols + c] = 1;
      }
    }
  }
  const land = (c: number, r: number) => {
    const x = rect.minX + (c + 0.5) * cell, z = rect.minZ + (r + 0.5) * cell;
    return !water.blocked(x, z) || bridge[r * cols + c] === 1;
  };

  const n = TERRITORIES.length;
  const border = new Float32Array(n * n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = ids[r * cols + c];
      if (!land(c, r)) continue;
      if (c + 1 < cols) {
        const b = ids[r * cols + c + 1];
        if (a !== b && land(c + 1, r)) border[a * n + b] = border[b * n + a] += cell;
      }
      if (r + 1 < rows) {
        const b = ids[(r + 1) * cols + c];
        if (a !== b && land(c, r + 1)) border[a * n + b] = border[b * n + a] += cell;
      }
    }
  }
  const adjacency: number[][] = [];
  for (let i = 0; i < n; i++) {
    adjacency.push([]);
    for (let j = 0; j < n; j++) if (i !== j && border[i * n + j] >= MIN_BORDER) adjacency[i].push(j);
  }
  return { ids, cols, rows, cell, minX: rect.minX, minZ: rect.minZ, adjacency };
}
