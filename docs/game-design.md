# Orchard Wars: game design

A turn-based turf war on the real map of Orchard Road to the Singapore River. It plays like
Risk, but the territories are real malls and neighbourhoods, and the board is a 3D city whose
buildings change colour as gangs take them.

## The board

**41 territories** (`src/game/data.ts`), each anchored on a real place. Every patch of the city
belongs to the nearest anchor, and two territories are neighbours if they share at least 24 m of
land border. Water only counts where a road crosses it, so **the Singapore River can only be
crossed at its bridges** (`src/world/territoryMap.ts`).

- **19 strongholds**: the big malls, plus the Esplanade and the Raffles Place towers. Their real
  buildings glow in the owner's colour.
  - **Income:** +1 to +2 members per turn while held.
  - **Fortified:** defenders roll **3 dice** and keep the best 2 (instead of 2).
  - **Win condition:** hold **12** of them at the start of your turn.
- **22 street turfs**: neighbourhoods, parks and quays. Low-lying ground, so they're the only place an
  **ambush** can be hidden.
- **10 regions**, which work like Risk's continents: hold every territory in one for a bonus each turn.

| Region | Territories | Bonus |
| --- | --- | --- |
| Tanglin | Tanglin Bazaar ◆, Tanglin Village, Boulevard, Grange | 1 |
| Orchard Belt | The Spire ◆, Twin Vaults ◆, Gilded Arcade ◆, Scotts Tower ◆ | 3 |
| Somerset Hills | Somerset Hub ◆, Emerald Terraces, Cairnhill, Killiney, Istana Gate | 3 |
| River Valley | World's End Mall ◆, Neon Quay ◆, Valley Blocks, Sultan Row, Robertson Quay | 3 |
| Tiong Bahru | Bahru Plaza ◆, Bahru Estate, Havelock, Zion Bridge | 2 |
| Dhoby Ghaut | Ghaut Plaza ◆, The Fort, Basah Bazaar | 2 |
| Bugis | Junction Dome ◆, Rochor, Bencoolen, Beach Road | 1 |
| Civic District | Stamford Atrium ◆, The Capitol ◆, Circuit Market ◆, The Padang | 4 |
| Marina | Marina Stacks ◆, Fountain Towers ◆, Durian Domes ◆, Marina Centre | 3 |
| Bank Row | Pagoda Point ◆, Bank Row ◆, Hong Lim, Boat Quay | 2 |

◆ = stronghold. In-game names stand in for the real malls (see `docs/map-research.md`).

## Gangs and the start

Four gangs each start in a **corner** with 4 territories and one stronghold (Bank Row has two). The
rest of the city starts with grey **Civic Guard** garrisons of 2–9 members. The Civic Guard never
attacks, but the rich centre (Orchard Belt, the Civic District, Marina) is heavily defended.

| Gang | Corner | Character |
| --- | --- | --- |
| Thorn Syndicate | Tanglin (NW) | Next to the rich Orchard Belt |
| Kopi Kartel | Bugis (NE) | No rival on its border at the start |
| River Tide | Bank Row (SE) | Fortified CBD towers; +6 opening recruits |
| Chrome Kampong | Tiong Bahru (SW) | Rivals on two sides; +7 opening recruits |

## A turn

1. **Recruit.** New members = max(3, territories ÷ 3) + stronghold income + region bonuses (+ the
   opening bonus on round 1). Place them on your turf.
   - **Ambush:** instead of placing, spend **2** members to hide an ambush on one of your street
     turfs (max 3 active). Only you can see it. The first rival who attacks that turf loses **3**
     attackers before any dice are rolled, and the ambush is used up.
2. **Attack**, as often as you like. Choose one of your turfs with 2+ members and a neighbour.
   - The attacker rolls up to 3 dice; the defender rolls 2, or 3 in a stronghold.
   - Compare the highest dice pairwise (up to 2 pairs). Ties go to the defender.
   - **Attack** rolls once; **Blitz** keeps rolling until one side runs out.
   - Clear a turf and you take it: its buildings switch to your colour, and you choose how many
     members move in.
   - Wipe out a gang's last turf and that gang is out.
3. **Move.** Once per turn, move members between two of your turfs connected through your own
   territory.

**Win** by starting your turn with 12 strongholds, or by being the last gang standing.

## Balance

`tests/rules.test.ts` plays full computer-vs-computer games. Over 400 such games with the current
numbers, the four gangs win **19–30%** of the time each, and a game lasts a median of
**21 rounds** (10th–90th percentile: 15–32). Ambushes get set in most games and sprung about 80% of the time.

Levers that were tuned, and what each fixed:

- **Civic Guard garrison sizes:** stop one corner snowballing through a soft neighbour.
- **Region bonuses:** the Orchard Belt was worth too much to Thorn.
- **Opening bonuses:** compensate the southern gangs, which fight each other early.
- **Raffles Place as a stronghold:** River Tide's thin riverside strip had six open fronts.

Re-run the simulation with `npm run sim` after changing numbers in `data.ts`.

## Architecture (and the path to online play)

- `src/game/rules.ts`: the rules, as pure functions of a plain-JSON `GameState`. Every change is an
  `Action` passed to `apply()`, which returns `GameEvent`s. Dice use a seeded generator stored in the
  state, so games are reproducible.
- `src/game/ai.ts`: computer gangs pick one action at a time. They don't see other gangs' ambushes.
- `src/game/session.ts`: runs a game and saves it to the browser after every action.
- `src/ui/*`: everything on screen. `src/world/turf.ts` recolours the city on the graphics card.

Because the state is JSON and changes only through actions, **online multiplayer** can be added
without touching the rules:

1. Keep the authoritative `GameState` on a server, or in a real-time database such as Firebase,
   which `inductionescaperoom` already uses.
2. Clients send `Action`s.
3. The server runs `apply()` and broadcasts the events.
4. Hide each gang's ambushes from the others before sending state.

Turn timers, lobbies and async (play-by-notification) games fit on top of the same model.

## Ideas not built yet

- Intel cards (Risk's cards): earned by capturing in a turn, traded for recruits or one-off tricks
  like revealing ambushes or a bridge blockade.
- Fog of war: see member counts only next to your own turf.
- Events: MRT breakdowns that cut links for a round, a monsoon flooding the quays.
- Gang abilities: e.g. River Tide moves along the river, Chrome Kampong ambushes cheaper.
- Online multiplayer, as above.
