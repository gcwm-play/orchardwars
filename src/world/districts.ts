// Turf districts. Each one is anchored on a real neighbourhood between Orchard Road
// and the Singapore River; every point on the map belongs to the nearest anchor
// (a Voronoi split), so the borders can be tuned by nudging the anchors.
// See docs/map-research.md for where each anchor comes from.

import { project, type XZ } from './geo.ts';

export type GangId = 'none' | 'durian' | 'merlion' | 'kopi' | 'chrome' | 'hawker';

export interface Gang {
  id: GangId;
  name: string;
  color: string;
  blurb: string;
}

/** Placeholder factions for the future-dystopia setting. Rename freely. */
export const GANGS: Record<GangId, Gang> = {
  none: { id: 'none', name: 'Unclaimed', color: '#8a8f98', blurb: 'No one holds this turf. Yet.' },
  durian: {
    id: 'durian',
    name: 'Thorn Syndicate',
    color: '#c6e03a',
    blurb: 'Old-money racketeers who run the luxury arcades of upper Orchard.',
  },
  merlion: {
    id: 'merlion',
    name: 'River Tide',
    color: '#2fd4e6',
    blurb: 'Smugglers who own the quays and everything that floats.',
  },
  kopi: {
    id: 'kopi',
    name: 'Kopi Kartel',
    color: '#e8913a',
    blurb: 'Night-market fixers; every stall pays them in favours.',
  },
  chrome: {
    id: 'chrome',
    name: 'Chrome Kampong',
    color: '#d14bff',
    blurb: 'Augmented street kids squatting in the dead malls of Somerset.',
  },
  hawker: {
    id: 'hawker',
    name: 'Civic Guard',
    color: '#ff4d5e',
    blurb: 'A private militia that says it keeps order in the old Civic District.',
  },
};

export interface District {
  id: string;
  /** Real-world area the district is based on. */
  name: string;
  /** In-game name for the dystopian setting. */
  gameName: string;
  lat: number;
  lon: number;
  owner: GangId;
}

export const DISTRICTS: District[] = [
  { id: 'tanglin', name: 'Tanglin', gameName: 'Tanglin Gate', lat: 1.3055, lon: 103.8245, owner: 'durian' },
  { id: 'orchard', name: 'Orchard', gameName: 'The Arcades', lat: 1.3042, lon: 103.832, owner: 'durian' },
  { id: 'cairnhill', name: 'Cairnhill / Emerald Hill', gameName: 'Emerald Terraces', lat: 1.3065, lon: 103.8385, owner: 'none' },
  { id: 'somerset', name: 'Somerset', gameName: 'Somerset Sprawl', lat: 1.3005, lon: 103.8385, owner: 'chrome' },
  { id: 'rivervalley', name: 'River Valley', gameName: 'Valley Blocks', lat: 1.2945, lon: 103.8355, owner: 'none' },
  { id: 'dhoby', name: 'Dhoby Ghaut', gameName: 'Ghaut Junction', lat: 1.2995, lon: 103.8455, owner: 'chrome' },
  { id: 'fortcanning', name: 'Fort Canning', gameName: 'The Fort', lat: 1.2945, lon: 103.8455, owner: 'none' },
  { id: 'brasbasah', name: 'Bras Basah', gameName: 'Basah Bazaar', lat: 1.2975, lon: 103.8525, owner: 'kopi' },
  { id: 'cityhall', name: 'City Hall / Civic District', gameName: 'Civic Bastion', lat: 1.292, lon: 103.8515, owner: 'hawker' },
  { id: 'esplanade', name: 'Esplanade / Marina', gameName: 'Esplanade Domes', lat: 1.2905, lon: 103.8565, owner: 'hawker' },
  { id: 'clarkequay', name: 'Clarke Quay', gameName: 'Neon Quay', lat: 1.2893, lon: 103.8465, owner: 'merlion' },
  { id: 'boatquay', name: 'Boat Quay / Raffles Place', gameName: 'Bank Row', lat: 1.2862, lon: 103.8505, owner: 'merlion' },
];

const anchors: XZ[] = DISTRICTS.map((d) => project(d.lat, d.lon));

/** Index into DISTRICTS of the district that owns world point (x, z). */
export function districtIndexAt(x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const dx = anchors[i][0] - x;
    const dz = anchors[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function districtAt(x: number, z: number): District {
  return DISTRICTS[districtIndexAt(x, z)];
}
