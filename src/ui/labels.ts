import * as THREE from 'three';
import { GANGS, TERRITORIES } from '../game/data.ts';
import type { GameState } from '../game/rules.ts';
import { anchors } from '../world/territoryMap.ts';

// A floating badge over every territory: member count in the owner's colour, plus the name
// when zoomed in. Badges are buttons, so tapping one selects the territory (easy on phones).

export class Labels {
  private readonly els: HTMLButtonElement[] = [];
  private readonly pos: THREE.Vector3[];
  private readonly v = new THREE.Vector3();
  private shown = '';

  constructor(root: HTMLElement, heights: number[], onTap: (t: number) => void) {
    const layer = document.createElement('div');
    layer.className = 'labels';
    root.appendChild(layer);
    this.pos = anchors.map(([x, z], i) => new THREE.Vector3(x, (heights[i] || 0) + 6, z));
    TERRITORIES.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = `tl ${t.kind}`;
      b.innerHTML = `<span class="n"></span><span class="nm">${t.name}</span>`;
      b.title = `${t.name} (${t.real})`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onTap(i);
      });
      layer.appendChild(b);
      this.els.push(b);
    });
  }

  /** Refresh counts and colours from the game state. */
  sync(s: GameState, viewer: string | null, selected: number | null, targets: number[]) {
    const key = JSON.stringify([s.owner, s.members, s.ambush, selected, targets]);
    if (key === this.shown) return;
    this.shown = key;
    this.els.forEach((el, i) => {
      const g = GANGS[s.owner[i]];
      el.style.setProperty('--c', g.color);
      (el.firstChild as HTMLElement).textContent = String(s.members[i]);
      el.classList.toggle('ambush', s.ambush[i] !== null && s.ambush[i] === viewer);
      el.classList.toggle('sel', i === selected);
      el.classList.toggle('target', targets.includes(i));
    });
  }

  /** Move badges to follow the camera. */
  update(camera: THREE.Camera, width: number, height: number, showNames: boolean) {
    this.els.forEach((el, i) => {
      this.v.copy(this.pos[i]).project(camera);
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      const off = x < -60 || y < -40 || x > width + 60 || y > height + 40;
      el.style.display = off ? 'none' : '';
      if (!off) el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      el.classList.toggle('named', showNames);
    });
  }
}
