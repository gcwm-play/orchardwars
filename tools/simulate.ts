// Plays many computer-vs-computer games to check balance after changing src/game/data.ts.
//   npm run sim            (400 games)
//   npm run sim -- 1000

import { readFileSync } from 'node:fs';
import { buildTerritoryMap } from '../src/world/territoryMap.ts';
import { apply, newGame } from '../src/game/rules.ts';
import { aiAction } from '../src/game/ai.ts';
import { GANGS } from '../src/game/data.ts';
import type { MapData } from '../src/world/mapData.ts';

const games = Number(process.argv[2] ?? 400);
const map = JSON.parse(readFileSync(new URL('../public/data/map.json', import.meta.url), 'utf8')) as MapData;
const { adjacency } = buildTerritoryMap(map);

const wins: Record<string, number> = {};
const rounds: number[] = [];
let ambushesSet = 0, ambushesSprung = 0;
for (let seed = 1; seed <= games; seed++) {
  const { state: s } = newGame(adjacency, null, seed);
  for (let n = 0; s.phase !== 'over' && n < 30000; n++) {
    for (const e of apply(s, aiAction(s))) {
      if (e.type === 'ambushSet') ambushesSet++;
      if (e.type === 'battle' && e.ambushLoss) ambushesSprung++;
    }
  }
  wins[s.winner ?? 'none'] = (wins[s.winner ?? 'none'] ?? 0) + 1;
  rounds.push(s.round);
}
rounds.sort((a, b) => a - b);
const pct = (p: number) => rounds[Math.min(rounds.length - 1, Math.floor(rounds.length * p))];
console.log(`${games} games`);
for (const [g, n] of Object.entries(wins).sort((a, b) => b[1] - a[1])) {
  const name = g in GANGS ? GANGS[g as keyof typeof GANGS].name : g;
  console.log(`  ${name.padEnd(16)} ${((n / games) * 100).toFixed(1)}% wins`);
}
console.log(`  rounds: median ${pct(0.5)}, 10th-90th percentile ${pct(0.1)}-${pct(0.9)}`);
console.log(`  ambushes: ${ambushesSet} set, ${ambushesSprung} sprung`);
