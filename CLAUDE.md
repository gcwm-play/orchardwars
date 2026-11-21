# Orchard Wars: notes for Claude

Top-down turf war game set on the real map from Orchard Road to the Singapore River, in a dystopian
future. TypeScript + three.js + Vite. Fixed-angle orthographic camera ("diorama" look).

## Working on it

- `npm run build && npm test` before every commit.
- **Check visual changes yourself**: `npm run build && npm run shot` writes PNGs to `shots/` (desktop,
  wide, Civic District and a phone view). Open them and look before saying a visual change works.
  Add a view to `VIEWS` in `tools/screenshot.ts` for new areas. `?x=&z=&zoom=` places the camera.
- Map data: `npm run map:fetch` then `npm run map:build`. `public/data/map.json` is generated but
  committed. `tools/cache/` is not committed.
- World units are metres; +x east, +z south. Use `project(lat, lon)` from `src/world/geo.ts` to place
  anything at a real location.

## Conventions

- Merge static geometry into one mesh per material; use `InstancedMesh` for repeated props. The game
  must stay smooth on mid-range phones.
- New building shaders must call `addCutaway` (in `buildWorld.ts`) so the player stays visible.
- Real streets, neighbourhoods, parks and public landmarks can use their real names. Malls, hotels and
  brands get made-up names in game (see `docs/map-research.md`).
- Keep the OpenStreetMap credit visible in the game.
- Game content (districts, gangs, later missions and items) lives in plain data files, not mixed into
  rendering code.
