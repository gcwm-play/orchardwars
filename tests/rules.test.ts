import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MALLS_TO_WIN, PLAYER_GANGS, TERRITORIES, TERRITORY_INDEX } from '../src/game/data.ts';
import { AMBUSH_COST, AMBUSH_STRIKE, CUT_OFF_ATTACK_DICE, apply, isCutOff, newGame, recruitsFor, supplied, territoriesOf, type GameState } from '../src/game/rules.ts';
import { aiAction } from '../src/game/ai.ts';
import { buildTerritoryMap } from '../src/world/territoryMap.ts';
import type { MapData } from '../src/world/mapData.ts';

const map = JSON.parse(readFileSync(new URL('../public/data/map.json', import.meta.url), 'utf8')) as MapData;
const { adjacency } = buildTerritoryMap(map);
const T = (id: string) => TERRITORY_INDEX.get(id)!;
const adjacent = (a: string, b: string) => adjacency[T(a)].includes(T(b));

describe('territory map', () => {
  it('links every territory into one map', () => {
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) for (const j of adjacency[stack.pop()!]) if (!seen.has(j)) seen.add(j), stack.push(j);
    expect(seen.size).toBe(TERRITORIES.length);
  });

  it('follows the real streets', () => {
    expect(adjacent('spire', 'twin-vaults')).toBe(true); // ION and Ngee Ann City across Orchard Road
    expect(adjacent('ghaut-plaza', 'the-fort')).toBe(true);
    expect(adjacent('padang', 'stamford-atrium')).toBe(true);
  });

  it('only crosses the Singapore River at bridges', () => {
    expect(adjacent('boat-quay', 'padang')).toBe(true); // Cavenagh / Anderson Bridge
    expect(adjacent('raffles-place', 'tanglin-bazaar')).toBe(false);
    expect(adjacent('bahru-estate', 'mohamed-sultan')).toBe(false);
  });

  it('gives each gang its own corner of four, with at least one stronghold', () => {
    for (const g of PLAYER_GANGS) {
      const start = TERRITORIES.filter((t) => t.start.owner === g);
      expect(start.length).toBe(4);
      expect(start.some((t) => t.kind === 'mall')).toBe(true);
      // A corner is one connected block.
      const ids = start.map((t) => T(t.id));
      const seen = new Set([ids[0]]);
      const stack = [ids[0]];
      while (stack.length) for (const j of adjacency[stack.pop()!]) if (ids.includes(j) && !seen.has(j)) seen.add(j), stack.push(j);
      expect(seen.size).toBe(4);
    }
  });
});

function game(seed = 1): GameState {
  return newGame(adjacency, null, seed).state;
}

describe('recruiting', () => {
  it('pays a base of 3 plus mall income', () => {
    const s = game();
    const r = recruitsFor(s, 'thorn');
    expect(r.base).toBe(3);
    expect(r.malls).toEqual([{ t: T('tanglin-bazaar'), n: 1 }]);
    // Thorn starts holding all of Tanglin, so it also gets that region bonus.
    expect(r.regions).toEqual([{ region: 'tanglin', n: 1 }]);
    expect(r.total).toBe(3 + 1 + 1);
  });

  it('gives the harder corners a one-off first-turn bonus', () => {
    const s = game();
    expect(recruitsFor(s, 'tide').firstTurn).toBeGreaterThan(0);
    expect(recruitsFor(s, 'thorn').firstTurn).toBe(0);
    s.round = 2;
    expect(recruitsFor(s, 'tide').firstTurn).toBe(0);
  });

  it('spends reserves on hidden ambushes, only on street turf', () => {
    const s = game();
    s.current = 'thorn';
    s.reserves = 6;
    expect(() => apply(s, { type: 'ambush', t: T('tanglin-bazaar') })).toThrow();
    apply(s, { type: 'ambush', t: T('grange') });
    expect(s.ambush[T('grange')]).toBe('thorn');
    expect(s.reserves).toBe(6 - AMBUSH_COST);
  });
});

describe('battles', () => {
  it('springs an ambush on the attacker before the dice', () => {
    const s = game();
    s.ambush[T('zion')] = 'chrome';
    s.current = 'thorn';
    s.phase = 'attack';
    s.members[T('orchard-boulevard')] = 10;
    const events = apply(s, { type: 'attack', from: T('orchard-boulevard'), to: T('zion') });
    const battle = events.find((e) => e.type === 'battle')!;
    expect(battle.type === 'battle' && battle.ambushLoss).toBe(AMBUSH_STRIKE);
    expect(s.ambush[T('zion')]).toBe(null);
  });

  it('lets mall defenders roll 3 dice', () => {
    const s = game();
    s.current = 'thorn';
    s.phase = 'attack';
    s.members[T('tanglin-village')] = 20;
    const events = apply(s, { type: 'attack', from: T('tanglin-village'), to: T('spire') });
    const battle = events.find((e) => e.type === 'battle');
    expect(battle?.type === 'battle' && battle.rounds[0].def.length).toBe(3);
  });

  it('makes the winner move in after a capture', () => {
    const s = game();
    s.current = 'thorn';
    s.phase = 'attack';
    s.members[T('grange')] = 40;
    s.members[T('worlds-end')] = 1;
    apply(s, { type: 'attack', from: T('grange'), to: T('worlds-end'), blitz: true });
    expect(s.owner[T('worlds-end')]).toBe('thorn');
    expect(s.occupy).not.toBe(null);
    expect(() => apply(s, { type: 'endAttack' })).toThrow();
    apply(s, { type: 'occupy', n: 5 });
    expect(s.members[T('worlds-end')]).toBe(5);
  });
});

describe('computer gangs', () => {
  it.each([1, 2, 3, 4, 5])('play a whole game to a winner (seed %i)', (seed) => {
    const { state: s } = newGame(adjacency, null, seed);
    let steps = 0;
    while (s.phase !== 'over' && steps < 20000) {
      apply(s, aiAction(s));
      steps++;
      // Every held territory keeps at least one member.
      for (let i = 0; i < s.members.length; i++) if (!s.occupy || i !== s.occupy.to) expect(s.members[i]).toBeGreaterThan(0);
    }
    expect(s.winner).not.toBe(null);
    const w = s.winner!;
    expect(territoriesOf(s, w).length).toBeGreaterThan(0);
    expect(s.order.length === 1 || TERRITORIES.filter((t, i) => t.kind === 'mall' && s.owner[i] === w).length >= MALLS_TO_WIN).toBe(true);
  });
});

describe('undoing deployment', () => {
  it('takes back placements and ambushes until the first attack', async () => {
    const { Session } = await import('../src/game/session.ts');
    const { session } = Session.start(adjacency, 'thorn', 3, 'Test Crew');
    const s0 = () => session.state;
    // Let computer gangs play until it's our turn.
    while (!session.isHumanTurn) session.act(aiAction(s0()));
    const reserves = s0().reserves;
    const grange = T('grange');
    const before = s0().members[grange];
    session.act({ type: 'place', t: grange, n: 1 });
    session.act({ type: 'ambush', t: T('orchard-boulevard') });
    expect(session.undoCount).toBe(2);
    session.undo();
    expect(s0().ambush[T('orchard-boulevard')]).toBe(null);
    session.undo();
    expect(s0().members[grange]).toBe(before);
    expect(s0().reserves).toBe(reserves);
    expect(session.undoCount).toBe(0);

    // "Done" can be undone too, but an attack locks everything in.
    session.act({ type: 'place', t: grange, n: s0().reserves });
    session.act({ type: 'endRecruit' });
    expect(session.undoCount).toBe(2);
    session.undo();
    expect(s0().phase).toBe('recruit');
    session.act({ type: 'endRecruit' });
    const target = adjacency[grange].find((j) => s0().owner[j] !== 'thorn')!;
    session.act({ type: 'attack', from: grange, to: target });
    expect(session.undoCount).toBe(0);
    expect(session.undo()).toBe(false);
  });
});

describe('supply lines', () => {
  // Thorn holds Tanglin; give it Zion Road too, cut off from Tanglin Mall by Chrome's turf.
  function cutOffGame() {
    const s = game();
    s.current = 'thorn';
    s.phase = 'recruit';
    s.reserves = 5;
    s.owner[T('zion')] = 'thorn';
    s.owner[T('orchard-boulevard')] = 'chrome';
    s.owner[T('grange')] = 'chrome';
    return s;
  }

  it('marks turf with no path to a held stronghold as cut off', () => {
    const s = cutOffGame();
    expect(isCutOff(s, T('zion'))).toBe(true);
    expect(isCutOff(s, T('tanglin-village'))).toBe(false);
    expect(supplied(s, 'thorn').has(T('tanglin-bazaar'))).toBe(true);
  });

  it('refuses recruits and ambushes on cut-off turf', () => {
    const s = cutOffGame();
    expect(() => apply(s, { type: 'place', t: T('zion'), n: 3 })).toThrow(/cut off/);
    expect(() => apply(s, { type: 'ambush', t: T('zion') })).toThrow();
    apply(s, { type: 'place', t: T('tanglin-village'), n: 3 });
    expect(s.reserves).toBe(2);
  });

  it('caps attack dice from cut-off turf', () => {
    const s = cutOffGame();
    s.phase = 'attack';
    s.members[T('zion')] = 20;
    const events = apply(s, { type: 'attack', from: T('zion'), to: T('bahru-estate') });
    const battle = events.find((e) => e.type === 'battle');
    expect(battle?.type === 'battle' && battle.rounds[0].att.length).toBe(CUT_OFF_ATTACK_DICE);
  });

  it('treats everything as supplied for a gang with no strongholds', () => {
    const s = game();
    s.owner[T('tanglin-bazaar')] = 'chrome';
    expect(isCutOff(s, T('grange'))).toBe(false);
  });
});
