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
| Tanglin | Tanglin Mall ◆, Cuscaden Road, Orchard Boulevard, Grange Road | 1 |
| Orchard | ION Orchard ◆, Ngee Ann City ◆, Paragon ◆, Scotts Square ◆ | 3 |
| Somerset | 313@Somerset ◆, Emerald Hill, Cairnhill, Killiney Road, Istana Park | 3 |
| River Valley | Great World ◆, Clarke Quay ◆, River Valley Road, Mohamed Sultan Road, Robertson Quay | 3 |
| Tiong Bahru | Tiong Bahru Plaza ◆, Tiong Bahru Estate, Havelock Road, Zion Road | 2 |
| Dhoby Ghaut | Plaza Singapura ◆, Fort Canning Park, Bras Basah Road | 2 |
| Bugis | Bugis Junction ◆, Rochor, Bencoolen Street, Beach Road | 1 |
| Civic District | Raffles City ◆, Capitol Singapore ◆, Funan ◆, The Padang | 4 |
| Marina | Marina Square ◆, Suntec City ◆, Esplanade ◆, Marina Centre | 3 |
| Raffles Place | Chinatown Point ◆, Raffles Place ◆, Hong Lim Park, Boat Quay | 2 |

◆ = stronghold. Territories use their real Singapore names; each one's `real` field in `data.ts` lists
the landmarks it covers (e.g. ION Orchard includes Wisma Atria).

## Gangs and the start

You name your own gang on the title screen. A name is suggested, and 🎲 rolls another. You're then
dropped into one of the four **corners** at random, and the other three corners go to computer gangs.
Each corner has 4 territories and one stronghold (Raffles Place has two). A **briefing** then shows:

- what you hold;
- your income, itemised;
- the perk of your corner;
- the strongholds and rival gangs next door.

The rest of the city starts with grey **Civic Guard** garrisons of 2–9 members. The Civic Guard never
attacks, but the rich centre (Orchard, the Civic District, Marina) is heavily defended.

| Corner | Default gang (computer) | Character |
| --- | --- | --- |
| Tanglin (NW) | Thorn Syndicate | Next to ION Orchard and Ngee Ann City, the richest and best-guarded malls |
| Bugis (NE) | Kopi Kartel | No rival on its border at the start |
| Raffles Place (SE) | River Tide | Two strongholds, river as a moat; +6 opening recruits |
| Tiong Bahru (SW) | Chrome Kampong | Rivals on two sides; +7 opening recruits |

## Reading the map

- **Strongholds** are diamonds with a gold `+N` income tag. Their territory is striped, and their real
  buildings glow.
- **Streets** are round badges.
- **Dice chips** on the badges: red squares are the dice your turf attacks with (on your attack phase).
  White squares are defence dice: shown on targets, and on your border turf during other gangs' turns.
- The **attack panel** shows both sides' dice and the chance that a Blitz takes the turf.
- **Battles** animate: the dice tumble, then line up highest against highest. Each matched pair shows a
  `−1` on the loser's side (ties go to the defender), extra dice are marked "not compared", and a running
  tally counts each side's losses. A Blitz plays its rounds one after another. Your own battles stay on
  screen until your next action; computer battles show their final round and then fade.
- The **scoreboard** shows every gang's strongholds, territories and recruits per turn.
- **On phones** the scoreboard is a single strip (◆ strongholds and +recruits per gang), the map controls
  fold into one "⋯" button, the territory card is a brief peek, and battle pop-ups close on a tap.
- **Map controls** (bottom right on desktop): rotate, zoom, north-up compass, whole-map view and a map key. Rotation
  also works with Q/E and a two-finger twist. Street names appear when you zoom in.

## A turn

1. **Recruit.** New members = max(3, territories ÷ 3) + stronghold income + region bonuses (+ the
   opening bonus on round 1). Place them on your turf. **Undo** takes back placements, ambushes and "Done" one step
   at a time, until your first attack of the turn. Deploying never touches the dice, so undo can't be
   used to re-roll a fight.
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
