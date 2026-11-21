// Computer-controlled gangs. aiAction() picks the next single action for the current gang,
// so the game can play them out one step at a time with animation. The AI only looks at
// its own ambushes: it doesn't know where other gangs have hidden theirs.

import { REGIONS, TERRITORIES } from './data.ts';
import {
  AMBUSH_COST, canAmbush, canAttack, connected, isMall, territoriesOf, type Action, type GameState,
} from './rules.ts';

/** How much the AI wants to own territory t. */
function value(s: GameState, t: number): number {
  const def = TERRITORIES[t];
  let v = 1 + (def.income ?? 0) * 2.5;
  // Worth more if it would complete (or nearly complete) a region.
  const region = REGIONS.find((r) => r.id === def.region)!;
  const inRegion = TERRITORIES.map((x, i) => (x.region === def.region ? i : -1)).filter((i) => i >= 0);
  const missing = inRegion.filter((i) => s.owner[i] !== s.current).length;
  if (missing === 1) v += region.bonus * 2;
  else if (missing === 2) v += region.bonus * 0.7;
  // Rival gangs are worth hitting more than neutral garrisons once the game is going.
  if (s.owner[t] !== 'neutral') v += s.round > 3 ? 1.5 : 0.5;
  return v;
}

function enemyNeighbours(s: GameState, t: number) {
  return s.adjacency[t].filter((j) => s.owner[j] !== s.current);
}

function bestTarget(s: GameState): { from: number; to: number; score: number } | null {
  let best: { from: number; to: number; score: number } | null = null;
  for (const from of territoriesOf(s, s.current)) {
    for (const to of enemyNeighbours(s, from)) {
      const odds = s.members[from] / (s.members[to] * (isMall(to) ? 1.4 : 1) + 1);
      const score = value(s, to) * odds;
      if (!best || score > best.score) best = { from, to, score };
    }
  }
  return best;
}

export function aiAction(s: GameState): Action {
  const me = s.current;
  if (s.occupy) {
    const o = s.occupy;
    // Keep members on the old turf only if it still faces enemies.
    const exposed = enemyNeighbours(s, o.from).length > 0;
    return { type: 'occupy', n: exposed ? Math.max(o.min, Math.ceil(o.max / 2)) : o.max };
  }

  if (s.phase === 'recruit') {
    if (s.reserves === 0) return { type: 'endRecruit' };
    // Sometimes hide an ambush on street turf facing a strong rival stack.
    if (s.reserves >= AMBUSH_COST + 2) {
      for (const t of territoriesOf(s, me)) {
        if (!canAmbush(s, t)) continue;
        const threat = s.adjacency[t].some((j) => s.owner[j] !== me && s.owner[j] !== 'neutral' && s.members[j] >= 4);
        if (threat && pseudo(s, t) < 0.35) return { type: 'ambush', t };
      }
    }
    const target = bestTarget(s);
    return { type: 'place', t: target ? target.from : territoriesOf(s, me)[0], n: s.reserves };
  }

  if (s.phase === 'attack') {
    let best: { from: number; to: number; score: number } | null = null;
    for (const from of territoriesOf(s, me)) {
      for (const to of enemyNeighbours(s, from)) {
        if (!canAttack(s, from, to)) continue;
        const need = s.members[to] * (isMall(to) ? 1.6 : 1.25) + 2;
        if (s.members[from] - 1 < need) continue;
        const score = value(s, to) * (s.members[from] / (s.members[to] + 1));
        if (!best || score > best.score) best = { from, to, score };
      }
    }
    if (best) return { type: 'attack', from: best.from, to: best.to, blitz: true };
    return { type: 'endAttack' };
  }

  // Move: bring the biggest safe stack to the most threatened border.
  if (!s.moved) {
    const mine = territoriesOf(s, me);
    const interior = mine.filter((t) => enemyNeighbours(s, t).length === 0 && s.members[t] > 1);
    interior.sort((a, b) => s.members[b] - s.members[a]);
    for (const from of interior) {
      const reach = [...connected(s, from)].filter((t) => enemyNeighbours(s, t).length > 0);
      if (!reach.length) continue;
      const threat = (t: number) => Math.max(...enemyNeighbours(s, t).map((j) => s.members[j])) - s.members[t];
      reach.sort((a, b) => threat(b) - threat(a));
      return { type: 'move', from, to: reach[0], n: s.members[from] - 1 };
    }
  }
  return { type: 'endTurn' };
}

/** Deterministic 0..1 from the game state, so AI choices replay the same way. */
function pseudo(s: GameState, salt: number) {
  const x = Math.sin((s.rng % 100000) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
