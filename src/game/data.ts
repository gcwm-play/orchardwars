// Game content: gangs, regions and territories. Plain data, so it is easy to tune.
// Territory anchors are real places (see docs/map-research.md); the city around each
// anchor belongs to the nearest one, so moving an anchor moves the borders.

export type GangId = 'thorn' | 'kopi' | 'tide' | 'chrome' | 'neutral';
export type PlayerGang = Exclude<GangId, 'neutral'>;

export interface Gang {
  id: GangId;
  name: string;
  color: string;
  corner: string;
  blurb: string;
  /** One-off extra recruits on the gang's first turn, to even out the corners. */
  firstTurnBonus?: number;
}

export const GANGS: Record<GangId, Gang> = {
  thorn: {
    id: 'thorn',
    name: 'Thorn Syndicate',
    color: '#c6e03a',
    corner: 'Tanglin (north-west)',
    blurb: 'Old-money racketeers who want the luxury arcades of Orchard back.',
  },
  kopi: {
    id: 'kopi',
    name: 'Kopi Kartel',
    color: '#ff9a3c',
    corner: 'Bugis (north-east)',
    blurb: 'Night-market fixers. Every stall in Bugis pays them in favours.',
  },
  tide: {
    id: 'tide',
    name: 'River Tide',
    color: '#2fd4e6',
    corner: 'Bank Row (south-east)',
    firstTurnBonus: 6,
    blurb: 'Smugglers who own the quays and everything that floats.',
  },
  chrome: {
    id: 'chrome',
    name: 'Chrome Kampong',
    color: '#d14bff',
    corner: 'Tiong Bahru (south-west)',
    firstTurnBonus: 7,
    blurb: 'Augmented street kids from the old estates, hungry for malls.',
  },
  neutral: {
    id: 'neutral',
    name: 'Civic Guard',
    color: '#8c93a6',
    corner: 'the centre',
    blurb: 'A private militia holding the city centre. It never attacks, but it digs in.',
  },
};

export const PLAYER_GANGS: PlayerGang[] = ['thorn', 'kopi', 'tide', 'chrome'];

export interface Region {
  id: string;
  name: string;
  /** Extra members per turn for holding every territory in the region. */
  bonus: number;
}

export const REGIONS: Region[] = [
  { id: 'tanglin', name: 'Tanglin', bonus: 1 },
  { id: 'orchard', name: 'Orchard Belt', bonus: 3 },
  { id: 'somerset', name: 'Somerset Hills', bonus: 3 },
  { id: 'valley', name: 'River Valley', bonus: 3 },
  { id: 'bahru', name: 'Tiong Bahru', bonus: 2 },
  { id: 'dhoby', name: 'Dhoby Ghaut', bonus: 2 },
  { id: 'bugis', name: 'Bugis', bonus: 1 },
  { id: 'civic', name: 'Civic District', bonus: 4 },
  { id: 'marina', name: 'Marina', bonus: 3 },
  { id: 'bank', name: 'Bank Row', bonus: 2 },
];

export type TerritoryKind = 'mall' | 'street';

export interface TerritoryDef {
  id: string;
  /** In-game name. */
  name: string;
  /** The real place it stands for. */
  real: string;
  kind: TerritoryKind;
  region: string;
  lat: number;
  lon: number;
  /** Malls only: extra members per turn while held. */
  income?: number;
  /** Who holds it at the start, and with how many members. */
  start: { owner: GangId; members: number };
  /** Names of the real OSM buildings that are this mall (they glow as strongholds). */
  buildings?: string[];
}

const N = (members: number) => ({ owner: 'neutral' as const, members });

export const TERRITORIES: TerritoryDef[] = [
  // Tanglin: Thorn Syndicate's corner.
  { id: 'tanglin-bazaar', name: 'Tanglin Bazaar', real: 'Tanglin Mall', kind: 'mall', region: 'tanglin', lat: 1.3048, lon: 103.8238, income: 1, start: { owner: 'thorn', members: 4 }, buildings: ['Tanglin Mall'] },
  { id: 'tanglin-village', name: 'Tanglin Village', real: 'Cuscaden / Orchard Towers', kind: 'street', region: 'tanglin', lat: 1.3065, lon: 103.8290, start: { owner: 'thorn', members: 3 } },
  { id: 'orchard-boulevard', name: 'Boulevard', real: 'Orchard Boulevard', kind: 'street', region: 'tanglin', lat: 1.3012, lon: 103.8268, start: { owner: 'thorn', members: 3 } },
  { id: 'grange', name: 'Grange', real: 'Grange Road', kind: 'street', region: 'tanglin', lat: 1.2975, lon: 103.8300, start: { owner: 'thorn', members: 3 } },

  // Orchard Belt: the rich middle of the north.
  { id: 'spire', name: 'The Spire', real: 'ION Orchard', kind: 'mall', region: 'orchard', lat: 1.3040, lon: 103.8320, income: 2, start: N(9), buildings: ['ION Orchard', 'Wisma Atria'] },
  { id: 'twin-vaults', name: 'Twin Vaults', real: 'Ngee Ann City', kind: 'mall', region: 'orchard', lat: 1.3024, lon: 103.8346, income: 2, start: N(7), buildings: ['Ngee Ann City'] },
  { id: 'gilded-arcade', name: 'Gilded Arcade', real: 'Paragon', kind: 'mall', region: 'orchard', lat: 1.3040, lon: 103.8360, income: 2, start: N(6), buildings: ['Paragon', 'Paragon Medical'] },
  { id: 'scotts-tower', name: 'Scotts Tower', real: 'Scotts Road (Scotts Square, Far East Plaza)', kind: 'mall', region: 'orchard', lat: 1.3065, lon: 103.8330, income: 1, start: N(5), buildings: ['Scotts Square', 'Far East Plaza', 'Shaw House', 'Tang Plaza', 'Lucky Plaza'] },

  // Somerset Hills.
  { id: 'somerset-hub', name: 'Somerset Hub', real: '313@Somerset / The Centrepoint', kind: 'mall', region: 'somerset', lat: 1.3010, lon: 103.8392, income: 2, start: N(6), buildings: ['313@Somerset', 'The Centrepoint', 'Orchard Central', 'Orchard Gateway', 'TripleOne Somerset'] },
  { id: 'emerald-hill', name: 'Emerald Terraces', real: 'Emerald Hill', kind: 'street', region: 'somerset', lat: 1.3033, lon: 103.8418, start: N(3) },
  { id: 'cairnhill', name: 'Cairnhill', real: 'Cairnhill Road', kind: 'street', region: 'somerset', lat: 1.3070, lon: 103.8395, start: N(3) },
  { id: 'killiney', name: 'Killiney', real: 'Killiney Road', kind: 'street', region: 'somerset', lat: 1.2983, lon: 103.8398, start: N(3) },
  { id: 'istana-gate', name: 'Istana Gate', real: 'Istana Park / Penang Road', kind: 'street', region: 'somerset', lat: 1.3045, lon: 103.8470, start: N(4) },

  // River Valley.
  { id: 'worlds-end', name: "World's End Mall", real: 'Great World', kind: 'mall', region: 'valley', lat: 1.2936, lon: 103.8319, income: 1, start: N(3), buildings: ['Great World City'] },
  { id: 'river-valley', name: 'Valley Blocks', real: 'River Valley Road', kind: 'street', region: 'valley', lat: 1.2952, lon: 103.8368, start: N(2) },
  { id: 'mohamed-sultan', name: 'Sultan Row', real: 'Mohamed Sultan Road', kind: 'street', region: 'valley', lat: 1.2932, lon: 103.8412, start: N(2) },
  { id: 'robertson-quay', name: 'Robertson Quay', real: 'Robertson Quay', kind: 'street', region: 'valley', lat: 1.2903, lon: 103.8385, start: N(2) },
  { id: 'neon-quay', name: 'Neon Quay', real: 'Clarke Quay', kind: 'mall', region: 'valley', lat: 1.2900, lon: 103.8462, income: 2, start: N(4), buildings: ['Clarke Quay Central', 'Riverside Point'] },

  // Tiong Bahru: Chrome Kampong's corner.
  { id: 'bahru-plaza', name: 'Bahru Plaza', real: 'Tiong Bahru Plaza', kind: 'mall', region: 'bahru', lat: 1.2864, lon: 103.8273, income: 2, start: { owner: 'chrome', members: 4 }, buildings: ['Tiong Bahru Plaza'] },
  { id: 'bahru-estate', name: 'Bahru Estate', real: 'Tiong Bahru estate', kind: 'street', region: 'bahru', lat: 1.2845, lon: 103.8322, start: { owner: 'chrome', members: 3 } },
  { id: 'havelock', name: 'Havelock', real: 'Havelock Road', kind: 'street', region: 'bahru', lat: 1.2880, lon: 103.8350, start: { owner: 'chrome', members: 3 } },
  { id: 'zion', name: 'Zion Bridge', real: 'Zion Road / Kim Seng', kind: 'street', region: 'bahru', lat: 1.2905, lon: 103.8290, start: { owner: 'chrome', members: 3 } },

  // Dhoby Ghaut.
  { id: 'ghaut-plaza', name: 'Ghaut Plaza', real: 'Plaza Singapura', kind: 'mall', region: 'dhoby', lat: 1.3003, lon: 103.8452, income: 2, start: N(6), buildings: ['Plaza Singapura', 'The Cathay'] },
  { id: 'the-fort', name: 'The Fort', real: 'Fort Canning Park', kind: 'street', region: 'dhoby', lat: 1.2948, lon: 103.8455, start: N(3) },
  { id: 'bras-basah', name: 'Basah Bazaar', real: 'Bras Basah Road', kind: 'street', region: 'dhoby', lat: 1.2966, lon: 103.8510, start: N(3) },

  // Bugis: Kopi Kartel's corner.
  { id: 'junction-dome', name: 'Junction Dome', real: 'Bugis Junction', kind: 'mall', region: 'bugis', lat: 1.2998, lon: 103.8559, income: 1, start: { owner: 'kopi', members: 4 }, buildings: ['Bugis Junction', 'Bugis+', 'Bugis Junction Tower', 'Bugis Street'] },
  { id: 'rochor', name: 'Rochor', real: 'Sim Lim / Rochor', kind: 'street', region: 'bugis', lat: 1.3040, lon: 103.8530, start: { owner: 'kopi', members: 2 } },
  { id: 'bencoolen', name: 'Bencoolen', real: 'Bencoolen Street', kind: 'street', region: 'bugis', lat: 1.3003, lon: 103.8505, start: { owner: 'kopi', members: 2 } },
  { id: 'beach-road', name: 'Beach Road', real: 'Beach Road / Duo', kind: 'street', region: 'bugis', lat: 1.3025, lon: 103.8585, start: { owner: 'kopi', members: 2 } },

  // Civic District: the Civic Guard's stronghold.
  { id: 'stamford-atrium', name: 'Stamford Atrium', real: 'Raffles City', kind: 'mall', region: 'civic', lat: 1.2939, lon: 103.8533, income: 2, start: N(6), buildings: ['Raffles City Shopping Centre'] },
  { id: 'the-capitol', name: 'The Capitol', real: 'Capitol Singapore', kind: 'mall', region: 'civic', lat: 1.2933, lon: 103.8505, income: 1, start: N(5), buildings: ['Capitol Singapore', 'Capitol Building'] },
  { id: 'circuit-market', name: 'Circuit Market', real: 'Funan', kind: 'mall', region: 'civic', lat: 1.2912, lon: 103.8492, income: 1, start: N(4), buildings: ['Funan', 'Peninsula Plaza', 'Peninsula Shopping Centre'] },
  { id: 'padang', name: 'The Padang', real: 'The Padang', kind: 'street', region: 'civic', lat: 1.2903, lon: 103.8522, start: N(4) },

  // Marina.
  { id: 'marina-stacks', name: 'Marina Stacks', real: 'Marina Square', kind: 'mall', region: 'marina', lat: 1.2912, lon: 103.8575, income: 2, start: N(6), buildings: ['Marina Square', 'Millenia Walk'] },
  { id: 'fountain-towers', name: 'Fountain Towers', real: 'Suntec City', kind: 'mall', region: 'marina', lat: 1.2949, lon: 103.8600, income: 2, start: N(6), buildings: ['Suntec City', 'Suntec Tower 3', 'Suntec Tower 4', 'Suntec Singapore Convention & Exhibition Centre'] },
  { id: 'durian-domes', name: 'Durian Domes', real: 'Esplanade', kind: 'mall', region: 'marina', lat: 1.2897, lon: 103.8556, income: 2, start: N(5), buildings: ['Esplanade Theatres on the Bay', 'Esplanade Theatre', 'Esplanade Concert Hall', 'Esplanade Annexe'] },
  { id: 'marina-centre', name: 'Marina Centre', real: 'Nicoll Highway / Marina Centre', kind: 'street', region: 'marina', lat: 1.2962, lon: 103.8570, start: N(4) },

  // Bank Row: River Tide's corner.
  { id: 'pagoda-point', name: 'Pagoda Point', real: 'Chinatown Point', kind: 'mall', region: 'bank', lat: 1.2852, lon: 103.8445, income: 1, start: { owner: 'tide', members: 4 }, buildings: ['Chinatown Point', "People's Park Complex", "People's Park Centre"] },
  { id: 'hong-lim', name: 'Hong Lim', real: 'Hong Lim Park', kind: 'street', region: 'bank', lat: 1.2862, lon: 103.8475, start: { owner: 'tide', members: 3 } },
  { id: 'boat-quay', name: 'Boat Quay', real: 'Boat Quay', kind: 'street', region: 'bank', lat: 1.2872, lon: 103.8500, start: { owner: 'tide', members: 3 } },
  { id: 'raffles-place', name: 'Bank Row', real: 'Raffles Place (CBD towers)', kind: 'mall', region: 'bank', lat: 1.2842, lon: 103.8518, income: 1, start: { owner: 'tide', members: 4 }, buildings: ['One Raffles Place', 'UOB Plaza', 'Singapore Land Tower', 'CIMB Plaza', 'Chevron House', 'One Raffles Place Tower 2'] },
];

export const TERRITORY_INDEX = new Map(TERRITORIES.map((t, i) => [t.id, i]));

/** Win by holding this many strongholds at the start of your turn (or by wiping out the rivals). */
export const MALLS_TO_WIN = Math.ceil(TERRITORIES.filter((t) => t.kind === 'mall').length * 0.6);
