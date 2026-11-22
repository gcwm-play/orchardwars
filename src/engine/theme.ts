// Visual themes. Everything about the city's look that isn't game data lives here: sky, light,
// glow, building palette, windows, cel shading and ink outlines. Pick one with ?theme=<id>.

export type ThemeId = 'neon' | 'daylight' | 'golden' | 'moonlit';

export interface Theme {
  id: ThemeId;
  name: string;
  /** Sky gradient, top to horizon (fog fades to the horizon colour). */
  sky: [string, string];
  fog: [near: number, far: number];
  hemi: { sky: string; ground: string; intensity: number };
  sun: { color: string; intensity: number; offset: [number, number, number] };
  exposure: number;
  bloom: { strength: number; radius: number; threshold: number };
  ground: string;
  park: string;
  water: { color: string; emissive: string; glow: number };
  /** Road colours from small (footpaths) to big (expressways). */
  roads: { foot: string; pedestrian: string; service: string; minor: string; major: string };
  laneMarks: { color: string; glow: number };
  walls: string[];
  roofs: string[];
  /** How much of each wall takes the owning gang's colour (plain buildings, strongholds). */
  gangTint: [plain: number, stronghold: number];
  windows: { lit: number; warm: string; cool: string; glow: number; shops: number; colourful: boolean };
  /** Glowing band under roofs in the gang colour (0 = none). */
  roofBands: number;
  /** Turf tint on the ground and border glow. */
  /** Turf tint on the ground; borders glow (dark themes) and/or are inked in the owner's colour (light ones). */
  turf: { tint: number; borderGlow: number; borderInk: number; region: string; regionGlow: number };
  trees: string[];
  /** Cel shading: lighting in flat bands instead of smooth gradients. */
  toon: boolean;
  /** Ink lines on building edges. */
  outlines: { color: string; opacity: number } | null;
  ui: 'dark' | 'light';
}

export const THEMES: Record<ThemeId, Theme> = {
  // The original look: a dystopian neon dusk.
  neon: {
    id: 'neon',
    name: 'Neon dusk',
    sky: ['#1b1430', '#1b1430'],
    fog: [1500, 3200],
    hemi: { sky: '#8a7cff', ground: '#1f3a3a', intensity: 1.1 },
    sun: { color: '#ffb98a', intensity: 2.0, offset: [-260, 420, 180] },
    exposure: 1.05,
    bloom: { strength: 0.6, radius: 0.45, threshold: 0.72 },
    ground: '#2e2b38',
    park: '#2c5a3c',
    water: { color: '#0d4a66', emissive: '#06243a', glow: 0.9 },
    roads: { foot: '#4a4658', pedestrian: '#5a5368', service: '#24222c', minor: '#1f1d26', major: '#18161d' },
    laneMarks: { color: '#ffd36e', glow: 0.6 },
    walls: ['#6c6680', '#5d6478', '#7a7088', '#58606e', '#847a8c', '#4f5868'],
    roofs: ['#3a3646'],
    gangTint: [0.22, 0.62],
    windows: { lit: 0.42, warm: '#ffb861', cool: '#59d9ff', glow: 1.2, shops: 0.7, colourful: true },
    roofBands: 2.0,
    turf: { tint: 1, borderGlow: 0.9, borderInk: 0, region: '#d99e38', regionGlow: 0.22 },
    trees: ['#3f8a4e', '#4f9a3e', '#2f7a5a', '#5aa04a', '#3a7046'],
    toon: false,
    outlines: null,
    ui: 'dark',
  },

  // A warm afternoon in watercolour pastels: cream walls, terracotta and teal roofs, ink lines.
  daylight: {
    id: 'daylight',
    name: 'Daylight cel',
    sky: ['#8fcbe8', '#fdf0d4'],
    fog: [2200, 4200],
    hemi: { sky: '#fff3da', ground: '#a3b894', intensity: 1.5 },
    sun: { color: '#fff0cc', intensity: 2.4, offset: [-200, 520, 260] },
    exposure: 1.0,
    bloom: { strength: 0.12, radius: 0.3, threshold: 0.95 },
    ground: '#e6d6b8',
    park: '#9fcb86',
    water: { color: '#6db4d6', emissive: '#000000', glow: 0 },
    roads: { foot: '#d8ccb6', pedestrian: '#e0d3bb', service: '#b8ad9c', minor: '#a99e8e', major: '#958a7c' },
    laneMarks: { color: '#fffaf0', glow: 0 },
    walls: ['#f4e6c8', '#ecd0b0', '#f7f0e2', '#dce8de', '#f3d8c8', '#e9dfcb', '#d8e2ea'],
    roofs: ['#c96f4f', '#5f9893', '#a8735a', '#5a7f9e', '#d49a5a'],
    gangTint: [0.3, 0.6],
    windows: { lit: 0, warm: '#fff1c4', cool: '#8fb4cc', glow: 0, shops: 0, colourful: false },
    roofBands: 0,
    turf: { tint: 1.25, borderGlow: 0.1, borderInk: 0.9, region: '#c9762f', regionGlow: 0.05 },
    trees: ['#6fb35a', '#86c26a', '#5aa25b', '#9bcf73', '#4f9a57'],
    toon: true,
    outlines: { color: '#4a3a34', opacity: 0.5 },
    ui: 'light',
  },

  // Golden hour, sunset-anime style: peach and violet light, long shadows, a few warm windows.
  golden: {
    id: 'golden',
    name: 'Golden hour',
    sky: ['#6a5aa8', '#ffb98a'],
    fog: [1900, 3800],
    hemi: { sky: '#ffe2c8', ground: '#4d4070', intensity: 1.15 },
    sun: { color: '#ffb36e', intensity: 3.3, offset: [-420, 280, 120] },
    exposure: 1.0,
    bloom: { strength: 0.28, radius: 0.5, threshold: 0.88 },
    ground: '#a58ca8',
    park: '#8fb06e',
    water: { color: '#8c9ad8', emissive: '#2c2850', glow: 0.5 },
    roads: { foot: '#b39bb4', pedestrian: '#bba4ba', service: '#6e5a82', minor: '#5b4a72', major: '#46385e' },
    laneMarks: { color: '#ffe2a8', glow: 0.2 },
    walls: ['#f8d6bd', '#eebfcf', '#d3c0ea', '#fbe3b4', '#c3aedd', '#f5c9ad', '#e3d9f2'],
    roofs: ['#6a4f86', '#8a5a7a', '#4f5a8a', '#c26f5c'],
    gangTint: [0.25, 0.55],
    windows: { lit: 0.18, warm: '#ffc878', cool: '#ffe0b0', glow: 0.85, shops: 0.3, colourful: false },
    roofBands: 0.7,
    turf: { tint: 0.95, borderGlow: 0.45, borderInk: 0.4, region: '#ffcf7a', regionGlow: 0.12 },
    trees: ['#7fae5a', '#94bb68', '#6ea05c', '#a9c374'],
    toon: true,
    outlines: { color: '#3a2650', opacity: 0.45 },
    ui: 'dark',
  },

  // A calmer night: blues, warm yellow windows only, cel shading and ink lines, little glow.
  moonlit: {
    id: 'moonlit',
    name: 'Moonlit cel',
    sky: ['#0e1526', '#2a3d63'],
    fog: [1600, 3400],
    hemi: { sky: '#7f9fd6', ground: '#1b2440', intensity: 1.25 },
    sun: { color: '#c4d6ff', intensity: 1.5, offset: [-260, 420, 180] },
    exposure: 1.0,
    bloom: { strength: 0.3, radius: 0.4, threshold: 0.84 },
    ground: '#2f3a58',
    park: '#2f5048',
    water: { color: '#1f4468', emissive: '#0c1a2c', glow: 0.6 },
    roads: { foot: '#3f4a66', pedestrian: '#46506c', service: '#232b42', minor: '#1e263b', major: '#191f31' },
    laneMarks: { color: '#e8edf7', glow: 0.15 },
    walls: ['#6a7a9c', '#5a6a8c', '#7c8aa8', '#56648a', '#8090b0'],
    roofs: ['#2e3756', '#353f60'],
    gangTint: [0.22, 0.55],
    windows: { lit: 0.45, warm: '#ffd27a', cool: '#ffe3a6', glow: 1.0, shops: 0.45, colourful: false },
    roofBands: 0.9,
    turf: { tint: 0.9, borderGlow: 0.6, borderInk: 0, region: '#e0b45a', regionGlow: 0.15 },
    trees: ['#3e6e5a', '#4a7a5e', '#355f52', '#567f62'],
    toon: true,
    outlines: { color: '#0a0e1a', opacity: 0.55 },
    ui: 'dark',
  },
};

/** The theme in use, chosen once at start-up. */
export let THEME: Theme = THEMES.neon;

export function setTheme(id: string | null) {
  THEME = (id && id in THEMES ? THEMES[id as ThemeId] : THEMES.neon);
  document.documentElement.dataset.theme = THEME.ui;
  document.documentElement.dataset.look = THEME.id;
  return THEME;
}

/** A CSS colour string as a GLSL vec3 (linear, matching three.js colour management). */
export function glslColor(hex: string): string {
  const c = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return `vec3(${lin((c >> 16) & 255).toFixed(4)}, ${lin((c >> 8) & 255).toFixed(4)}, ${lin(c & 255).toFixed(4)})`;
}
