import { describe, expect, it } from 'vitest';
import { project, unproject, worldRect } from '../src/world/geo.ts';
import { territoryAt } from '../src/world/territoryMap.ts';
import { TERRITORIES } from '../src/game/data.ts';
import { pointInRing, signedArea, simplify, stitchRings } from '../src/world/polygon.ts';
import { CollisionGrid } from '../src/game/collision.ts';

describe('geo', () => {
  it('round-trips lat/lon through world metres', () => {
    const [x, z] = project(1.3039, 103.8318);
    const back = unproject(x, z);
    expect(back.lat).toBeCloseTo(1.3039, 6);
    expect(back.lon).toBeCloseTo(103.8318, 6);
  });

  it('puts north at -z and east at +x', () => {
    const [x1, z1] = project(1.29, 103.83);
    const [x2, z2] = project(1.30, 103.84);
    expect(x2).toBeGreaterThan(x1);
    expect(z2).toBeLessThan(z1);
  });

  it('covers roughly 4.3 km by 2.7 km', () => {
    const r = worldRect();
    expect(r.maxX - r.minX).toBeGreaterThan(4000);
    expect(r.maxX - r.minX).toBeLessThan(4600);
    expect(r.maxZ - r.minZ).toBeGreaterThan(2500);
    expect(r.maxZ - r.minZ).toBeLessThan(2900);
  });
});

describe('territories', () => {
  const at = (lat: number, lon: number) => TERRITORIES[territoryAt(...project(lat, lon))].id;
  it('places real landmarks in the right turf', () => {
    expect(at(1.3040, 103.8318)).toBe('spire'); // ION Orchard
    expect(at(1.3001, 103.8392)).toBe('somerset-hub'); // Somerset MRT
    expect(at(1.3003, 103.8452)).toBe('ghaut-plaza'); // Plaza Singapura
    expect(at(1.2939, 103.8533)).toBe('stamford-atrium'); // Raffles City
    expect(at(1.2898, 103.8556)).toBe('durian-domes'); // Esplanade theatres
    expect(at(1.2884, 103.8466)).toBe('neon-quay'); // Clarke Quay
  });
});

describe('polygon helpers', () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10];

  it('finds points inside a ring', () => {
    expect(pointInRing(5, 5, square)).toBe(true);
    expect(pointInRing(15, 5, square)).toBe(false);
  });

  it('measures signed area', () => {
    expect(Math.abs(signedArea(square))).toBe(100);
  });

  it('simplifies away points on a straight line', () => {
    expect(simplify([0, 0, 5, 0.01, 10, 0], 0.1)).toEqual([0, 0, 10, 0]);
  });

  it('stitches split ways into one ring', () => {
    const rings = stitchRings([
      [0, 0, 10, 0, 10, 10],
      [0, 0, 0, 10, 10, 10], // runs the other way
    ]);
    expect(rings).toHaveLength(1);
    expect(Math.abs(signedArea(rings[0]))).toBe(100);
  });
});

describe('collision grid', () => {
  it('blocks building footprints and allows the street', () => {
    const grid = new CollisionGrid(1, { minX: 0, maxX: 100, minZ: 0, maxZ: 100 });
    grid.fillPolygon([20, 20, 40, 20, 40, 40, 20, 40]);
    expect(grid.blocked(30, 30)).toBe(true);
    expect(grid.blocked(50, 50)).toBe(false);
    expect(grid.blocked(-5, 50)).toBe(true); // outside the map
    const [x, z] = grid.nearestOpen(30, 30, 0.5);
    expect(grid.hits(x, z, 0.5)).toBe(false);
  });
});
