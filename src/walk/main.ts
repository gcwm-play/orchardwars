// Rain on Orchard Road: a walk at eye level along the real street, on a wet neon night.
// Rendered with three.js's WebGPU renderer, which falls back to WebGL 2 where WebGPU is missing.
//
// URL options: ?auto=1 starts without the title card, ?t=0.4 starts 40% of the way along,
// ?yaw=30 turns the head (degrees, + is left), ?side=-1 walks the other pavement,
// ?q=low|high picks the detail level, ?webgl=1 forces the WebGL 2 fallback,
// ?fixed=1 turns off automatic resolution scaling (for screenshots).

import * as THREE from 'three/webgpu';
import { color, mix, pass, screenUV } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { loadMap } from '../world/mapData.ts';
import { walkRoute } from './path.ts';
import { buildStreet } from './street.ts';
import { makeRain } from './rain.ts';
import { RainSound } from './sound.ts';
import { RAIN_LOOK } from './look.ts';
import './walk.css';

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const mobile = matchMedia('(pointer: coarse)').matches;
const low = params.get('q') ? params.get('q') === 'low' : mobile;
const Q = low
  ? { rain: 5000, reflectionScale: 0.3, lights: 3, pixelRatio: Math.min(devicePixelRatio, 1.25), aa: false }
  : { rain: 16000, reflectionScale: 0.5, lights: 6, pixelRatio: Math.min(devicePixelRatio, 2), aa: true };

const WALK_SPEED = 1.5; // metres per second
const EYE = 1.65;

const loading = document.getElementById('loading')!;
const say = (m: string) => (loading.textContent = m);

async function main() {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: Q.aa, forceWebGL: params.has('webgl') });
  await renderer.init();
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  renderer.setPixelRatio(Q.pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = RAIN_LOOK.exposure;

  say('Loading Orchard Road…');
  const map = await loadMap();
  const side = params.get('side') === '-1' ? -1 : 1;
  const route = walkRoute(map.roads, map.buildings, { street: 'Orchard Road', x0: -1110, x1: -470, side, pavement: 5 });

  const scene = new THREE.Scene();
  const [top, horizon] = RAIN_LOOK.sky;
  const street = buildStreet(map, route, { reflectionScale: Q.reflectionScale, lights: Q.lights });
  const flash = street.flash;
  scene.backgroundNode = mix(color(horizon), color(top), screenUV.y.oneMinus().pow(0.7)).add(flash.mul(0.35));
  scene.fog = new THREE.FogExp2(RAIN_LOOK.fog, RAIN_LOOK.fogDensity);
  scene.add(street.group);
  const hemi = new THREE.HemisphereLight(RAIN_LOOK.hemi.sky, RAIN_LOOK.hemi.ground, RAIN_LOOK.hemi.intensity);
  scene.add(hemi);
  // A handful of point lights follow the walker from lamp to lamp; the rest of the lamps only glow.
  const lights = Array.from({ length: Q.lights }, () => {
    const l = new THREE.PointLight(RAIN_LOOK.lampLight, 70, 30, 1.6);
    scene.add(l);
    return l;
  });
  scene.add(makeRain(Q.rain, flash));

  const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.1, 700);
  const curve = new THREE.CatmullRomCurve3(route.walk.map(([x, z]) => new THREE.Vector3(x, EYE, z)));
  curve.arcLengthDivisions = 2000;
  const length = curve.getLength();

  // Post-processing: bloom so the neon and the wet reflections glow.
  const post = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');
  const b = RAIN_LOOK.bloom;
  post.outputNode = sceneColor.add(bloom(sceneColor, b.strength, b.radius, b.threshold));

  // ---- Walking and looking.
  let s = Math.max(0, Math.min(0.999, num('t', 0))) * length;
  let speed = WALK_SPEED;
  let paused = false;
  let fast = false;
  let back = false;
  const baseYaw = (num('yaw', 0) * Math.PI) / 180;
  let yaw = baseYaw;
  let pitch = num('pitch', -2) * (Math.PI / 180);
  let lastLook = -1e9;
  let dragging: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yaw += ((e.clientX - dragging.x) / innerWidth) * 2.4;
    pitch = Math.max(-0.9, Math.min(1.1, pitch + ((e.clientY - dragging.y) / innerHeight) * 1.6));
    dragging = { x: e.clientX, y: e.clientY };
    lastLook = performance.now();
  });
  const endDrag = () => (dragging = null);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  let touches = 0;
  canvas.addEventListener('touchstart', (e) => (touches = e.touches.length), { passive: true });
  canvas.addEventListener('touchend', (e) => (touches = e.touches.length), { passive: true });
  addEventListener('keydown', (e) => {
    if (e.key === ' ') paused = !paused;
    if (e.key === 'Shift' || e.key === 'w' || e.key === 'ArrowUp') fast = true;
    if (e.key === 's' || e.key === 'ArrowDown') back = true;
    if (e.key === 'm') toggleMute();
  });
  addEventListener('keyup', (e) => {
    if (e.key === 'Shift' || e.key === 'w' || e.key === 'ArrowUp') fast = false;
    if (e.key === 's' || e.key === 'ArrowDown') back = false;
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  });

  // ---- Sound and lightning.
  const sound = new RainSound();
  const muteBtn = document.getElementById('mute') as HTMLButtonElement;
  const toggleMute = () => {
    sound.setMuted(!sound.muted);
    muteBtn.textContent = sound.muted ? 'Sound off' : 'Sound on';
  };
  muteBtn.addEventListener('click', toggleMute);
  let nextStrike = performance.now() + 9000 + Math.random() * 12000;
  let strikeAt = -1e9;
  let strikePattern: number[] = [];

  const hud = document.getElementById('hud')!;
  hud.querySelector('.backend')!.textContent = backend;
  const fade = document.getElementById('fade')!;

  // ---- Frame loop.
  const pos = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const look = new THREE.Vector3();
  const lampDist = street.lamps.map(() => 0);
  const order = street.lamps.map((_, i) => i);
  let last = performance.now();
  let walkTime = 0;
  let slow = 0;
  let pixelRatio = Q.pixelRatio;
  const adaptive = !params.has('fixed');
  let started = params.has('auto');

  function frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (started && !paused) {
      const want = back ? -WALK_SPEED * 2 : fast || touches >= 2 ? WALK_SPEED * 4 : WALK_SPEED;
      speed += (want - speed) * Math.min(1, dt * 2);
      s += speed * dt;
      walkTime += dt * Math.abs(speed);
      if (s > length - 1) {
        // Back to the start of the street, behind a quick fade.
        fade.classList.add('on');
        setTimeout(() => fade.classList.remove('on'), 900);
        s = 0;
      }
      s = Math.max(0, s);
    }
    curve.getPointAt(s / length, pos);
    curve.getTangentAt(Math.min(0.999, s / length + 0.004), tan);
    // Head bob in step with the walk.
    const bob = Math.sin(walkTime * 4.1) * 0.035;
    camera.position.set(pos.x, EYE + bob, pos.z);
    // After a few seconds without dragging, the gaze drifts back to straight ahead.
    if (!dragging && now - lastLook > 2500) {
      yaw += (baseYaw - yaw) * Math.min(1, dt * 0.8);
      pitch += (-0.035 - pitch) * Math.min(1, dt * 0.8);
    }
    const heading = Math.atan2(tan.x, tan.z) + yaw;
    look.set(pos.x + Math.sin(heading) * Math.cos(pitch), EYE + bob + Math.sin(pitch), pos.z + Math.cos(heading) * Math.cos(pitch));
    camera.lookAt(look);

    // Move the point lights to the nearest lamps.
    for (let i = 0; i < street.lamps.length; i++) lampDist[i] = street.lamps[i].distanceToSquared(camera.position);
    order.sort((a, c) => lampDist[a] - lampDist[c]);
    lights.forEach((l, i) => l.position.copy(street.lamps[order[i]]).setY(8.3));

    // Lightning: two or three quick flashes, thunder a moment later.
    if (started && now > nextStrike) {
      strikeAt = now;
      strikePattern = [0, 90 + Math.random() * 60, 260 + Math.random() * 200];
      const distance = Math.random();
      setTimeout(() => sound.thunder(distance), 600 + distance * 3000);
      nextStrike = now + 14000 + Math.random() * 26000;
    }
    let f = 0;
    for (const t0 of strikePattern) {
      const t = now - strikeAt - t0;
      if (t >= 0 && t < 160) f = Math.max(f, 1 - t / 160);
    }
    flash.value = f;
    hemi.intensity = RAIN_LOOK.hemi.intensity + f * 3;

    post.render();

    // Keep the frame rate up on slow devices by lowering the resolution in small steps.
    if (adaptive && started) {
      slow = dt > 1 / 40 ? slow + dt : Math.max(0, slow - dt * 0.5);
      if (slow > 2 && pixelRatio > 0.55) {
        pixelRatio = Math.max(0.55, pixelRatio - 0.15);
        renderer.setPixelRatio(pixelRatio);
        slow = 0;
      }
    }
  }

  say('Lighting the street…');
  await renderer.compileAsync(scene, camera);
  renderer.setAnimationLoop(frame);
  loading.remove();

  const card = document.getElementById('card')!;
  const go = () => {
    card.classList.add('gone');
    hud.classList.add('on');
    started = true;
    last = performance.now();
    sound.start();
  };
  if (started) {
    card.remove();
    hud.classList.add('on');
  } else {
    card.hidden = false;
    document.getElementById('start')!.addEventListener('click', go, { once: true });
  }
}

main().catch((e) => {
  console.error(e);
  say(`Could not start the walk: ${e instanceof Error ? e.message : e}`);
});
