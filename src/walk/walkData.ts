// Shape of public/data/walk.json: street-level OpenStreetMap detail for the Orchard Road walk,
// written by tools/build-walk.ts. Coordinates are world metres (see src/world/geo.ts), flat [x, z, ...].

export type RoofShape = 'flat' | 'pyramid' | 'mansard' | 'dome' | 'gable';
export type Facade = 'glass' | 'stone' | 'concrete' | 'metal' | 'plain';

/** One block of a building: OSM "building:part" (or a whole building that has no parts). */
export interface Part {
  /** Outer ring, not closed. */
  p: number[];
  /** Bottom of the walls (m above ground). */
  b: number;
  /** Top of the walls (m). */
  h: number;
  /** Roof shape and height above the walls. */
  r: RoofShape;
  rh: number;
  /** Wall and roof colours from OSM, when mapped. */
  c?: string;
  rc?: string;
  /** What the walls are made of (decides the facade style). */
  m: Facade;
  /** A canopy or roof with no walls (OSM building=roof). */
  canopy?: true;
  /** Name of the building it belongs to, when mapped (for landmark details). */
  o?: string;
}

export interface Label {
  /** Building name (malls and landmarks). */
  n: string;
  /** Outline the name belongs to. */
  p: number[];
  /** Height of the building's lowest block, for placing the sign. */
  h: number;
}

export interface WalkRoad {
  /** Polyline. */
  p: number[];
  /** Carriageway width (m). */
  w: number;
  /** Street name. */
  n?: string;
  /** Lanes and one-way, when mapped. */
  lanes?: number;
  oneway?: true;
  /** Has a bus lane on the left (Singapore drives on the left). */
  bus?: true;
}

export interface Crossing {
  p: number[];
  /** Controlled by traffic lights (else a zebra or plain marked crossing). */
  signals: boolean;
}

export interface WalkData {
  version: 1;
  attribution: string;
  parts: Part[];
  labels: Label[];
  roads: WalkRoad[];
  /** Covered walkways (OSM footways with covered=yes, at ground level). */
  covered: number[][];
  crossings: Crossing[];
  /** Traffic lights, [x, z, ...]. */
  signals: number[];
  busStops: { n: string; x: number; z: number }[];
  /** MRT station entrances. */
  mrt: { n: string; x: number; z: number }[];
  trees: number[];
  bollards: number[];
  benches: number[];
}

export async function loadWalkData(url = `${import.meta.env.BASE_URL}data/walk.json`): Promise<WalkData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the street (${res.status})`);
  return (await res.json()) as WalkData;
}
