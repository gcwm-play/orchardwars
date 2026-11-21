// Shape of public/data/map.json, written by tools/build-map.ts from OpenStreetMap data.
// All coordinates are world metres (see geo.ts), stored as flat [x0, z0, x1, z1, ...] arrays.

export type RoadKind = 'major' | 'primary' | 'secondary' | 'minor' | 'service' | 'pedestrian' | 'foot';

export interface Road {
  k: RoadKind;
  /** Width in metres. */
  w: number;
  /** Street name, when OSM has one. */
  n?: string;
  /** Polyline. */
  p: number[];
}

export interface Building {
  /** Height in metres. */
  h: number;
  /** Outer ring (not closed: the last point is not repeated). */
  p: number[];
  /** Name, when OSM has one (used for research, not shown in game). */
  n?: string;
}

export interface Poi {
  n: string;
  x: number;
  z: number;
}

export interface MapData {
  version: 1;
  /** Copyright notice: OSM data is ODbL and must be credited. */
  attribution: string;
  roads: Road[];
  buildings: Building[];
  /** Water areas (rivers, the bay, ponds). */
  water: number[][];
  /** Parks, gardens and green areas. */
  parks: number[][];
  /** Individual trees mapped in OSM, flat [x, z, ...]. */
  trees: number[];
  /** MRT stations. */
  stations: Poi[];
}

export async function loadMap(url = `${import.meta.env.BASE_URL}data/map.json`): Promise<MapData> {
  // The single-file build (npm run build:html) embeds the map, so it works when opened from disk.
  const embedded = (globalThis as { __ORCHARD_MAP__?: MapData }).__ORCHARD_MAP__;
  if (embedded) return embedded;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load map (${res.status})`);
  return (await res.json()) as MapData;
}
