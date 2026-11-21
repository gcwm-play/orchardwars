// Geography shared by the map build tool (Node) and the game (browser).
// World units are metres. +x is east, +z is south (so north is -z, as in three.js
// when you look down from above with the camera's top towards north).

/** The playable area: Tanglin end of Orchard Road down to the Singapore River mouth. */
export const BOUNDS = {
  south: 1.284,
  west: 103.8215,
  north: 1.308,
  east: 103.86,
} as const;

/** Origin of the world: roughly Dhoby Ghaut, near the middle of the map. */
export const ORIGIN = {
  lat: (BOUNDS.south + BOUNDS.north) / 2,
  lon: (BOUNDS.west + BOUNDS.east) / 2,
};

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export type XZ = [x: number, z: number];

/** Latitude/longitude to world metres (x east, z south). */
export function project(lat: number, lon: number): XZ {
  return [(lon - ORIGIN.lon) * M_PER_DEG_LON, -(lat - ORIGIN.lat) * M_PER_DEG_LAT];
}

/** World metres back to latitude/longitude. */
export function unproject(x: number, z: number): { lat: number; lon: number } {
  return { lat: ORIGIN.lat - z / M_PER_DEG_LAT, lon: ORIGIN.lon + x / M_PER_DEG_LON };
}

/** World-space rectangle covered by BOUNDS. */
export function worldRect() {
  const [minX, maxZ] = project(BOUNDS.south, BOUNDS.west);
  const [maxX, minZ] = project(BOUNDS.north, BOUNDS.east);
  return { minX, maxX, minZ, maxZ };
}
