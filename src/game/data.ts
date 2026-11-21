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
  /** What starting in this corner is like, for the player's briefing. */
  perk: string;
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
    perk: 'Right next door to Orchard Road: ION Orchard and Ngee Ann City are one step away. They are the richest strongholds on the map, and the most heavily guarded.',
  },
  kopi: {
    id: 'kopi',
    name: 'Kopi Kartel',
    color: '#ff9a3c',
    corner: 'Bugis (north-east)',
    blurb: 'Night-market fixers. Every stall in Bugis pays them in favours.',
    perk: 'A quiet start: no rival gang borders you. Use the calm to build up, then push west to Plaza Singapura or south into Marina.',
  },
  tide: {
    id: 'tide',
    name: 'River Tide',
    color: '#2fd4e6',
    corner: 'Raffles Place (south-east)',
    firstTurnBonus: 6,
    blurb: 'Smugglers who own the quays and everything that floats.',
    perk: 'Two strongholds from the start: the Raffles Place towers and Chinatown Point. The river is a moat, crossable only at the bridges. +6 extra recruits on your first turn.',
  },
  chrome: {
    id: 'chrome',
    name: 'Chrome Kampong',
    color: '#d14bff',
    corner: 'Tiong Bahru (south-west)',
    firstTurnBonus: 7,
    blurb: 'Augmented street kids from the old estates, hungry for malls.',
    perk: 'The hardest corner: rivals can reach you from Orchard and from the river. +7 extra recruits on your first turn to make up for it. Great World is your first prize.',
  },
  neutral: {
    id: 'neutral',
    name: 'Civic Guard',
    color: '#8c93a6',
    corner: 'the centre',
    blurb: 'A private militia holding the city centre. It never attacks, but it digs in.',
    perk: '',
  },
};

export const PLAYER_GANGS: PlayerGang[] = ['thorn', 'kopi', 'tide', 'chrome'];

const NAME_FIRST = ['Void Deck', 'Durian', 'Kopi-O', 'Chilli Crab', 'Merlion', 'Neon', 'Hawker', 'Monsoon', 'Kaya', 'Orchid',
  'Rojak', 'Laksa', 'Satay', 'Shiok', 'Kiasu', 'Ang Ku Kueh', 'Night Safari', 'Five-Foot Way', 'Mama Shop', 'Kampong'];
const NAME_LAST = ['Kings', 'Syndicate', 'Crew', 'Collective', 'Runners', 'Tigers', 'Dragons', 'Union', 'Ghosts', 'Cartel',
  'Brotherhood', 'Uncles', 'Aunties', 'Lords', 'Riders', 'Mafia'];

/** A random team-name suggestion with a Singapore flavour. */
export function suggestGangName(rand: () => number = Math.random): string {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  return `${pick(NAME_FIRST)} ${pick(NAME_LAST)}`;
}

export interface Region {
  id: string;
  name: string;
  /** Extra members per turn for holding every territory in the region. */
  bonus: number;
}

export const REGIONS: Region[] = [
  { id: 'tanglin', name: 'Tanglin', bonus: 1 },
  { id: 'orchard', name: 'Orchard', bonus: 3 },
  { id: 'somerset', name: 'Somerset', bonus: 3 },
  { id: 'valley', name: 'River Valley', bonus: 3 },
  { id: 'bahru', name: 'Tiong Bahru', bonus: 2 },
  { id: 'dhoby', name: 'Dhoby Ghaut', bonus: 2 },
  { id: 'bugis', name: 'Bugis', bonus: 1 },
  { id: 'civic', name: 'Civic District', bonus: 4 },
  { id: 'marina', name: 'Marina', bonus: 3 },
  { id: 'bank', name: 'Raffles Place', bonus: 2 },
];

export type TerritoryKind = 'mall' | 'street';

export interface TerritoryDef {
  id: string;
  /** The real place name, as on the Singapore map. */
  name: string;
  /** What's there: landmarks, MRT station, the streets it covers. */
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
  { id: 'tanglin-bazaar', name: 'Tanglin Mall', real: 'Tanglin Road, at the west end of Orchard Road', kind: 'mall', region: 'tanglin', lat: 1.3048, lon: 103.8238, income: 1, start: { owner: 'thorn', members: 4 }, buildings: ['Tanglin Mall'] },
  { id: 'tanglin-village', name: 'Cuscaden Road', real: 'Orchard Towers, Forum and Palais Renaissance', kind: 'street', region: 'tanglin', lat: 1.3065, lon: 103.8290, start: { owner: 'thorn', members: 3 } },
  { id: 'orchard-boulevard', name: 'Orchard Boulevard', real: 'Orchard Boulevard MRT and the condos behind Orchard Road', kind: 'street', region: 'tanglin', lat: 1.3012, lon: 103.8268, start: { owner: 'thorn', members: 3 } },
  { id: 'grange', name: 'Grange Road', real: 'Grange Road down to Kim Yam Road', kind: 'street', region: 'tanglin', lat: 1.2975, lon: 103.8300, start: { owner: 'thorn', members: 3 } },

  // Orchard: the rich middle of the north.
  { id: 'spire', name: 'ION Orchard', real: 'Orchard MRT, with Wisma Atria', kind: 'mall', region: 'orchard', lat: 1.3040, lon: 103.8320, income: 2, start: N(9), buildings: ['ION Orchard', 'Wisma Atria'] },
  { id: 'twin-vaults', name: 'Ngee Ann City', real: 'Takashimaya and the Orchard Road civic plaza', kind: 'mall', region: 'orchard', lat: 1.3024, lon: 103.8346, income: 2, start: N(7), buildings: ['Ngee Ann City'] },
  { id: 'gilded-arcade', name: 'Paragon', real: 'Paragon and Mandarin Gallery', kind: 'mall', region: 'orchard', lat: 1.3040, lon: 103.8360, income: 2, start: N(6), buildings: ['Paragon', 'Paragon Medical'] },
  { id: 'scotts-tower', name: 'Scotts Square', real: 'Scotts Road: Far East Plaza, Shaw House, Tang Plaza, Lucky Plaza', kind: 'mall', region: 'orchard', lat: 1.3065, lon: 103.8330, income: 1, start: N(5), buildings: ['Scotts Square', 'Far East Plaza', 'Shaw House', 'Tang Plaza', 'Lucky Plaza'] },

  // Somerset.
  { id: 'somerset-hub', name: '313@Somerset', real: 'Somerset MRT: Orchard Central, Orchard Gateway, The Centrepoint', kind: 'mall', region: 'somerset', lat: 1.3010, lon: 103.8392, income: 2, start: N(6), buildings: ['313@Somerset', 'The Centrepoint', 'Orchard Central', 'Orchard Gateway', 'TripleOne Somerset'] },
  { id: 'emerald-hill', name: 'Emerald Hill', real: 'Peranakan terrace houses off Orchard Road', kind: 'street', region: 'somerset', lat: 1.3033, lon: 103.8418, start: N(3) },
  { id: 'cairnhill', name: 'Cairnhill', real: 'Cairnhill Road and Cairnhill Circle', kind: 'street', region: 'somerset', lat: 1.3070, lon: 103.8395, start: N(3) },
  { id: 'killiney', name: 'Killiney Road', real: 'Killiney Road and Exeter Road', kind: 'street', region: 'somerset', lat: 1.2983, lon: 103.8398, start: N(3) },
  { id: 'istana-gate', name: 'Istana Park', real: 'Penang Road, Istana Park and the Istana gates', kind: 'street', region: 'somerset', lat: 1.3045, lon: 103.8470, start: N(4) },

  // River Valley.
  { id: 'worlds-end', name: 'Great World', real: 'Great World City on Kim Seng Road', kind: 'mall', region: 'valley', lat: 1.2936, lon: 103.8319, income: 1, start: N(3), buildings: ['Great World City'] },
  { id: 'river-valley', name: 'River Valley Road', real: 'River Valley Road around Zion Road and Kim Yam', kind: 'street', region: 'valley', lat: 1.2952, lon: 103.8368, start: N(2) },
  { id: 'mohamed-sultan', name: 'Mohamed Sultan Road', real: 'Mohamed Sultan Road and Martin Road', kind: 'street', region: 'valley', lat: 1.2932, lon: 103.8412, start: N(2) },
  { id: 'robertson-quay', name: 'Robertson Quay', real: 'The riverside quay west of Clarke Quay', kind: 'street', region: 'valley', lat: 1.2903, lon: 103.8385, start: N(2) },
  { id: 'neon-quay', name: 'Clarke Quay', real: 'Clarke Quay Central and Riverside Point', kind: 'mall', region: 'valley', lat: 1.2900, lon: 103.8462, income: 2, start: N(4), buildings: ['Clarke Quay Central', 'Riverside Point'] },

  // Tiong Bahru: Chrome Kampong's corner.
  { id: 'bahru-plaza', name: 'Tiong Bahru Plaza', real: 'Tiong Bahru MRT', kind: 'mall', region: 'bahru', lat: 1.2864, lon: 103.8273, income: 2, start: { owner: 'chrome', members: 4 }, buildings: ['Tiong Bahru Plaza'] },
  { id: 'bahru-estate', name: 'Tiong Bahru Estate', real: 'The 1930s flats around Seng Poh Road', kind: 'street', region: 'bahru', lat: 1.2845, lon: 103.8322, start: { owner: 'chrome', members: 3 } },
  { id: 'havelock', name: 'Havelock Road', real: 'Havelock Road hotels and flats', kind: 'street', region: 'bahru', lat: 1.2880, lon: 103.8350, start: { owner: 'chrome', members: 3 } },
  { id: 'zion', name: 'Zion Road', real: 'Zion Road and Kim Seng Bridge', kind: 'street', region: 'bahru', lat: 1.2905, lon: 103.8290, start: { owner: 'chrome', members: 3 } },

  // Dhoby Ghaut.
  { id: 'ghaut-plaza', name: 'Plaza Singapura', real: 'Dhoby Ghaut MRT, with The Cathay', kind: 'mall', region: 'dhoby', lat: 1.3003, lon: 103.8452, income: 2, start: N(6), buildings: ['Plaza Singapura', 'The Cathay'] },
  { id: 'the-fort', name: 'Fort Canning Park', real: 'Fort Canning Hill', kind: 'street', region: 'dhoby', lat: 1.2948, lon: 103.8455, start: N(3) },
  { id: 'bras-basah', name: 'Bras Basah Road', real: 'SMU, the museums and Bras Basah Complex', kind: 'street', region: 'dhoby', lat: 1.2966, lon: 103.8510, start: N(3) },

  // Bugis: Kopi Kartel's corner.
  { id: 'junction-dome', name: 'Bugis Junction', real: 'Bugis MRT: Bugis+, Bugis Street', kind: 'mall', region: 'bugis', lat: 1.2998, lon: 103.8559, income: 1, start: { owner: 'kopi', members: 4 }, buildings: ['Bugis Junction', 'Bugis+', 'Bugis Junction Tower', 'Bugis Street'] },
  { id: 'rochor', name: 'Rochor', real: 'Sim Lim Square and Rochor Road', kind: 'street', region: 'bugis', lat: 1.3040, lon: 103.8530, start: { owner: 'kopi', members: 2 } },
  { id: 'bencoolen', name: 'Bencoolen Street', real: 'Bencoolen MRT and Sunshine Plaza', kind: 'street', region: 'bugis', lat: 1.3003, lon: 103.8505, start: { owner: 'kopi', members: 2 } },
  { id: 'beach-road', name: 'Beach Road', real: 'Beach Road, Duo and Parkview Square', kind: 'street', region: 'bugis', lat: 1.3025, lon: 103.8585, start: { owner: 'kopi', members: 2 } },

  // Civic District: the Civic Guard's stronghold.
  { id: 'stamford-atrium', name: 'Raffles City', real: 'City Hall MRT', kind: 'mall', region: 'civic', lat: 1.2939, lon: 103.8533, income: 2, start: N(6), buildings: ['Raffles City Shopping Centre'] },
  { id: 'the-capitol', name: 'Capitol Singapore', real: 'Capitol Theatre and Stamford House', kind: 'mall', region: 'civic', lat: 1.2933, lon: 103.8505, income: 1, start: N(5), buildings: ['Capitol Singapore', 'Capitol Building'] },
  { id: 'circuit-market', name: 'Funan', real: 'Funan and Peninsula Plaza on North Bridge Road', kind: 'mall', region: 'civic', lat: 1.2912, lon: 103.8492, income: 1, start: N(4), buildings: ['Funan', 'Peninsula Plaza', 'Peninsula Shopping Centre'] },
  { id: 'padang', name: 'The Padang', real: 'The Padang, National Gallery and the Cricket Club', kind: 'street', region: 'civic', lat: 1.2903, lon: 103.8522, start: N(4) },

  // Marina.
  { id: 'marina-stacks', name: 'Marina Square', real: 'Marina Square and Millenia Walk', kind: 'mall', region: 'marina', lat: 1.2912, lon: 103.8575, income: 2, start: N(6), buildings: ['Marina Square', 'Millenia Walk'] },
  { id: 'fountain-towers', name: 'Suntec City', real: 'Suntec City towers and the convention centre', kind: 'mall', region: 'marina', lat: 1.2949, lon: 103.8600, income: 2, start: N(6), buildings: ['Suntec City', 'Suntec Tower 3', 'Suntec Tower 4', 'Suntec Singapore Convention & Exhibition Centre'] },
  { id: 'durian-domes', name: 'Esplanade', real: 'Esplanade theatres and Esplanade Park', kind: 'mall', region: 'marina', lat: 1.2897, lon: 103.8556, income: 2, start: N(5), buildings: ['Esplanade Theatres on the Bay', 'Esplanade Theatre', 'Esplanade Concert Hall', 'Esplanade Annexe'] },
  { id: 'marina-centre', name: 'Marina Centre', real: 'Nicoll Highway and Raffles Boulevard', kind: 'street', region: 'marina', lat: 1.2962, lon: 103.8570, start: N(4) },

  // Raffles Place: River Tide's corner.
  { id: 'pagoda-point', name: 'Chinatown Point', real: 'Chinatown Point and People\'s Park', kind: 'mall', region: 'bank', lat: 1.2852, lon: 103.8445, income: 1, start: { owner: 'tide', members: 4 }, buildings: ['Chinatown Point', "People's Park Complex", "People's Park Centre"] },
  { id: 'hong-lim', name: 'Hong Lim Park', real: 'Hong Lim Park and the food centre', kind: 'street', region: 'bank', lat: 1.2862, lon: 103.8475, start: { owner: 'tide', members: 3 } },
  { id: 'boat-quay', name: 'Boat Quay', real: 'The shophouse strip on the river', kind: 'street', region: 'bank', lat: 1.2872, lon: 103.8500, start: { owner: 'tide', members: 3 } },
  { id: 'raffles-place', name: 'Raffles Place', real: 'The CBD towers: One Raffles Place, UOB Plaza', kind: 'mall', region: 'bank', lat: 1.2842, lon: 103.8518, income: 1, start: { owner: 'tide', members: 4 }, buildings: ['One Raffles Place', 'UOB Plaza', 'Singapore Land Tower', 'CIMB Plaza', 'Chevron House', 'One Raffles Place Tower 2'] },
];

export const TERRITORY_INDEX = new Map(TERRITORIES.map((t, i) => [t.id, i]));

/** Win by holding this many strongholds at the start of your turn (or by wiping out the rivals). */
export const MALLS_TO_WIN = Math.ceil(TERRITORIES.filter((t) => t.kind === 'mall').length * 0.6);
