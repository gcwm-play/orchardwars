// The rules of Orchard Wars, separate from graphics. Every change to the game goes through
// apply(state, action), the state is plain JSON, and dice use a seeded generator, so a game
// can be saved, replayed, or later run on a server for online play.
//
// A turn has three phases, like Risk:
//   1. Recruit: place new members (and optionally pay for hidden ambushes on street turf).
//   2. Attack:  fight neighbouring turf with dice; capture it when its defenders are gone.
//   3. Move:    one move of members between two connected territories you hold.

import { GANGS, MALLS_TO_WIN, PLAYER_GANGS, REGIONS, TERRITORIES, type GangId, type PlayerGang } from './data.ts';

export const AMBUSH_COST = 2; // members from the recruit pool
export const AMBUSH_STRIKE = 3; // attackers lost when walking into an ambush
export const MAX_AMBUSHES = 3; // active per gang
export const MALL_DEFENCE_DICE = 3; // malls are fortified: defenders roll 3 and keep the best 2
export const CUT_OFF_ATTACK_DICE = 2; // turf with no supply line attacks with fewer dice

export type Phase = 'recruit' | 'attack' | 'move' | 'over';

export interface GameState {
  version: 1;
  rng: number;
  round: number;
  /** Gangs still in the game, in turn order. */
  order: PlayerGang[];
  current: PlayerGang;
  human: PlayerGang | null;
  /** Custom gang names (the player's own team name), by gang. */
  names?: Partial<Record<GangId, string>>;
  /** Online games: the gangs people play (the rest are the computer). */
  humans?: PlayerGang[];
  phase: Phase;
  owner: GangId[];
  members: number[];
  /** Who has a hidden ambush in each territory. Only that gang may see it. */
  ambush: (PlayerGang | null)[];
  reserves: number;
  /** After a capture: members must move in before anything else. */
  occupy: { from: number; to: number; min: number; max: number } | null;
  moved: boolean;
  winner: PlayerGang | null;
  adjacency: number[][];
}

export type Action =
  | { type: 'place'; t: number; n: number }
  | { type: 'ambush'; t: number }
  | { type: 'endRecruit' }
  | { type: 'attack'; from: number; to: number; blitz?: boolean }
  | { type: 'occupy'; n: number }
  | { type: 'endAttack' }
  | { type: 'move'; from: number; to: number; n: number }
  | { type: 'endTurn' };

export interface Battle {
  type: 'battle';
  gang: PlayerGang;
  defender: GangId;
  from: number;
  to: number;
  rounds: { att: number[]; def: number[]; attLoss: number; defLoss: number }[];
  ambushLoss: number;
  attLoss: number;
  defLoss: number;
  captured: boolean;
}

export type GameEvent =
  | { type: 'turn'; gang: PlayerGang; round: number; recruits: Recruits }
  | { type: 'placed'; gang: PlayerGang; t: number; n: number }
  | { type: 'ambushSet'; gang: PlayerGang; t: number }
  | { type: 'phase'; phase: Phase }
  | Battle
  | { type: 'captured'; gang: PlayerGang; from: GangId; t: number }
  | { type: 'occupied'; gang: PlayerGang; from: number; to: number; n: number }
  | { type: 'moved'; gang: PlayerGang; from: number; to: number; n: number }
  | { type: 'eliminated'; gang: PlayerGang; by: PlayerGang }
  | { type: 'win'; gang: PlayerGang; reason: 'malls' | 'last' };

export interface Recruits {
  total: number;
  base: number;
  /** One-off first-turn bonus for gangs with a harder corner. */
  firstTurn: number;
  malls: { t: number; n: number }[];
  regions: { region: string; n: number }[];
}

// --- Set-up ------------------------------------------------------------------------

export function newGame(
  adjacency: number[][],
  human: PlayerGang | null,
  seed = Date.now(),
  names: Partial<Record<GangId, string>> = {},
): { state: GameState; events: GameEvent[] } {
  const order = shuffle(PLAYER_GANGS.slice(), mulberry(seed >>> 0));
  const state: GameState = {
    version: 1,
    rng: (seed ^ 0x9e3779b9) >>> 0,
    round: 1,
    order,
    current: order[0],
    human,
    names,
    phase: 'recruit',
    owner: TERRITORIES.map((t) => t.start.owner),
    members: TERRITORIES.map((t) => t.start.members),
    ambush: TERRITORIES.map(() => null),
    reserves: 0,
    occupy: null,
    moved: false,
    winner: null,
    adjacency,
  };
  return { state, events: startTurn(state) };
}

// --- Queries -----------------------------------------------------------------------

export const isMall = (t: number) => TERRITORIES[t].kind === 'mall';

export function territoriesOf(s: GameState, g: GangId): number[] {
  const out: number[] = [];
  s.owner.forEach((o, i) => o === g && out.push(i));
  return out;
}

export function mallsHeld(s: GameState, g: GangId): number {
  return s.owner.filter((o, i) => o === g && isMall(i)).length;
}

export function recruitsFor(s: GameState, g: GangId): Recruits {
  const firstTurn = s.round === 1 ? (GANGS[g].firstTurnBonus ?? 0) : 0;
  const mine = territoriesOf(s, g);
  const base = Math.max(3, Math.floor(mine.length / 3));
  const malls = mine.filter(isMall).map((t) => ({ t, n: TERRITORIES[t].income ?? 1 }));
  const regions = REGIONS.filter((r) => TERRITORIES.every((t, i) => t.region !== r.id || s.owner[i] === g)).map((r) => ({
    region: r.id,
    n: r.bonus,
  }));
  const total = base + firstTurn + malls.reduce((a, m) => a + m.n, 0) + regions.reduce((a, r) => a + r.n, 0);
  return { total, base, firstTurn, malls, regions };
}

/**
 * Supply lines: the turf a gang holds that connects, through its own territory, to a stronghold
 * it holds. Cut-off turf can't be reinforced and attacks with fewer dice. A gang with no
 * strongholds at all counts everything as supplied, so it can never be locked out completely.
 */
export function supplied(s: GameState, g: GangId): Set<number> {
  const mine = territoriesOf(s, g);
  const depots = mine.filter(isMall);
  if (depots.length === 0) return new Set(mine);
  const seen = new Set(depots);
  const stack = [...depots];
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of s.adjacency[i]) if (!seen.has(j) && s.owner[j] === g) seen.add(j), stack.push(j);
  }
  return seen;
}

/** Is this turf cut off from its owner's supply lines? (Neutral garrisons never are.) */
export function isCutOff(s: GameState, t: number): boolean {
  const g = s.owner[t];
  return g !== 'neutral' && !supplied(s, g).has(t);
}

/** Dice this turf attacks with: up to 3, or fewer when cut off. */
export function attackDiceFor(s: GameState, t: number): number {
  return Math.max(0, Math.min(isCutOff(s, t) ? CUT_OFF_ATTACK_DICE : 3, s.members[t] - 1));
}

export function canAttack(s: GameState, from: number, to: number): boolean {
  return (
    s.phase === 'attack' &&
    !s.occupy &&
    s.owner[from] === s.current &&
    s.owner[to] !== s.current &&
    s.members[from] >= 2 &&
    s.adjacency[from].includes(to)
  );
}

/** Territories reachable from `from` through turf the same gang holds. */
export function connected(s: GameState, from: number): Set<number> {
  const g = s.owner[from];
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of s.adjacency[i]) if (!seen.has(j) && s.owner[j] === g) seen.add(j), stack.push(j);
  }
  seen.delete(from);
  return seen;
}

export function canMove(s: GameState, from: number, to: number): boolean {
  return s.phase === 'move' && !s.moved && s.owner[from] === s.current && s.members[from] >= 2 && connected(s, from).has(to);
}

export function canAmbush(s: GameState, t: number): boolean {
  return (
    s.phase === 'recruit' &&
    s.owner[t] === s.current &&
    TERRITORIES[t].kind === 'street' &&
    s.ambush[t] === null &&
    !isCutOff(s, t) &&
    s.reserves >= AMBUSH_COST &&
    s.ambush.filter((a) => a === s.current).length < MAX_AMBUSHES
  );
}

// --- Applying actions --------------------------------------------------------------

export function apply(s: GameState, a: Action): GameEvent[] {
  if (s.phase === 'over') throw new Error('The game is over');
  if (s.occupy && a.type !== 'occupy') throw new Error('Move members into the captured turf first');
  const g = s.current;
  switch (a.type) {
    case 'place': {
      if (s.phase !== 'recruit' || s.owner[a.t] !== g) throw new Error('You can only recruit into your own turf');
      if (isCutOff(s, a.t)) throw new Error('That turf is cut off: no supply line to one of your strongholds');
      const n = Math.min(Math.max(1, Math.floor(a.n)), s.reserves);
      if (n <= 0) throw new Error('No members left to place');
      s.members[a.t] += n;
      s.reserves -= n;
      return [{ type: 'placed', gang: g, t: a.t, n }];
    }
    case 'ambush': {
      if (!canAmbush(s, a.t)) throw new Error('You cannot set an ambush there');
      s.reserves -= AMBUSH_COST;
      s.ambush[a.t] = g;
      return [{ type: 'ambushSet', gang: g, t: a.t }];
    }
    case 'endRecruit': {
      if (s.phase !== 'recruit') throw new Error('Not recruiting');
      if (s.reserves > 0) throw new Error('Place all your members first');
      s.phase = 'attack';
      return [{ type: 'phase', phase: 'attack' }];
    }
    case 'attack':
      return attack(s, a.from, a.to, a.blitz ?? false);
    case 'occupy': {
      const o = s.occupy;
      if (!o) throw new Error('Nothing to occupy');
      const n = Math.min(o.max, Math.max(o.min, Math.floor(a.n)));
      s.members[o.from] -= n;
      s.members[o.to] += n;
      s.occupy = null;
      const events: GameEvent[] = [{ type: 'occupied', gang: g, from: o.from, to: o.to, n }];
      return events.concat(checkLastStanding(s));
    }
    case 'endAttack': {
      if (s.phase !== 'attack') throw new Error('Not attacking');
      s.phase = 'move';
      return [{ type: 'phase', phase: 'move' }];
    }
    case 'move': {
      if (!canMove(s, a.from, a.to)) throw new Error('You cannot move there');
      const n = Math.min(s.members[a.from] - 1, Math.max(1, Math.floor(a.n)));
      s.members[a.from] -= n;
      s.members[a.to] += n;
      s.moved = true;
      return [{ type: 'moved', gang: g, from: a.from, to: a.to, n }];
    }
    case 'endTurn': {
      if (s.phase === 'recruit') throw new Error('Finish recruiting first');
      return nextTurn(s);
    }
  }
}

function attack(s: GameState, from: number, to: number, blitz: boolean): GameEvent[] {
  if (!canAttack(s, from, to)) throw new Error('You cannot attack there');
  const gang = s.current;
  const defender = s.owner[to];
  const battle: Battle = {
    type: 'battle', gang, defender, from, to, rounds: [], ambushLoss: 0, attLoss: 0, defLoss: 0, captured: false,
  };
  const rand = () => {
    s.rng = (s.rng + 0x6d2b79f5) >>> 0;
    return mulberryStep(s.rng);
  };

  // Walking into someone else's hidden ambush costs attackers before the dice roll.
  const trap = s.ambush[to];
  if (trap && trap !== gang) {
    const loss = Math.min(AMBUSH_STRIKE, s.members[from] - 1);
    s.members[from] -= loss;
    battle.ambushLoss = loss;
    battle.attLoss += loss;
    s.ambush[to] = null;
  }

  while (s.members[from] >= 2 && s.members[to] > 0) {
    const attN = attackDiceFor(s, from);
    const defN = Math.min(isMall(to) ? MALL_DEFENCE_DICE : 2, s.members[to]);
    const att = rollDice(attN, rand);
    const def = rollDice(defN, rand);
    const pairs = Math.min(att.length, def.length, 2);
    let attLoss = 0, defLoss = 0;
    for (let k = 0; k < pairs; k++) {
      if (att[k] > def[k]) defLoss++;
      else attLoss++; // ties go to the defender
    }
    s.members[from] -= attLoss;
    s.members[to] -= defLoss;
    battle.attLoss += attLoss;
    battle.defLoss += defLoss;
    battle.rounds.push({ att, def, attLoss, defLoss });
    if (!blitz) break;
  }

  const events: GameEvent[] = [battle];
  if (s.members[to] === 0) {
    battle.captured = true;
    s.owner[to] = gang;
    s.ambush[to] = null;
    const lastRoll = battle.rounds[battle.rounds.length - 1];
    const min = Math.min(lastRoll ? lastRoll.att.length : 1, s.members[from] - 1);
    s.occupy = { from, to, min: Math.max(1, min), max: s.members[from] - 1 };
    events.push({ type: 'captured', gang, from: defender, t: to });
    if (defender !== 'neutral' && territoriesOf(s, defender).length === 0) {
      s.order = s.order.filter((x) => x !== defender);
      s.ambush = s.ambush.map((x) => (x === defender ? null : x));
      events.push({ type: 'eliminated', gang: defender, by: gang });
    }
  }
  return events;
}

function checkLastStanding(s: GameState): GameEvent[] {
  if (s.order.length === 1) {
    s.phase = 'over';
    s.winner = s.order[0];
    return [{ type: 'win', gang: s.winner, reason: 'last' }];
  }
  return [];
}

function nextTurn(s: GameState): GameEvent[] {
  const i = s.order.indexOf(s.current);
  const next = s.order[(i + 1) % s.order.length];
  if (s.order.indexOf(next) <= i) s.round++;
  s.current = next;
  return startTurn(s);
}

function startTurn(s: GameState): GameEvent[] {
  const g = s.current;
  if (mallsHeld(s, g) >= MALLS_TO_WIN) {
    s.phase = 'over';
    s.winner = g;
    return [{ type: 'win', gang: g, reason: 'malls' }];
  }
  const recruits = recruitsFor(s, g);
  s.phase = 'recruit';
  s.reserves = recruits.total;
  s.moved = false;
  s.occupy = null;
  return [{ type: 'turn', gang: g, round: s.round, recruits }];
}

// --- Dice --------------------------------------------------------------------------

function rollDice(n: number, rand: () => number): number[] {
  const d: number[] = [];
  for (let i = 0; i < n; i++) d.push(1 + Math.floor(rand() * 6));
  return d.sort((a, b) => b - a);
}

function mulberryStep(t: number): number {
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

function mulberry(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    return mulberryStep(t);
  };
}

function shuffle<T>(a: T[], rand: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A gang's display name: the player's own name for their gang, or the default. */
export function gangName(s: GameState, g: GangId) {
  return s.names?.[g] ?? GANGS[g].name;
}
