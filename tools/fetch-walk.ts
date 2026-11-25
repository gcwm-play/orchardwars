// Pulls street-level detail for the rainy walk out of the Singapore OpenStreetMap export that
// `npm run map:fetch` downloads: buildings and building parts with every tag, roads with lanes,
// footways (covered walkways), crossings, traffic signals, bus stops, trees and street furniture,
// inside a corridor around the walked stretch of Orchard Road. Writes tools/cache/walk-osm.json.
// Then run: npm run walk:build
//
//   npm run walk:fetch

import { createReadStream, existsSync, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import sax from 'sax';
import { unproject } from '../src/world/geo.ts';

const cacheDir = new URL('./cache/', import.meta.url);
const gzFile = new URL('./Singapore.osm.gz', cacheDir);
if (!existsSync(gzFile)) throw new Error('No OSM export yet: run npm run map:fetch first');

/** The walk corridor in world metres (see src/walk/main.ts for the route). */
export const CORRIDOR = { minX: -1500, maxX: -150, minZ: -1450, maxZ: -350 };
const a = unproject(CORRIDOR.minX, CORRIDOR.maxZ);
const b = unproject(CORRIDOR.maxX, CORRIDOR.minZ);
const BOX = { south: a.lat, west: a.lon, north: b.lat, east: b.lon };
const KEEP = { south: BOX.south - 0.01, west: BOX.west - 0.01, north: BOX.north + 0.01, east: BOX.east + 0.01 };
const inBox = (x: typeof BOX, lat: number, lon: number) => lat >= x.south && lat <= x.north && lon >= x.west && lon <= x.east;

interface Pt { lat: number; lon: number }
const nodes = new Map<number, Pt>();
const wayGeom = new Map<number, Pt[]>();
const out: unknown[] = [];

/** Is this element something the street scene uses? */
function wanted(t: Record<string, string>): boolean {
  return Boolean(
    t.building || t['building:part'] || t.highway || t.footway || t.natural === 'tree' || t.amenity || t.barrier ||
      t.leisure || t.landuse || t.man_made || t.public_transport || t.railway || t.entrance || t.shop || t.tourism ||
      t.covered || t.area,
  );
}

let cur: { kind: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; tags: Record<string, string>; refs: number[]; members: { type: string; ref: number; role: string }[] } | null = null;
const parser = sax.parser(true, { trim: false });
parser.onopentag = (tag) => {
  const at = tag.attributes as Record<string, string>;
  if (tag.name === 'node' || tag.name === 'way' || tag.name === 'relation') {
    cur = { kind: tag.name, id: Number(at.id), tags: {}, refs: [], members: [] };
    if (tag.name === 'node') {
      cur.lat = Number(at.lat);
      cur.lon = Number(at.lon);
    }
  } else if (tag.name === 'tag' && cur) cur.tags[at.k] = at.v;
  else if (tag.name === 'nd' && cur) cur.refs.push(Number(at.ref));
  else if (tag.name === 'member' && cur) cur.members.push({ type: at.type, ref: Number(at.ref), role: at.role });
};
parser.onclosetag = (name) => {
  if (!cur || name !== cur.kind) return;
  const c = cur;
  cur = null;
  if (c.kind === 'node') {
    const pt = { lat: c.lat!, lon: c.lon! };
    if (inBox(KEEP, pt.lat, pt.lon)) nodes.set(c.id, pt);
    if (Object.keys(c.tags).length && wanted(c.tags) && inBox(BOX, pt.lat, pt.lon)) out.push({ type: 'node', id: c.id, ...pt, tags: c.tags });
    return;
  }
  if (c.kind === 'way') {
    const geom: Pt[] = [];
    for (const r of c.refs) {
      const p = nodes.get(r);
      if (!p) return;
      geom.push(p);
    }
    wayGeom.set(c.id, geom);
    if (wanted(c.tags) && geom.some((p) => inBox(BOX, p.lat, p.lon))) out.push({ type: 'way', id: c.id, tags: c.tags, geometry: geom });
    return;
  }
  if (!wanted(c.tags)) return;
  const members = c.members
    .filter((m) => m.type === 'way' && wayGeom.has(m.ref))
    .map((m) => ({ type: 'way', role: m.role, geometry: wayGeom.get(m.ref)! }));
  if (members.some((m) => m.geometry.some((p) => inBox(BOX, p.lat, p.lon)))) out.push({ type: 'relation', id: c.id, tags: c.tags, members });
};

console.log('Extracting the Orchard Road corridor ...');
const xml = createReadStream(gzFile).pipe(createGunzip());
xml.setEncoding('utf8');
for await (const chunk of xml) parser.write(chunk as string);
parser.close();
const json = JSON.stringify({ elements: out });
writeFileSync(new URL('./walk-osm.json', cacheDir), json);
console.log(`Kept ${out.length} elements (${(json.length / 1e6).toFixed(1)} MB) in tools/cache/walk-osm.json`);
