import * as THREE from 'three';
import './style.css';
import { Stage } from './engine/stage.ts';
import { savedTheme, setTheme, takeResumeFlag } from './engine/theme.ts';
import { MapControls } from './engine/mapControls.ts';
import { loadMap } from './world/mapData.ts';
import { buildWorld } from './world/buildWorld.ts';
import { worldRect } from './world/geo.ts';
import { anchors, buildTerritoryMap } from './world/territoryMap.ts';
import { Turf } from './world/turf.ts';
import { CollisionGrid } from './game/collision.ts';
import { Session } from './game/session.ts';
import { GameUi } from './ui/gameUi.ts';
import { Labels, RegionLabels, StreetNames } from './ui/labels.ts';
import { startScreen } from './ui/startScreen.ts';
import { ViewControls } from './ui/viewControls.ts';
import type { GameEvent } from './game/rules.ts';
import { GANGS, PLAYER_GANGS, type PlayerGang } from './game/data.ts';
import { Arrows } from './world/arrows.ts';
import { MapTags } from './ui/mapTags.ts';
import { briefing } from './ui/briefing.ts';

async function start() {
  // Pick the look before anything is built: ?theme=neon|daylight|golden|moonlit
  setTheme(new URLSearchParams(location.search).get('theme') ?? savedTheme());
  const root = document.getElementById('app')!;
  const canvas = document.createElement('canvas');
  root.appendChild(canvas);
  const status = document.getElementById('loading')!;

  const map = await loadMap();
  status.textContent = 'Building the city…';
  await new Promise((r) => setTimeout(r, 0));

  const grid = new CollisionGrid();
  for (const b of map.buildings) grid.fillPolygon(b.p);
  const territoryMap = buildTerritoryMap(map);
  const turf = new Turf(territoryMap);

  const stage = new Stage(canvas);
  const world = buildWorld(map, grid, turf);
  stage.scene.add(world.group);
  const rect = worldRect();
  stage.view.bounds = { minX: rect.minX + 200, maxX: rect.maxX - 200, minZ: rect.minZ + 150, maxZ: rect.maxZ - 150 };
  stage.view.target.set((rect.minX + rect.maxX) / 2, 0, (rect.minZ + rect.maxZ) / 2);

  // Debug/screenshot hooks: ?x=&z=&zoom= places the camera, ?gang= skips the title screen,
  // ?seed= fixes the dice.
  const qs = new URLSearchParams(location.search);
  if (qs.has('x')) stage.view.target.set(Number(qs.get('x')), 0, Number(qs.get('z') ?? 0));
  if (qs.has('zoom')) stage.view.viewHalfHeight = Number(qs.get('zoom'));
  stage.view.zoomBy(1);

  status.remove();

  // Render the city behind the title screen.
  const clock = new THREE.Clock();
  let ui: GameUi | null = null;
  let labels: Labels | null = null;
  let regionLabels: RegionLabels | null = null;
  let controls: MapControls | null = null;
  let viewCtl: ViewControls | null = null;
  const streets = new StreetNames(root, map);
  const arrows = new Arrows();
  stage.scene.add(arrows.group);
  const tags = new MapTags(root);
  const loop = () => {
    const dt = Math.min(0.05, clock.getDelta());
    controls?.update(dt);
    stage.update(dt);
    world.update(clock.elapsedTime, dt);
    if (ui && labels) {
      labels.sync(ui.state, ui.state.human, ui.selected, ui.currentTargets, ui.badgeChips());
      regionLabels?.sync(ui.state, ui.state.human);
      regionLabels?.update(stage.view.camera, canvas.clientWidth, canvas.clientHeight, stage.view.viewHalfHeight > 380);
      labels.update(stage.view.camera, canvas.clientWidth, canvas.clientHeight, stage.view.viewHalfHeight < 750, stage.view.viewHalfHeight < (canvas.clientWidth < 640 ? 700 : 1400));
    }
    viewCtl?.update(stage.view.heading);
    streets.update(stage.view.camera, canvas.clientWidth, canvas.clientHeight, stage.view.viewHalfHeight < 650);
    arrows.update(dt);
    tags.update(stage.view.camera, canvas.clientWidth, canvas.clientHeight);
    stage.render();
    requestAnimationFrame(loop);
  };
  loop();

  const saved = Session.load(territoryMap.adjacency);
  // ?gang= picks the corner directly (for testing); otherwise name your gang and draw a corner.
  const forced = qs.get('gang') as PlayerGang | null;
  const resume = saved !== null && takeResumeFlag();
  const choice = forced ? { name: qs.get('name') ?? '' } : resume ? ('resume' as const) : await startScreen(root, saved !== null);
  let session: Session;
  let events: GameEvent[] = [];
  let fresh = false;
  if (choice === 'resume' && saved) session = saved;
  else {
    const name = choice === 'resume' ? '' : choice.name;
    const corner = forced ?? PLAYER_GANGS[Math.floor(Math.random() * PLAYER_GANGS.length)];
    ({ session, events } = Session.start(territoryMap.adjacency, corner, Number(qs.get('seed') ?? Date.now()), name || undefined));
    fresh = !forced || qs.has('brief');
  }

  // Clicks: try the buildings first (strongholds stand tall), then the ground.
  const raycaster = new THREE.Raycaster();
  const buildings = world.group.getObjectByName('buildings') as THREE.Mesh;
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pickTerritory = (ndc: THREE.Vector2): number => {
    raycaster.setFromCamera(ndc, stage.view.camera);
    const hit = raycaster.intersectObject(buildings, false)[0];
    if (hit?.face) return (buildings.geometry.getAttribute('turf') as THREE.BufferAttribute).getX(hit.face.a);
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(groundPlane, p) ? turf.at(p.x, p.z) : -1;
  };

  ui = new GameUi(root, session, {
    highlight: (sel, targets, emphasis) => turf.setHighlight(sel, targets, emphasis),
    pulse: (t, k) => turf.pulse(t, k),
    owners: (o) => turf.setOwners(o),
    director: {
      frame: (ts, close) => stage.view.frame(ts.map((t) => anchors[t]), close ? 240 : 320, close ? 700 : 1300),
      arrow: (from, to, g, kind) => arrows.show(anchors[from], anchors[to], GANGS[g].color, kind),
      fadeArrows: () => arrows.fadeAll(),
      tag: (t, html, color) => tags.show(anchors[t][0], anchors[t][1], html, color, 2800, (world.labelHeights[t] || 0) + 30),
      userMovedSince: (time) => stage.view.lastUserInput > time,
    },
  });
  const gameUi = ui;
  labels = new Labels(root, world.labelHeights, (t) => gameUi.tap(t));
  regionLabels = new RegionLabels(root, (r) => gameUi.showRegion(r));
  controls = new MapControls(canvas, stage.view, {
    tap: (ndc) => gameUi.tap(pickTerritory(ndc)),
    hover: () => {},
  });
  const home = new THREE.Vector3((rect.minX + rect.maxX) / 2, 0, (rect.minZ + rect.maxZ) / 2);
  const homeZoom = 1250;
  viewCtl = new ViewControls(root, stage.view, () => {
    stage.view.focus(home.x, home.z);
    stage.view.zoomBy(homeZoom / stage.view.viewHalfHeight);
    stage.view.resetAngle();
  });
  if (fresh) {
    // Fly to the new corner while the briefing is up, then start play.
    const me = session.state.human!;
    const mine = session.state.owner.map((o, i) => (o === me ? i : -1)).filter((i) => i >= 0);
    const cx = mine.reduce((a, t) => a + anchors[t][0], 0) / mine.length;
    const cz = mine.reduce((a, t) => a + anchors[t][1], 0) / mine.length;
    stage.view.focus(cx, cz);
    stage.view.zoomBy(650 / stage.view.viewHalfHeight);
    await briefing(root, session.state, me);
  }
  gameUi.begin(events);
  (window as unknown as { game: unknown }).game = { stage, session, ui: gameUi, turf };
}

start().catch((err) => {
  console.error(err);
  const status = document.getElementById('loading');
  if (status) status.textContent = `Could not start: ${(err as Error).message}`;
});
