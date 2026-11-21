// Keyboard plus a touch joystick (left half of the screen) for phones.

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private wheel = 0;
  private pinch = { d: 0, factor: 1 };
  readonly stickEl: HTMLElement;

  constructor(root: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    root.addEventListener('wheel', (e) => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });

    this.stickEl = document.createElement('div');
    this.stickEl.className = 'stick';
    this.stickEl.innerHTML = '<div class="knob"></div>';
    root.appendChild(this.stickEl);

    root.addEventListener('touchstart', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < innerWidth / 2 && this.stick.id < 0) {
          this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
          this.stickEl.style.display = 'block';
          this.stickEl.style.left = `${t.clientX}px`;
          this.stickEl.style.top = `${t.clientY}px`;
        }
      }
      if (e.touches.length === 2) this.pinch.d = touchDistance(e.touches);
    }, { passive: true });
    root.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stick.id) {
          const dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
          const len = Math.hypot(dx, dy), max = 50;
          const k = len > max ? max / len : 1;
          this.stick.x = (dx * k) / max;
          this.stick.y = (dy * k) / max;
          (this.stickEl.firstChild as HTMLElement).style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        }
      }
      if (e.touches.length === 2 && this.pinch.d > 0) {
        const d = touchDistance(e.touches);
        this.pinch.factor *= this.pinch.d / d;
        this.pinch.d = d;
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stick.id) {
          this.stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
          this.stickEl.style.display = 'none';
          (this.stickEl.firstChild as HTMLElement).style.transform = '';
        }
      }
      if (e.touches.length < 2) this.pinch.d = 0;
    };
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', end);
  }

  down(code: string) {
    return this.keys.has(code);
  }

  /** True once per key press. Call endFrame() after reading. */
  tapped(code: string) {
    return this.pressed.has(code);
  }

  /** Movement in screen space: x right, y down, length up to 1. */
  move(): { x: number; y: number } {
    let x = this.stick.x, y = this.stick.y;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  /** Zoom factor requested since last frame (mouse wheel, pinch, +/- keys). */
  zoom(): number {
    let f = Math.exp(this.wheel * 0.0012) * this.pinch.factor;
    if (this.down('Equal') || this.down('NumpadAdd')) f *= 0.97;
    if (this.down('Minus') || this.down('NumpadSubtract')) f *= 1.03;
    this.wheel = 0;
    this.pinch.factor = 1;
    return f;
  }

  endFrame() {
    this.pressed.clear();
  }
}

function touchDistance(t: TouchList) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}
