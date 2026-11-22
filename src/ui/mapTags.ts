import * as THREE from 'three';

// Short-lived labels pinned to a spot on the map, e.g. the aftermath of a battle
// ("Captured!", losses). They follow the camera and fade out by themselves.

interface Tag {
  el: HTMLElement;
  pos: THREE.Vector3;
  until: number;
}

export class MapTags {
  private readonly layer: HTMLElement;
  private tags: Tag[] = [];
  private readonly v = new THREE.Vector3();

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'maptags';
    root.appendChild(this.layer);
  }

  show(x: number, z: number, html: string, color: string, ms = 2600, height = 40) {
    const el = document.createElement('div');
    el.className = 'maptag';
    el.style.setProperty('--c', color);
    el.innerHTML = html;
    this.layer.appendChild(el);
    this.tags.push({ el, pos: new THREE.Vector3(x, height, z), until: performance.now() + ms });
  }

  clear() {
    this.tags.forEach((t) => t.el.remove());
    this.tags = [];
  }

  update(camera: THREE.Camera, width: number, height: number) {
    const now = performance.now();
    this.tags = this.tags.filter((t) => {
      if (now > t.until) {
        t.el.remove();
        return false;
      }
      this.v.copy(t.pos).project(camera);
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      t.el.classList.toggle('leaving', t.until - now < 500);
      return true;
    });
  }
}
