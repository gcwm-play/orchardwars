# Orchard Wars

A turn-based turf war in a dystopian future Singapore. Four gangs start in the corners of the
real city, from Tanglin to Bugis, Tiong Bahru and Raffles Place, and fight Risk-style for the malls and
streets between them. Malls are fortified strongholds that pay reinforcements. Street turf is
where you hide ambushes. Every building you take turns your gang's colour.

The map is the real city: streets, buildings, the river and parks come from OpenStreetMap, shown in
3D from a fixed overhead angle, like a diorama. Rules and balance: [docs/game-design.md](docs/game-design.md).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

Controls: **drag** to pan, **mouse wheel** or **pinch** to zoom, **Q/E** to turn the view, **WASD** or
arrow keys to pan. Tap a territory or its badge to select it. You play against three computer gangs,
and the game saves itself in the browser.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run sim` | Balance check: 400 computer-vs-computer games |
| `npm run shot` | Screenshots of the built game in `shots/` (needs Playwright + Chromium) |
| `npm run map:fetch` | Download Singapore's OSM data and cut out the playable area |
| `npm run map:build` | Turn it into `public/data/map.json` |

## How it's built

TypeScript + [three.js](https://threejs.org) + Vite. There is no game engine, so everything is code,
which makes it easy to build with Claude Code.

```
src/
  main.ts               start-up, picking, the render loop
  engine/stage.ts       renderer, dusk lighting, shadows, bloom
  engine/isoCamera.ts   fixed-angle orthographic camera (pan, zoom, 90° turns)
  engine/mapControls.ts drag / pinch / wheel / keys
  world/geo.ts          map bounds and lat/lon ↔ metres
  world/mapData.ts      map.json format and loader
  world/buildWorld.ts   builds the 3D city (merged meshes, window shader, gang colours, trees)
  world/territoryMap.ts territory borders and neighbours (rivers crossable only at bridges)
  world/turf.ts         ownership colours on the graphics card
  world/polygon.ts      2D geometry helpers
  game/data.ts          gangs, regions, the 41 territories
  game/rules.ts         the rules (pure, seeded, JSON state)
  game/ai.ts            computer gangs
  game/session.ts       running and saving a game
  game/collision.ts     building footprint grid
  ui/                   title screen, scoreboard, action panel, battle pop-up, badges
tools/                 map pipeline and screenshot tool
docs/map-research.md   the real geography
docs/game-design.md    rules, territories, balance, online plan
public/data/map.json   generated map data (commit it; it's what the game loads)
```

## Deploying

`.github/workflows/deploy.yml` runs the tests, builds and publishes to GitHub Pages on every push to
`main`. To turn it on once: **Settings → Pages → Source: GitHub Actions**.

## Credits

Map data © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright).
