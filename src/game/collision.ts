// A coarse grid of blocked cells (building footprints), so the player and later the
// cars can slide along walls without a physics engine.

import { worldRect } from '../world/geo.ts';

export class CollisionGrid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  readonly minX: number;
  readonly minZ: number;
  private readonly cells: Uint8Array;

  constructor(cell = 1.5, rect = worldRect()) {
    this.cell = cell;
    this.minX = rect.minX;
    this.minZ = rect.minZ;
    this.cols = Math.ceil((rect.maxX - rect.minX) / cell);
    this.rows = Math.ceil((rect.maxZ - rect.minZ) / cell);
    this.cells = new Uint8Array(this.cols * this.rows);
  }

  /** Mark every cell whose centre is inside the polygon (flat [x, z, ...] ring). */
  fillPolygon(p: number[]) {
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 1; i < p.length; i += 2) {
      minZ = Math.min(minZ, p[i]);
      maxZ = Math.max(maxZ, p[i]);
    }
    const r0 = Math.max(0, Math.floor((minZ - this.minZ) / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor((maxZ - this.minZ) / this.cell));
    const xs: number[] = [];
    for (let r = r0; r <= r1; r++) {
      const z = this.minZ + (r + 0.5) * this.cell;
      // Scanline: find where this row crosses the polygon edges.
      xs.length = 0;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const zi = p[i + 1], zj = p[j + 1];
        if (zi > z !== zj > z) xs.push(p[i] + ((z - zi) * (p[j] - p[i])) / (zj - zi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - this.minX) / this.cell - 0.5));
        const c1 = Math.min(this.cols - 1, Math.floor((xs[k + 1] - this.minX) / this.cell - 0.5));
        for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c] = 1;
      }
    }
  }

  /** True inside a building or outside the map. */
  blocked(x: number, z: number): boolean {
    const c = Math.floor((x - this.minX) / this.cell);
    const r = Math.floor((z - this.minZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.cells[r * this.cols + c] === 1;
  }

  /** True if a circle of this radius at (x, z) touches a blocked cell. */
  hits(x: number, z: number, radius: number): boolean {
    return (
      this.blocked(x, z) ||
      this.blocked(x + radius, z) ||
      this.blocked(x - radius, z) ||
      this.blocked(x, z + radius) ||
      this.blocked(x, z - radius)
    );
  }

  /** The open spot closest to (x, z), searching outward in rings. */
  nearestOpen(x: number, z: number, radius: number): [number, number] {
    if (!this.hits(x, z, radius)) return [x, z];
    for (let r = this.cell; r < 400; r += this.cell) {
      const steps = Math.max(8, Math.ceil((2 * Math.PI * r) / this.cell));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (!this.hits(px, pz, radius)) return [px, pz];
      }
    }
    return [x, z];
  }
}
