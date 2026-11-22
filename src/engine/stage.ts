import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { IsoCamera } from './isoCamera.ts';
import { THEME } from './theme.ts';

// Renderer, lights and post-processing. Colours and moods come from the active theme.

/** A vertical sky gradient for the scene background. */
function skyTexture(top: string, horizon: string) {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, horizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly view = new IsoCamera();
  readonly sun: THREE.DirectionalLight;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  /** Sun offset from the point it lights (also sets the shadow direction). */
  private readonly sunOffset = new THREE.Vector3(...THEME.sun.offset);

  constructor(canvas: HTMLCanvasElement) {
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = THEME.exposure;

    const [top, horizon] = THEME.sky;
    this.scene.background = top === horizon ? new THREE.Color(top) : skyTexture(top, horizon);
    this.scene.fog = new THREE.Fog(horizon, ...THEME.fog);

    this.scene.add(new THREE.HemisphereLight(THEME.hemi.sky, THEME.hemi.ground, THEME.hemi.intensity));
    this.sun = new THREE.DirectionalLight(THEME.sun.color, THEME.sun.intensity);
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
    const b = THEME.bloom;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength, b.radius, b.threshold);
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
