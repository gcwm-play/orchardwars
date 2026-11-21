// Turns tools/cache/osm.json (from npm run map:fetch) into public/data/map.json,
// the compact format the game loads (see src/world/mapData.ts).
// Run with: npm run map:build

import { readFileSync, writeFileSync } from 'node:fs';
import { project, worldRect } from '../src/world/geo.ts';
import type { Building, MapData, Poi, Road, RoadKind } from '../src/world/mapData.ts';
import { openRing, signedArea, simplify, stitchRings } from '../src/world/polygon.ts';

interface OsmPoint { lat: number; lon: number }
interface OsmMember { type: string; role: string; geometry?: OsmPoint[] }
interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: OsmPoint[];
  members?: OsmMember[];
}

const osm = JSON.parse(readFileSync(new URL('./cache/osm.json', import.meta.url), 'utf8')) as {
  elements: OsmElement[];
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const toXZ = (g: OsmPoint[]) => g.flatMap((pt) => project(pt.lat, pt.lon)).map(r1);

const rect = worldRect();
const PAD = 60;
const inside = (p: number[]) => {
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] > rect.minX - PAD && p[i] < rect.maxX + PAD && p[i + 1] > rect.minZ - PAD && p[i + 1] < rect.maxZ + PAD) return true;
  }
  return false;
};

/** Outer rings of a way or multipolygon relation, as open rings. */
function rings(el: OsmElement): number[][] {
  if (el.type === 'way' && el.geometry) {
    const p = openRing(toXZ(el.geometry));
    return p.length >= 6 ? [p] : [];
  }
  if (el.type === 'relation' && el.members) {
    const outers = el.members.filter((m) => m.role === 'outer' && m.geometry).map((m) => toXZ(m.geometry!));
    return stitchRings(outers);
  }
  return [];
}

/** Simplify a ring; null if too little is left of it. (Winding is fixed when rendering.) */
const tidyRing = (p: number[], tol: number) => {
  const s = simplify(p, tol);
  return s.length < 6 ? null : s;
};

const ROAD: Record<string, { k: RoadKind; w: number }> = {
  motorway: { k: 'major', w: 16 },
  trunk: { k: 'major', w: 16 },
  primary: { k: 'primary', w: 14 },
  secondary: { k: 'secondary', w: 11 },
  tertiary: { k: 'secondary', w: 9 },
  unclassified: { k: 'minor', w: 7 },
  residential: { k: 'minor', w: 7 },
  living_street: { k: 'minor', w: 6 },
  motorway_link: { k: 'major', w: 8 },
  trunk_link: { k: 'major', w: 8 },
  primary_link: { k: 'primary', w: 7 },
  secondary_link: { k: 'secondary', w: 7 },
  tertiary_link: { k: 'secondary', w: 6 },
  service: { k: 'service', w: 4.5 },
  pedestrian: { k: 'pedestrian', w: 6 },
  footway: { k: 'foot', w: 2 },
};

function buildingHeight(t: Record<string, string>): number {
  const h = parseFloat(t.height ?? '');
  if (h > 0) return Math.min(h, 300);
  const levels = parseFloat(t['building:levels'] ?? '');
  if (levels > 0) return Math.min(levels * 3.4 + 1.5, 300);
  switch (t.building) {
    case 'house':
    case 'terrace':
    case 'detached':
    case 'semidetached_house':
      return 9;
    case 'apartments':
    case 'residential':
      return 36;
    case 'hotel':
      return 45;
    case 'office':
    case 'commercial':
      return 40;
    case 'retail':
      return 18;
    case 'church':
    case 'cathedral':
    case 'temple':
    case 'mosque':
      return 14;
    case 'roof':
    case 'shed':
      return 4;
    default:
      return 12;
  }
}

const out: MapData = {
  version: 1,
  attribution: 'Map data © OpenStreetMap contributors, ODbL (openstreetmap.org/copyright)',
  roads: [],
  buildings: [],
  water: [],
  parks: [],
  trees: [],
  stations: [],
};
const seenStations = new Set<string>();

for (const el of osm.elements) {
  const t = el.tags ?? {};
  if (el.type === 'node') {
    if (el.lat === undefined || el.lon === undefined) continue;
    const [x, z] = project(el.lat, el.lon).map(r1);
    if (t.natural === 'tree') out.trees.push(x, z);
    else if ((t.railway === 'station' || (t.railway === 'stop' && t.subway === 'yes')) && t.name && !seenStations.has(t.name)) {
      seenStations.add(t.name);
      out.stations.push({ n: t.name, x, z } satisfies Poi);
    }
    continue;
  }

  if (t.highway && el.type === 'way' && el.geometry) {
    const spec = ROAD[t.highway];
    if (!spec) continue;
    const p = simplify(toXZ(el.geometry), 0.4);
    if (!inside(p)) continue;
    const road: Road = { k: spec.k, w: spec.w, p };
    // Wider for roads with lots of lanes (e.g. Orchard Road is 4-5 lanes one way).
    const lanes = parseInt(t.lanes ?? '', 10);
    if (lanes > 0 && spec.k !== 'foot' && spec.k !== 'pedestrian') road.w = Math.max(road.w, lanes * 3.3 + 1);
    if (t.name) road.n = t.name;
    if (t.tunnel === 'yes' || (t.layer && parseInt(t.layer, 10) < 0)) continue; // underground: skip
    out.roads.push(road);
    continue;
  }

  if (t.building) {
    if (t.location === 'underground' || (t.layer && parseInt(t.layer, 10) < 0)) continue;
    const h = buildingHeight(t);
    for (const ring of rings(el)) {
      const p = tidyRing(ring, 0.3);
      if (!p || !inside(p) || Math.abs(signedArea(p)) < 12) continue;
      const b: Building = { h: Math.round(h * 10) / 10, p };
      if (t.name) b.n = t.name;
      out.buildings.push(b);
    }
    continue;
  }

  if (t.natural === 'water') {
    for (const ring of rings(el)) {
      const p = tidyRing(ring, 0.8);
      if (p) out.water.push(p);
    }
    continue;
  }

  if (t.waterway) continue; // rivers are drawn from their water areas, not centre lines

  if (t.leisure || t.landuse || t.natural) {
    for (const ring of rings(el)) {
      const p = tidyRing(ring, 0.6);
      if (p && inside(p) && Math.abs(signedArea(p)) > 40) out.parks.push(p);
    }
  }
}

const json = JSON.stringify(out);
writeFileSync(new URL('../public/data/map.json', import.meta.url), json);
console.log(
  `map.json: ${out.roads.length} roads, ${out.buildings.length} buildings, ${out.water.length} water, ` +
    `${out.parks.length} parks, ${out.trees.length / 2} trees, ${out.stations.length} stations, ` +
    `${(json.length / 1e6).toFixed(2)} MB`,
);
