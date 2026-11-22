# Orchard Wars: notes for Claude

Risk-style turn-based turf war on the real map from Orchard Road to the Singapore River, in a
dystopian future. TypeScript + three.js + Vite. Fixed-angle orthographic camera ("diorama" look).
Rules and balance: docs/game-design.md.

## Working on it

- `npm run build && npm test` before every commit.
- **The owner wants every finished change merged into `main` and deployed**: work on a branch, then
  fast-forward `main` to it, push, and check the GitHub Pages deploy run passed.
- **Check visual changes yourself**: `npm run build && npm run shot` writes PNGs to `shots/` (title,
  overview, two close-ups, phone). Open them and look before saying a visual change works.
  URL hooks: `?gang=thorn` skips the title screen and briefing (`&brief=1` shows the briefing, `&name=` sets
  the team name), `?seed=7` fixes the dice, `?x=&z=&zoom=` places the
  camera. Headless rendering is slow, so timers in the UI run long compared with screenshots.
- Map data: `npm run map:fetch` then `npm run map:build`. `public/data/map.json` is generated but
  committed. `tools/cache/` is not committed.
- World units are metres; +x east, +z south. Use `project(lat, lon)` from `src/world/geo.ts` to place
  anything at a real location.

## Conventions

- Merge static geometry into one mesh per material; use `InstancedMesh` for repeated props. The game
  must stay smooth on mid-range phones.
- Game rules live only in `src/game/rules.ts` and change state only through `apply(state, action)`, so
  they stay testable and ready for online play. No DOM or three.js there.
- Online play: `src/net/` (see docs/multiplayer.md). The host's browser is the referee; players send intents.
  The UI only uses the `GameSession` interface, so keep single-player and online behaviour behind it. Test
  online flows with two tabs on `?net=local&profile=a` / `profile=b` (no Firebase needed).
- Visual looks live in `src/engine/theme.ts` (neon, daylight, golden, moonlit). Use `THEME.*` for any colour,
  glow or light; don't hard-code colours in world or shader code. A theme is applied at start-up, so
  switching reloads the page (the game resumes from its save). `?theme=` previews one.
- Ownership colours come from `Turf` (`src/world/turf.ts`); materials that show turf use `withTurf`.
- After changing numbers in `src/game/data.ts`, run `npm run sim` (400 computer-vs-computer games) and keep
  every gang roughly 18–32% wins; `npm test` also plays five full games.
- Territories use their real Singapore names, malls included (the owner asked for this; see the
  Names section of `docs/map-research.md` before any commercial release).
- Keep the OpenStreetMap credit visible in the game.
- Game content (gangs, regions, territories) lives in `src/game/data.ts`, not in rendering code.
