// Colours and mood for the rainy street walk. The walk has its own look (a wet neon night) rather
// than one of the map themes in src/engine/theme.ts, which are tuned for the top-down board.
// Buildings use their real colours from OpenStreetMap where they are mapped; the lists below fill in.

type RGB = [number, number, number];

export const RAIN_LOOK = {
  /** Sky gradient, zenith to the glow of the city on the low cloud. */
  sky: ['#07060d', '#3a2448'] as [string, string],
  /** City light reflected in glass from below the horizon. */
  cityGlow: '#4a2c30',
  fog: '#241c30',
  fogDensity: 0.014,
  hemi: { sky: '#6c6a9a', ground: '#2a2430', intensity: 0.85 },
  exposure: 1.0,
  bloom: { strength: 0.7, radius: 0.55, threshold: 0.6 },

  // Ground.
  ground: '#55504e',
  pavement: '#7a7470',
  asphalt: '#2a2830',
  kerb: '#9a958e',
  gutter: '#222026',
  paint: '#d8d4c8',
  /** Full-day bus lane markings. */
  busPaint: '#c8262c',
  busText: '#ff4a4a',
  tactile: '#c9a227',
  ripple: [0.5, 0.55, 0.7] as RGB,

  // Buildings (when OSM has no colour).
  walls: ['#9c968c', '#8a8a86', '#a8a298', '#7d8088', '#b0aaa0', '#8f8478'],
  stoneWalls: ['#9c6e5f', '#a89a88', '#8a7d70', '#b5a690'],
  glassWalls: ['#31698c', '#4b6a7c', '#5a7080', '#3d5566'],
  podiumWalls: ['#c8c8cc', '#b4b0aa', '#d0ccc4', '#9aa0a8'],
  roof: '#2e2c34',
  glass: [0.015, 0.02, 0.03] as RGB,
  /** Share of upper-floor windows that are lit (homes and hotels). */
  windowsLit: 0.38,
  warm: [1.0, 0.66, 0.36] as RGB,
  cool: [0.55, 0.78, 1.0] as RGB,
  office: [0.85, 0.92, 1.0] as RGB,
  shopWarm: [1.0, 0.82, 0.58] as RGB,
  shopCool: [0.82, 0.92, 1.0] as RGB,
  shopAccent: [1.0, 0.45, 0.7] as RGB,
  posterA: [0.95, 0.25, 0.35] as RGB,
  posterB: [0.2, 0.5, 0.95] as RGB,
  posterC: [0.95, 0.75, 0.2] as RGB,
  podiumWash: [1.0, 0.8, 0.55] as RGB,
  podiumStrip: [0.6, 0.85, 1.0] as RGB,
  fascia: [0.9, 0.85, 0.8] as RGB,
  canopyLight: [1.0, 0.86, 0.66] as RGB,

  // Signs and screens.
  neon: ['#ff2d95', '#20e3ff', '#ffb12a', '#7dff6a', '#b46bff', '#ff5a3c'],
  signWhite: '#f4f1ea',
  signFont: '"Helvetica Neue", Arial, system-ui, sans-serif',
  screenA: [0.9, 0.2, 0.5] as RGB,
  screenB: [0.15, 0.55, 1.0] as RGB,
  screenC: [1.0, 0.75, 0.25] as RGB,

  // Street furniture.
  pole: '#3c3e44',
  lamp: '#ffd9a8',
  lampLight: '#ffd2a0',
  shelter: '#5a5e66',
  shelterGlass: '#2a3540',
  canopyLightHex: '#ffe6c4',
  advert: '#d8e6ff',
  bench: '#4a4a50',
  bollard: '#5a5a60',
  stopBoard: '#1d2a4a',
  stopText: '#ffffff',
  mrtText: '#ffffff',
  signalBox: '#1a1a1c',
  signalRed: '#ff2a1a',
  signalAmber: '#ffb000',
  signalGreen: '#2aff8a',
  trunk: '#3a3028',
  leaves: '#2f5a3c',
  fairyWarm: '#ffd59a',

  // Traffic.
  cars: ['#1c1c20', '#d8d8dc', '#2a3a5a', '#5a1c20', '#8a8c90', '#101012', '#e8e4dc', '#30343a'],
  bus: '#c9ccd0',
  busWindows: '#ffe8c0',
  headlight: '#fff4e0',
  taillight: '#ff2010',

  rain: [0.62, 0.68, 0.8] as RGB,
};
