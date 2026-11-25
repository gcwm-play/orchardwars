// Colours and mood for the rainy street walk. The walk has its own look (a wet neon night) rather
// than one of the map themes in src/engine/theme.ts, which are tuned for the top-down board.

export const RAIN_LOOK = {
  /** Sky gradient, zenith to the glow of the city on the low cloud. */
  sky: ['#07060d', '#3a2448'] as [string, string],
  fog: '#241c30',
  fogDensity: 0.016,
  hemi: { sky: '#6c6a9a', ground: '#1a1622', intensity: 0.55 },
  exposure: 1.0,
  bloom: { strength: 0.75, radius: 0.55, threshold: 0.55 },
  ground: '#3a3a40',
  pavement: '#6c6670',
  asphalt: '#2a2830',
  kerb: '#8a8590',
  paint: '#d8d4c8',
  walls: ['#6c6680', '#5d6478', '#7a7088', '#58606e', '#847a8c', '#4f5868', '#8a8480'],
  roof: '#2a2832',
  /** Share of upper-floor windows that are lit. */
  windowsLit: 0.4,
  warm: [1.0, 0.62, 0.3] as [number, number, number],
  cool: [0.35, 0.8, 1.0] as [number, number, number],
  shopWarm: [1.0, 0.78, 0.5] as [number, number, number],
  shopCool: [0.7, 0.9, 1.0] as [number, number, number],
  canopy: [0.25, 0.2, 0.3] as [number, number, number],
  neon: ['#ff2d95', '#20e3ff', '#ffb12a', '#7dff6a', '#b46bff', '#ff5a3c'],
  pole: '#3a3a44',
  lamp: '#ffc68a',
  lampLight: '#ffd2a0',
  trunk: '#2a2420',
  leaves: '#2f5a3c',
  glass: [0.02, 0.025, 0.035] as [number, number, number],
  ripple: [0.5, 0.55, 0.7] as [number, number, number],
  rain: [0.62, 0.68, 0.8] as [number, number, number],
};
