import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { IsoCamera } from './isoCamera.ts';

// Renderer, lights and post-processing for the dystopian-dusk look.

export const PALETTE = {
  sky: 0x1b1430,
  sun: 0xffb98a,
  skyLight: 0x8a7cff,
  groundLight: 0x1f3a3a,
};

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly view = new IsoCamera();
  readonly sun: THREE.DirectionalLight;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  /** Sun offset from the point it lights (also sets the shadow direction). */
  private readonly sunOffset = new THREE.Vector3(-260, 420, 180);

  constructor(canvas: HTMLCanvasElement) {
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.sky, 1500, 3200);

    this.scene.add(new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundLight, 1.1));
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 2.0);
    this.sun.castShadow = true;
    const size = mobile ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const s = this.sun.shadow.camera;
    s.left = s.bottom = -260;
    s.right = s.top = 260;
    s.near = 10;
    s.far = 1400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.view.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const onResize = () => this.resize();
    addEventListener('resize', onResize);
    this.resize();
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 2, h / 2);
    this.view.resize(w, h);
  }

  /** Keep the sun's shadow box centred on what the camera is looking at. */
  update(dt: number, follow?: THREE.Vector3) {
    this.view.update(dt, follow);
    const t = this.view.target;
    this.sun.target.position.copy(t);
    this.sun.position.copy(t).add(this.sunOffset);
    // Widen the shadow box when zoomed out, within reason.
    const half = THREE.MathUtils.clamp(this.view.viewHalfHeight * 1.8, 120, 420);
    const sc = this.sun.shadow.camera;
    if (sc.right !== half) {
      sc.left = sc.bottom = -half;
      sc.right = sc.top = half;
      sc.updateProjectionMatrix();
    }
  }

  render() {
    this.composer.render();
  }
}
