import * as THREE from 'three';
import { GANGS, TERRITORIES } from '../game/data.ts';
import type { GameState } from '../game/rules.ts';
import { anchors } from '../world/territoryMap.ts';
import type { MapData } from '../world/mapData.ts';

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
      b.innerHTML = `<span class="n"></span><span class="chips"></span><span class="nm">${t.name}</span>`;
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
  sync(s: GameState, viewer: string | null, selected: number | null, targets: number[], chips: string[]) {
    const key = JSON.stringify([s.owner, s.members, s.ambush, selected, targets, chips]);
    if (key === this.shown) return;
    this.shown = key;
    this.els.forEach((el, i) => {
      const g = GANGS[s.owner[i]];
      el.style.setProperty('--c', g.color);
      (el.firstChild as HTMLElement).textContent = String(s.members[i]);
      (el.children[1] as HTMLElement).innerHTML = chips[i] ?? '';
      el.classList.toggle('ambush', s.ambush[i] !== null && s.ambush[i] === viewer);
      el.classList.toggle('sel', i === selected);
      el.classList.toggle('target', targets.includes(i));
    });
  }

  /** Move badges to follow the camera. showNames: every name; showMallNames: stronghold names only. */
  update(camera: THREE.Camera, width: number, height: number, showNames: boolean, showMallNames = showNames) {
    this.els.forEach((el, i) => {
      this.v.copy(this.pos[i]).project(camera);
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      const off = x < -60 || y < -40 || x > width + 60 || y > height + 40;
      el.style.display = off ? 'none' : '';
      if (!off) el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      el.classList.toggle('named', showNames || (showMallNames && TERRITORIES[i].kind === 'mall'));
    });
  }
}

/** Street names from the map data, placed mid-way along each street; shown when zoomed in. */
export class StreetNames {
  private readonly els: HTMLElement[] = [];
  private readonly pos: THREE.Vector3[] = [];
  private readonly v = new THREE.Vector3();
  private readonly layer: HTMLElement;

  constructor(root: HTMLElement, map: MapData, count = 45) {
    this.layer = document.createElement('div');
    this.layer.className = 'streets';
    root.appendChild(this.layer);
    // Total length per street name, and its longest single piece (where the label goes).
    const byName = new Map<string, { total: number; best: number[]; bestLen: number }>();
    const len = (p: number[]) => {
      let l = 0;
      for (let i = 0; i + 3 < p.length; i += 2) l += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
      return l;
    };
    for (const r of map.roads) {
      if (!r.n || r.k === 'foot' || r.k === 'service') continue;
      const l = len(r.p);
      const e = byName.get(r.n) ?? { total: 0, best: r.p, bestLen: 0 };
      e.total += l;
      if (l > e.bestLen) {
        e.best = r.p;
        e.bestLen = l;
      }
      byName.set(r.n, e);
    }
    const top = [...byName.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, count);
    for (const [name, e] of top) {
      // Walk half-way along the longest piece.
      let left = e.bestLen / 2, x = e.best[0], z = e.best[1];
      for (let i = 0; i + 3 < e.best.length; i += 2) {
        const seg = Math.hypot(e.best[i + 2] - e.best[i], e.best[i + 3] - e.best[i + 1]);
        if (seg >= left) {
          const k = left / (seg || 1);
          x = e.best[i] + (e.best[i + 2] - e.best[i]) * k;
          z = e.best[i + 1] + (e.best[i + 3] - e.best[i + 1]) * k;
          break;
        }
        left -= seg;
      }
      const el = document.createElement('span');
      el.textContent = name;
      this.layer.appendChild(el);
      this.els.push(el);
      this.pos.push(new THREE.Vector3(x, 1, z));
    }
  }

  update(camera: THREE.Camera, width: number, height: number, visible: boolean) {
    this.layer.style.display = visible ? '' : 'none';
    if (!visible) return;
    this.els.forEach((el, i) => {
      this.v.copy(this.pos[i]).project(camera);
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      const off = x < -100 || y < -20 || x > width + 100 || y > height + 20;
      el.style.display = off ? 'none' : '';
      if (!off) el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    });
  }
}
