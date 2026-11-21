import { DISTRICTS, GANGS, districtIndexAt } from '../world/districts.ts';
import { worldRect } from '../world/geo.ts';
import type { MapData } from '../world/mapData.ts';

// On-screen overlay: the turf you're standing in, who holds it, and a minimap.

export class Hud {
  private readonly districtEl: HTMLElement;
  private readonly minimap: HTMLCanvasElement;
  private readonly base: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private lastDistrict = -1;
  private readonly rect = worldRect();
  private readonly scale: number;

  constructor(root: HTMLElement, map: MapData) {
    this.districtEl = el(root, 'div', 'turf');
    const wrap = el(root, 'div', 'minimap');
    this.minimap = document.createElement('canvas');
    wrap.appendChild(this.minimap);
    const help = el(root, 'div', 'help');
    help.innerHTML = matchMedia('(pointer: coarse)').matches
      ? 'Drag left side to move · pinch to zoom'
      : '<b>WASD</b> move · <b>Shift</b> sprint · <b>Q/E</b> turn view · <b>wheel</b> zoom';
    el(root, 'div', 'credit').textContent = map.attribution;

    const w = this.rect.maxX - this.rect.minX;
    const h = this.rect.maxZ - this.rect.minZ;
    const size = innerWidth < 600 ? 130 : 190;
    this.scale = size / Math.max(w, h);
    const cw = Math.round(w * this.scale), ch = Math.round(h * this.scale);
    const dpr = Math.min(2, devicePixelRatio);
    for (const c of [this.minimap]) {
      c.width = cw * dpr;
      c.height = ch * dpr;
      c.style.width = `${cw}px`;
      c.style.height = `${ch}px`;
    }
    this.ctx = this.minimap.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.base = document.createElement('canvas');
    this.base.width = cw * dpr;
    this.base.height = ch * dpr;
    this.drawBase(map, cw, ch, dpr);
  }

  private toMap(x: number, z: number): [number, number] {
    return [(x - this.rect.minX) * this.scale, (z - this.rect.minZ) * this.scale];
  }

  private drawBase(map: MapData, cw: number, ch: number, dpr: number) {
    const g = this.base.getContext('2d')!;
    g.scale(dpr, dpr);
    // Turf colours: sample the district split on a coarse grid.
    const step = 3;
    for (let py = 0; py < ch; py += step) {
      for (let px = 0; px < cw; px += step) {
        const x = this.rect.minX + px / this.scale, z = this.rect.minZ + py / this.scale;
        g.fillStyle = GANGS[DISTRICTS[districtIndexAt(x, z)].owner].color;
        g.globalAlpha = 0.28;
        g.fillRect(px, py, step, step);
      }
    }
    g.globalAlpha = 1;
    const poly = (p: number[], fill: string) => {
      g.beginPath();
      for (let i = 0; i < p.length; i += 2) {
        const [x, y] = this.toMap(p[i], p[i + 1]);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    };
    map.parks.forEach((p) => poly(p, '#2c5a3c'));
    map.water.forEach((p) => poly(p, '#1f7fa8'));
    g.lineCap = 'round';
    for (const r of map.roads) {
      if (r.k === 'foot' || r.k === 'service' || r.k === 'pedestrian') continue;
      g.strokeStyle = r.k === 'minor' ? 'rgba(220,215,235,0.35)' : 'rgba(240,235,255,0.75)';
      g.lineWidth = r.k === 'minor' ? 0.6 : 1.2;
      g.beginPath();
      for (let i = 0; i < r.p.length; i += 2) {
        const [x, y] = this.toMap(r.p[i], r.p[i + 1]);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }

  update(x: number, z: number, heading: number) {
    const i = districtIndexAt(x, z);
    if (i !== this.lastDistrict) {
      this.lastDistrict = i;
      const d = DISTRICTS[i];
      const gang = GANGS[d.owner];
      this.districtEl.innerHTML =
        `<div class="name">${d.gameName}</div><div class="real">${d.name}</div>` +
        `<div class="owner" style="--gang:${gang.color}"><span></span>${gang.name}</div>`;
      this.districtEl.classList.remove('flash');
      void this.districtEl.offsetWidth;
      this.districtEl.classList.add('flash');
    }
    const c = this.ctx;
    const w = this.minimap.clientWidth, h = this.minimap.clientHeight;
    c.clearRect(0, 0, w, h);
    c.drawImage(this.base, 0, 0, w, h);
    const [px, py] = this.toMap(x, z);
    // View direction marker: the camera looks along -heading.
    c.save();
    c.translate(px, py);
    c.rotate(-heading);
    c.fillStyle = '#c6e03a';
    c.beginPath();
    c.moveTo(0, -6);
    c.lineTo(4, 4);
    c.lineTo(-4, 4);
    c.closePath();
    c.fill();
    c.restore();
  }
}

function el(root: HTMLElement, tag: string, cls: string) {
  const e = document.createElement(tag);
  e.className = cls;
  root.appendChild(e);
  return e;
}
