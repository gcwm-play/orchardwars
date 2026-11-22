// Dice counts and battle odds, for showing players what a fight looks like before they start it.
// Pure helpers: they read the rules' numbers but never change a game.

import { MALL_DEFENCE_DICE } from './rules.ts';

/** Dice an attacking stack rolls (it must leave one member behind); maxDice is lower when cut off. */
export const attackDice = (members: number, maxDice = 3) => Math.max(0, Math.min(maxDice, members - 1));

/** Dice a defending stack rolls; strongholds roll more. */
export const defenceDice = (members: number, mall: boolean) => Math.min(mall ? MALL_DEFENCE_DICE : 2, members);

/**
 * Chance that a blitz from `att` members (one stays behind) clears `def` defenders.
 * Monte Carlo, so it is quick and follows the real rules exactly; good to about ±1%.
 */
export function blitzOdds(att: number, def: number, mall: boolean, maxAttDice = 3, runs = 4000): number {
  if (att < 2) return 0;
  if (def <= 0) return 1;
  let wins = 0;
  const roll = (n: number) => {
    const d: number[] = [];
    for (let i = 0; i < n; i++) d.push(1 + Math.floor(Math.random() * 6));
    return d.sort((a, b) => b - a);
  };
  for (let r = 0; r < runs; r++) {
    let a = att, d = def;
    while (a >= 2 && d > 0) {
      const ad = roll(attackDice(a, maxAttDice));
      const dd = roll(defenceDice(d, mall));
      const pairs = Math.min(ad.length, dd.length, 2);
      for (let k = 0; k < pairs; k++) {
        if (ad[k] > dd[k]) d--;
        else a--;
      }
    }
    if (d === 0) wins++;
  }
  return wins / runs;
}
