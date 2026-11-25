import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MapData } from '../src/world/mapData.ts';
import { clipX, distToLine, lineLength, resample, streetLine, walkRoute } from '../src/walk/path.ts';
import { pointInRing } from '../src/world/polygon.ts';

const map = JSON.parse(readFileSync('public/data/map.json', 'utf8')) as MapData;

describe('rainy walk route', () => {
  it('joins Orchard Road into one long west-to-east line', () => {
    const { line, width } = streetLine(map.roads, 'Orchard Road');
    expect(lineLength(line)).toBeGreaterThan(2000);
    expect(line[0][0]).toBeLessThan(line[line.length - 1][0]);
    expect(width).toBeGreaterThan(10);
  });

  it('clips and resamples lines', () => {
    const line: [number, number][] = [[0, 0], [10, 0], [20, 10]];
    const c = clipX(line, 5, 15);
    expect(c[0]).toEqual([5, 0]);
    expect(c[c.length - 1][0]).toBeCloseTo(15);
    const r = resample([[0, 0], [10, 0]], 2);
    expect(r).toHaveLength(6);
  });

  for (const side of [1, -1] as const) {
    it(`keeps the walker on the pavement and out of buildings (side ${side})`, () => {
      const route = walkRoute(map.roads, map.buildings, { street: 'Orchard Road', x0: -1110, x1: -470, side, pavement: 5 });
      expect(route.length).toBeGreaterThan(600);
      const near = map.buildings.filter((b) => distToLine(b.p[0], b.p[1], route.centre) < 150);
      for (const [x, z] of route.walk) {
        // Off the carriageway...
        expect(distToLine(x, z, route.centre)).toBeGreaterThan(route.width / 2);
        // ...and never inside a building.
        expect(near.some((b) => pointInRing(x, z, b.p))).toBe(false);
      }
    });
  }
});
