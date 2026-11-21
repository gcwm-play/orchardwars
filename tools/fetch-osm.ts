// Downloads the Singapore OpenStreetMap export from BBBike (updated weekly) and keeps
// only what the game needs inside the playable area, writing tools/cache/osm.json in
// the same shape as an Overpass "out geom" answer. Then run: npm run map:build
//
//   npm run map:fetch            download (if missing) + extract
//   npm run map:fetch -- --fresh download again even if a copy exists
//
// Needs network access to download.bbbike.org.

import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import sax from 'sax';
import { BOUNDS } from '../src/world/geo.ts';

const SOURCE = 'https://download.bbbike.org/osm/bbbike/Singapore/Singapore.osm.gz';
const cacheDir = new URL('./cache/', import.meta.url);
const gzFile = new URL('./Singapore.osm.gz', cacheDir);
mkdirSync(cacheDir, { recursive: true });

if (!existsSync(gzFile) || process.argv.includes('--fresh')) {
  console.log(`Downloading ${SOURCE} ...`);
  const res = await fetch(SOURCE);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(gzFile));
}

// --- What to keep -----------------------------------------------------------------

type Box = { south: number; west: number; north: number; east: number };
const MAIN: Box = BOUNDS;
// Water is kept from a wider box so the river and the bay are not cut at the edge.
const WIDE: Box = { south: MAIN.south - 0.004, west: MAIN.west - 0.002, north: MAIN.north + 0.002, east: MAIN.east + 0.006 };
// Node coordinates are remembered for a still wider box so big areas resolve fully.
const KEEP: Box = { south: MAIN.south - 0.03, west: MAIN.west - 0.03, north: MAIN.north + 0.03, east: MAIN.east + 0.03 };

const inBox = (b: Box, lat: number, lon: number) => lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;

const HIGHWAY = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|pedestrian|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|footway)$/;

/** MRT stations: mapped as stop positions on the subway lines in Singapore. */
export const isStation = (t: Record<string, string>) =>
  t.railway === 'station' || (t.railway === 'stop' && t.subway === 'yes');

/** Which box an element must touch to be kept, or null to drop it (mirrors the old Overpass query). */
function wanted(kind: 'node' | 'way' | 'relation', t: Record<string, string>): Box | null {
  if (kind === 'node') return isStation(t) || t.natural === 'tree' ? MAIN : null;
  if (t.natural === 'water') return WIDE;
  if (kind === 'way' && /^(river|canal)$/.test(t.waterway ?? '')) return WIDE;
  if (t.building) return MAIN;
  if (kind === 'way' && HIGHWAY.test(t.highway ?? '')) return MAIN;
  if (/^(park|garden)$/.test(t.leisure ?? '') || (kind === 'way' && t.leisure === 'pitch')) return MAIN;
  if (kind === 'way' && /^(grass|forest|recreation_ground|village_green)$/.test(t.landuse ?? '')) return MAIN;
  if (kind === 'way' && /^(wood|scrub)$/.test(t.natural ?? '')) return MAIN;
  return null;
}

// --- Streaming parse ----------------------------------------------------------------

interface Pt { lat: number; lon: number }
const nodes = new Map<number, Pt>();
const wayGeom = new Map<number, Pt[]>();
const out: unknown[] = [];

let cur: { kind: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; tags: Record<string, string>; refs: number[]; members: { type: string; ref: number; role: string }[] } | null = null;

const parser = sax.parser(true, { trim: false });
parser.onopentag = (tag) => {
  const a = tag.attributes as Record<string, string>;
  switch (tag.name) {
    case 'node':
    case 'way':
    case 'relation':
      cur = { kind: tag.name, id: Number(a.id), tags: {}, refs: [], members: [] };
      if (tag.name === 'node') {
        cur.lat = Number(a.lat);
        cur.lon = Number(a.lon);
      }
      break;
    case 'tag':
      if (cur) cur.tags[a.k] = a.v;
      break;
    case 'nd':
      if (cur) cur.refs.push(Number(a.ref));
      break;
    case 'member':
      if (cur) cur.members.push({ type: a.type, ref: Number(a.ref), role: a.role });
      break;
  }
};
parser.onclosetag = (name) => {
  if (!cur || name !== cur.kind) return;
  const c = cur;
  cur = null;
  const tags = c.tags;
  if (c.kind === 'node') {
    const pt = { lat: c.lat!, lon: c.lon! };
    if (inBox(KEEP, pt.lat, pt.lon)) nodes.set(c.id, pt);
    const box = wanted('node', tags);
    if (box && inBox(box, pt.lat, pt.lon)) out.push({ type: 'node', id: c.id, ...pt, tags });
    return;
  }
  if (c.kind === 'way') {
    const geom: Pt[] = [];
    for (const r of c.refs) {
      const p = nodes.get(r);
      if (!p) return; // runs outside the kept area
      geom.push(p);
    }
    wayGeom.set(c.id, geom);
    const box = wanted('way', tags);
    if (box && geom.some((p) => inBox(box, p.lat, p.lon))) out.push({ type: 'way', id: c.id, tags, geometry: geom });
    return;
  }
  const box = wanted('relation', tags);
  if (!box || (tags.type !== 'multipolygon' && !tags.building)) return;
  const members = c.members
    .filter((m) => m.type === 'way' && wayGeom.has(m.ref))
    .map((m) => ({ type: 'way', role: m.role, geometry: wayGeom.get(m.ref)! }));
  if (members.some((m) => m.geometry.some((p) => inBox(box, p.lat, p.lon)))) {
    out.push({ type: 'relation', id: c.id, tags, members });
  }
};

console.log('Extracting the playable area ...');
const xml = createReadStream(gzFile).pipe(createGunzip());
xml.setEncoding('utf8');
for await (const chunk of xml) parser.write(chunk as string);
parser.close();
const json = JSON.stringify({ elements: out });
writeFileSync(new URL('./osm.json', cacheDir), json);
console.log(`Kept ${out.length} elements (${(json.length / 1e6).toFixed(1)} MB) in tools/cache/osm.json`);
