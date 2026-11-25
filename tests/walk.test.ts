import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WalkData } from '../src/walk/walkData.ts';
import { clipX, distToLine, lineLength, resample, streetLine, walkRoute } from '../src/walk/path.ts';
import { lightState } from '../src/walk/traffic.ts';
import { pointInRing } from '../src/world/polygon.ts';

const data = JSON.parse(readFileSync('public/data/walk.json', 'utf8')) as WalkData;
const ground = data.parts.filter((p) => !p.canopy && p.b < 3);
const route = (side: 1 | -1) => walkRoute(data.roads, ground, { street: 'Orchard Road', x0: -1110, x1: -470, side, pavement: 5 });

describe('rainy walk data', () => {
  it('has the Orchard Road landmarks with their real 3D shapes', () => {
    const names = new Set(data.labels.map((l) => l.n));
    for (const n of ['ION Orchard', 'Wisma Atria', 'Ngee Ann City', 'Lucky Plaza', 'Paragon']) expect(names.has(n)).toBe(true);
    // The Orchard Residences tower above ION is 218 m tall; Ngee Ann City is reddish-brown stone.
    expect(Math.max(...data.parts.filter((p) => p.o === 'ION Orchard').map((p) => p.h))).toBeGreaterThan(200);
    expect(data.parts.some((p) => p.o === 'Ngee Ann City' && p.c === '#9c6e5f' && p.m === 'stone')).toBe(true);
  });

  it('has Orchard Road as a one-way street with a bus lane, and its bus stops', () => {
    const orchard = data.roads.filter((r) => r.n === 'Orchard Road');
    expect(orchard.some((r) => r.oneway && r.bus && (r.lanes ?? 0) >= 4)).toBe(true);
    expect(data.busStops.some((s) => /Orchard Stn|Orchard Station/.test(s.n))).toBe(true);
    expect(data.crossings.some((c) => c.signals)).toBe(true);
  });
});

describe('rainy walk route', () => {
  it('joins Orchard Road into one long west-to-east line', () => {
    const { line, width } = streetLine(data.roads, 'Orchard Road');
    expect(lineLength(line)).toBeGreaterThan(1000);
    expect(line[0][0]).toBeLessThan(line[line.length - 1][0]);
    expect(width).toBeGreaterThan(10);
  });

  it('clips and resamples lines', () => {
    const line: [number, number][] = [[0, 0], [10, 0], [20, 10]];
    const c = clipX(line, 5, 15);
    expect(c[0]).toEqual([5, 0]);
    expect(c[c.length - 1][0]).toBeCloseTo(15);
    expect(resample([[0, 0], [10, 0]], 2)).toHaveLength(6);
  });

  for (const side of [1, -1] as const) {
    it(`keeps the walker on the pavement and out of buildings (side ${side})`, () => {
      const r = route(side);
      expect(r.length).toBeGreaterThan(600);
      const near = ground.filter((b) => distToLine(b.p[0], b.p[1], r.centre) < 150);
      for (const [x, z] of r.walk) {
        expect(distToLine(x, z, r.centre)).toBeGreaterThan(r.width / 2);
        expect(near.some((b) => pointInRing(x, z, b.p))).toBe(false);
      }
    });
  }
});

describe('traffic lights', () => {
  it('never shows green to cars and pedestrians at once', () => {
    for (let t = 0; t < 200; t += 0.25) {
      const s = lightState(t);
      expect([s.vg, s.va, s.vr].filter(Boolean)).toHaveLength(1);
      expect(s.pg && !s.vr).toBe(false);
    }
  });
});
