import * as THREE from 'three';
import type { IsoCamera } from './isoCamera.ts';

// Strategy-map controls: drag to pan, wheel or pinch to zoom, Q/E to turn, WASD/arrows to pan,
// and a tap (press and release without dragging) to pick something.

export interface PickHandlers {
  tap(ndc: THREE.Vector2): void;
  hover(ndc: THREE.Vector2 | null): void;
}

export class MapControls {
  private pointers = new Map<number, { x: number; y: number }>();
  private dragged = 0;
  private pinchDist = 0;
  private twistAngle = 0;
  private twistAcc = 0;
  private keys = new Set<string>();

  constructor(private readonly el: HTMLElement, private readonly view: IsoCamera, private readonly pick: PickHandlers) {
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) this.dragged = 0;
      if (this.pointers.size === 2) {
        this.pinchDist = this.spread();
        this.twistAngle = this.angle();
        this.twistAcc = 0;
      }
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') this.pick.hover(this.ndc(e.clientX, e.clientY));
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) {
        this.dragged += Math.abs(dx) + Math.abs(dy);
        if (this.dragged > 6) this.view.panPixels(dx, dy, el.clientHeight);
      } else if (this.pointers.size === 2) {
        const d = this.spread();
        if (this.pinchDist > 0) this.view.zoomBy(this.pinchDist / d);
        this.pinchDist = d;
        // Two-finger twist turns the map a quarter turn once it passes 35 degrees.
        const a = this.angle();
        let da = a - this.twistAngle;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        this.twistAngle = a;
        this.twistAcc += da;
        if (Math.abs(this.twistAcc) > 0.6) {
          this.view.rotate(Math.sign(this.twistAcc));
          this.twistAcc = 0;
        }
        this.dragged = 999;
      }
    });
    const up = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0 && this.dragged <= 6 && e.type === 'pointerup') {
        this.pick.tap(this.ndc(e.clientX, e.clientY));
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => this.pick.hover(null));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.view.zoomBy(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest?.('input, button, textarea')) return;
      this.keys.add(e.code);
      if (e.code === 'KeyQ') this.view.rotate(-1);
      if (e.code === 'KeyE') this.view.rotate(1);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  update(dt: number) {
    const k = (c: string) => this.keys.has(c);
    const speed = 900 * dt;
    let x = 0, y = 0;
    if (k('KeyW') || k('ArrowUp')) y += speed;
    if (k('KeyS') || k('ArrowDown')) y -= speed;
    if (k('KeyA') || k('ArrowLeft')) x += speed;
    if (k('KeyD') || k('ArrowRight')) x -= speed;
    if (x || y) this.view.panPixels(x, y, this.el.clientHeight);
    if (k('Equal') || k('NumpadAdd')) this.view.zoomBy(Math.exp(-dt * 1.5));
    if (k('Minus') || k('NumpadSubtract')) this.view.zoomBy(Math.exp(dt * 1.5));
  }

  private spread() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  private angle() {
    const [a, b] = [...this.pointers.values()];
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  private ndc(x: number, y: number) {
    const r = this.el.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }
}
