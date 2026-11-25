// Turns tools/cache/walk-osm.json (from npm run walk:fetch) into public/data/walk.json, the
// street-level data for the rainy Orchard Road walk: 3D building parts with real heights, colours,
// materials and roof shapes; roads with lanes and bus lanes; crossings, traffic lights, bus stops,
// MRT entrances, covered walkways and street furniture.
//
//   npm run walk:fetch && npm run walk:build

import { readFileSync, writeFileSync } from 'node:fs';
import { project } from '../src/world/geo.ts';
import { pointInRing, signedArea, simplify } from '../src/world/polygon.ts';
import type { Facade, Part, RoofShape, WalkData, WalkRoad } from '../src/walk/walkData.ts';

interface LatLon { lat: number; lon: number }
interface El {
  type: 'node' | 'way' | 'relation';
  lat?: number;
  lon?: number;
  tags: Record<string, string>;
  geometry?: LatLon[];
  members?: { role: string; geometry: LatLon[] }[];
}

const osm = JSON.parse(readFileSync(new URL('./cache/walk-osm.json', import.meta.url), 'utf8')) as { elements: El[] };
const r1 = (v: number) => Math.round(v * 10) / 10;
const LEVEL = 3.4;

function ring(g: LatLon[]): number[] {
  const p: number[] = [];
  for (const { lat, lon } of g) p.push(...project(lat, lon).map(r1));
  // Drop the closing point.
  if (p.length > 4 && p[0] === p[p.length - 2] && p[1] === p[p.length - 1]) p.length -= 2;
  return p;
}
const line = (g: LatLon[]) => simplify(ring(g), 0.2);
const outer = (e: El) => e.geometry ?? e.members?.find((m) => m.role === 'outer')?.geometry;
const num = (v: string | undefined) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : NaN;
};

function roofShape(s: string | undefined): RoofShape {
  if (!s || s === 'flat') return 'flat';
  if (/pyramid/.test(s)) return 'pyramid';
  if (/dome|onion|round/.test(s)) return 'dome';
  if (/gabled|skillion|saltbox/.test(s)) return 'gable';
  return 'mansard'; // hipped, mansard, gambrel, half-hipped...
}

function facade(t: Record<string, string>): Facade {
  const m = t['building:material'] ?? t['building:facade:material'] ?? '';
  if (/glass/.test(m)) return 'glass';
  if (/stone|granite|marble|brick/.test(m)) return 'stone';
  if (/metal|steel|alumin/.test(m)) return 'metal';
  if (/concrete|plaster|cement/.test(m)) return 'concrete';
  return 'plain';
}

/** A sensible height for a building that has no height or levels mapped. */
function defaultTop(t: Record<string, string>): number {
  switch (t.building ?? t['building:part']) {
    case 'house':
    case 'terrace':
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
    case 'mall':
      return 22;
    case 'roof':
      return 4.5;
    default:
      return 12;
  }
}

function heights(t: Record<string, string>, p: number[]) {
  const shape = roofShape(t['roof:shape']);
  const levels = num(t['building:levels']);
  const minLevel = num(t['building:min_level']);
  const roofLevels = num(t['roof:levels']);
  const height = num(t.height);
  const minHeight = num(t.min_height);
  const base = minHeight >= 0 ? minHeight : minLevel > 0 ? minLevel * LEVEL : 0;
  // Roof height: mapped, or from roof levels, or a guess from the footprint size.
  let rh = num(t['roof:height']);
  if (!(rh > 0)) rh = roofLevels > 0 && shape !== 'flat' ? roofLevels * LEVEL : 0;
  if (shape !== 'flat' && !(rh > 0)) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      minX = Math.min(minX, p[i]);
      maxX = Math.max(maxX, p[i]);
      minZ = Math.min(minZ, p[i + 1]);
      maxZ = Math.max(maxZ, p[i + 1]);
    }
    rh = Math.min(maxX - minX, maxZ - minZ) * (shape === 'dome' ? 0.5 : 0.3);
  }
  let top: number;
  if (height > 0) top = height - (shape === 'flat' ? 0 : rh);
  else if (levels > 0) top = levels * LEVEL + (base > 0 ? 0 : 1);
  else top = defaultTop(t);
  if (top <= base) top = base + LEVEL;
  return { b: r1(base), h: r1(Math.min(top, 300)), r: shape, rh: r1(rh) };
}

// --- Buildings: OSM "simple 3D buildings". An outline with parts inside is drawn by its parts.

const partEls = osm.elements.filter((e) => e.tags['building:part'] && outer(e));
const outlineEls = osm.elements.filter((e) => e.tags.building && !e.tags['building:part'] && outer(e));
const underground = (t: Record<string, string>) => t.location === 'underground' || t.tunnel === 'yes' || num(t['building:levels']) < 0;

const parts: Part[] = [];
const partRings: number[][] = [];
function addPart(t: Record<string, string>, p: number[]) {
  if (p.length < 6 || Math.abs(signedArea(p)) < 4) return;
  const part: Part = { p, ...heights(t, p), m: facade(t) };
  const c = t['building:colour'] ?? t.colour;
  if (c && /^#[0-9a-f]{6}$/i.test(c)) part.c = c.toLowerCase();
  const rc = t['roof:colour'];
  if (rc && /^#[0-9a-f]{6}$/i.test(rc)) part.rc = rc.toLowerCase();
  if (t.building === 'roof' || t['building:part'] === 'roof') part.canopy = true;
  parts.push(part);
}
for (const e of partEls) {
  if (underground(e.tags)) continue;
  const p = ring(outer(e)!);
  partRings.push(p);
  addPart(e.tags, p);
}
const centroid = (p: number[]) => {
  let x = 0, z = 0;
  for (let i = 0; i < p.length; i += 2) {
    x += p[i];
    z += p[i + 1];
  }
  return [x / (p.length / 2), z / (p.length / 2)];
};
const partCentres = partRings.map(centroid);

const labels: WalkData['labels'] = [];
const SIGN_KINDS = /^(commercial|retail|mall|yes|hotel|office|train_station)$/;
for (const e of outlineEls) {
  if (underground(e.tags)) continue;
  const p = ring(outer(e)!);
  if (p.length < 6) continue;
  const inside = partCentres.filter(([x, z]) => pointInRing(x, z, p));
  if (!inside.length) {
    addPart(e.tags, p);
    if (e.tags.name) parts[parts.length - 1].o = e.tags.name;
  } else if (e.tags.name) {
    for (const q of parts) if (!q.o && pointInRing(...(centroid(q.p) as [number, number]), p)) q.o = e.tags.name;
  }
  if (e.tags.name && SIGN_KINDS.test(e.tags.building)) {
    // Signs go above the lowest block (the podium) of the building.
    const own = inside.length ? parts.filter((q) => !q.canopy && pointInRing(...(centroid(q.p) as [number, number]), p)) : [];
    const h = own.length ? Math.min(...own.map((q) => q.h)) : heights(e.tags, p).h;
    labels.push({ n: e.tags.name, p, h });
  }
}

// --- Roads, crossings, walkways.

const ROAD: Record<string, number> = {
  primary: 14, secondary: 11, tertiary: 9, unclassified: 7, residential: 7, living_street: 6,
  primary_link: 7, secondary_link: 7, tertiary_link: 6, service: 4.5, pedestrian: 6,
};
const roads: WalkRoad[] = [];
const covered: number[][] = [];
const crossings: WalkData['crossings'] = [];
for (const e of osm.elements) {
  const t = e.tags;
  if (e.type !== 'way' || !e.geometry || !t.highway) continue;
  if (t.tunnel === 'yes' || num(t.layer) < 0 || t.bridge === 'yes') continue;
  if (t.footway === 'crossing' || t.cycleway === 'crossing') {
    crossings.push({ p: line(e.geometry), signals: t.crossing === 'traffic_signals' || t['crossing:signals'] === 'yes' });
    continue;
  }
  if (t.highway === 'footway' && t.covered === 'yes' && !(num(t.layer) > 0) && !t.level) {
    covered.push(line(e.geometry));
    continue;
  }
  const w0 = ROAD[t.highway];
  if (!w0) continue;
  const lanes = num(t.lanes);
  const road: WalkRoad = { p: line(e.geometry), w: lanes > 0 ? r1(lanes * 3.3 + 0.6) : w0 };
  if (t.name) road.n = t.name;
  if (lanes > 0) road.lanes = lanes;
  if (t.oneway === 'yes') road.oneway = true;
  if (t['busway:left'] === 'lane' || num(t['lanes:bus']) > 0) road.bus = true;
  roads.push(road);
}

// --- Points.

const out: WalkData = {
  version: 1,
  attribution: 'Map data © OpenStreetMap contributors, ODbL (openstreetmap.org/copyright)',
  parts,
  labels,
  roads,
  covered,
  crossings,
  signals: [],
  busStops: [],
  mrt: [],
  trees: [],
  bollards: [],
  benches: [],
};
for (const e of osm.elements) {
  if (e.type !== 'node') continue;
  const t = e.tags;
  const [x, z] = project(e.lat!, e.lon!).map(r1);
  if (t.highway === 'traffic_signals') out.signals.push(x, z);
  else if (t.highway === 'bus_stop' && t.name) out.busStops.push({ n: t.name, x, z });
  else if (t.railway === 'subway_entrance') out.mrt.push({ n: t.name ?? '', x, z });
  else if (t.natural === 'tree') out.trees.push(x, z);
  else if (t.barrier === 'bollard') out.bollards.push(x, z);
  else if (t.amenity === 'bench') out.benches.push(x, z);
}

const json = JSON.stringify(out);
writeFileSync(new URL('../public/data/walk.json', import.meta.url), json);
console.log(
  `public/data/walk.json: ${parts.length} building parts, ${labels.length} names, ${roads.length} roads, ` +
    `${crossings.length} crossings, ${out.busStops.length} bus stops, ${(json.length / 1e6).toFixed(2)} MB`,
);
