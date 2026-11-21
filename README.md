# Orchard Wars

A turf war in a dystopian future Singapore. Gangs fight for control of the city from Orchard Road
down to City Hall, the Esplanade and the Singapore River. It plays like a classic top-down crime
sandbox with RPG and strategy layers, in 3D with a fixed overhead camera, like a diorama.

The map is the real city: streets, buildings, the river and parks come from OpenStreetMap.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

Controls: **WASD** or arrow keys to move, **Shift** to sprint, **Q/E** to turn the view,
**mouse wheel** or **+/-** to zoom. On phones: drag on the left half of the screen to move and pinch to
zoom.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run shot` | Screenshots of the built game in `shots/` (needs Playwright + Chromium) |
| `npm run map:fetch` | Download Singapore's OSM data and cut out the playable area |
| `npm run map:build` | Turn it into `public/data/map.json` |

## How it's built

TypeScript + [three.js](https://threejs.org) + Vite. There is no game engine, so everything is code,
which makes it easy to build with Claude Code.

```
src/
  main.ts              start-up and the game loop
  engine/stage.ts      renderer, dusk lighting, shadows, bloom
  engine/isoCamera.ts  fixed-angle orthographic camera (follow, zoom, 90° turns)
  world/geo.ts         map bounds and lat/lon ↔ metres
  world/districts.ts   turf districts and gangs
  world/mapData.ts     map.json format and loader
  world/buildWorld.ts  builds the 3D city (merged meshes, window shader, cutaway, trees)
  world/polygon.ts     2D geometry helpers
  game/collision.ts    building collision grid
  game/player.ts       the player on foot
  game/input.ts        keyboard and touch joystick
  ui/hud.ts            turf banner and minimap
tools/                 map pipeline and screenshot tool
docs/map-research.md   the real geography and how it maps to turf
public/data/map.json   generated map data (commit it; it's what the game loads)
```

## Deploying

`.github/workflows/deploy.yml` runs the tests, builds and publishes to GitHub Pages on every push to
`main`. To turn it on once: **Settings → Pages → Source: GitHub Actions**.

## Credits

Map data © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright).
