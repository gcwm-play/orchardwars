import * as THREE from 'three';
import './style.css';
import { Stage } from './engine/stage.ts';
import { loadMap } from './world/mapData.ts';
import { buildWorld } from './world/buildWorld.ts';
import { project } from './world/geo.ts';
import { CollisionGrid } from './game/collision.ts';
import { Player } from './game/player.ts';
import { Input } from './game/input.ts';
import { Hud } from './ui/hud.ts';

// Spawn on Orchard Road outside ION Orchard (Orchard MRT).
const SPAWN = { lat: 1.30395, lon: 103.8318 };

async function start() {
  const root = document.getElementById('app')!;
  const canvas = document.createElement('canvas');
  root.appendChild(canvas);
  const status = document.getElementById('loading')!;

  const map = await loadMap();
  status.textContent = 'Building the city…';
  await new Promise((r) => setTimeout(r, 0));

  const grid = new CollisionGrid();
  for (const b of map.buildings) grid.fillPolygon(b.p);

  const stage = new Stage(canvas);
  const world = buildWorld(map, grid);
  stage.scene.add(world.group);

  const [sx, sz] = grid.nearestOpen(...project(SPAWN.lat, SPAWN.lon), 0.8);
  const player = new Player(sx, sz);
  stage.scene.add(player.object);

  const input = new Input(root);
  const hud = new Hud(root, map);

  // Debug/screenshot hooks: ?x=..&z=..&zoom=.. places the camera.
  const qs = new URLSearchParams(location.search);
  if (qs.has('x')) player.position.set(Number(qs.get('x')), 0, Number(qs.get('z') ?? 0));
  if (qs.has('zoom')) stage.view.viewHalfHeight = Number(qs.get('zoom'));
  stage.view.zoomBy(1);
  stage.view.target.copy(player.position);

  status.remove();
  const clock = new THREE.Clock();
  const toCamera = new THREE.Vector3();
  const loop = () => {
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    if (input.tapped('KeyQ')) stage.view.rotate(-1);
    if (input.tapped('KeyE')) stage.view.rotate(1);
    const z = input.zoom();
    if (z !== 1) stage.view.zoomBy(z);
    player.update(dt, input.move(), input.down('ShiftLeft') || input.down('ShiftRight'), stage.view.heading, grid);
    stage.update(dt, player.position);
    world.update(t, player.position, toCamera.subVectors(stage.view.camera.position, stage.view.target).normalize(),
      Math.max(10, stage.view.viewHalfHeight * 0.4));
    hud.update(player.position.x, player.position.z, stage.view.heading);
    stage.render();
    input.endFrame();
    requestAnimationFrame(loop);
  };
  loop();
  (window as unknown as { game: unknown }).game = { stage, player, map, grid };
}

start().catch((err) => {
  console.error(err);
  const status = document.getElementById('loading');
  if (status) status.textContent = `Could not start: ${(err as Error).message}`;
});
