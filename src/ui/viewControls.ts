import type { IsoCamera } from '../engine/isoCamera.ts';
import { bindThemePicker, themePickerHtml } from './themePicker.ts';

// On-screen map controls (rotate, zoom, reset), a compass that turns with the map, and a legend
// for the map's symbols. The legend starts open on wide screens and folds away on phones.

export class ViewControls {
  private readonly needle: HTMLElement;

  constructor(root: HTMLElement, view: IsoCamera, reset: () => void) {
    const box = document.createElement('div');
    box.className = 'viewctl';
    box.innerHTML = `
      <div class="legend">
        <button class="lg-toggle" data-v="legend" title="Map key">?</button>
        <div class="lg-body">
          <div><span class="lg mall"></span><b>Stronghold</b> (mall): pays <span class="inc">+N</span> members a turn, defends with 3 dice. Striped on the map.</div>
          <div><span class="lg street"></span><b>Street</b>: defends with 2 dice. Only place to hide an ambush.</div>
          <div><span class="dice att"><i></i><i></i><i></i></span> dice you attack with &nbsp; <span class="dice def"><i></i><i></i></span> dice defending</div>
          <div><span class="lg region"></span><b>Gold lines</b> mark regions. Hold every territory in one for its bonus. Tap a region's label to see who holds what.</div>
          <div><span class="cutmark">⊘</span> <b>Cut off</b>: no path through your turf to one of your strongholds. It can't be reinforced and attacks with 2 dice at most.</div>
        </div>
      </div>
      <div class="look">
        <div class="look-body"><div class="look-title">Look</div>${themePickerHtml()}</div>
      </div>
      <div class="btns">
        <button class="more" data-v="more" title="Map controls">⋯</button>
        <button class="lookbtn" data-v="look" title="Change the look">🎨</button>
        <button class="compass" data-v="north" title="Point north up"><span class="needle">N</span></button>
        <button data-v="left" title="Turn map (Q)">⟲</button>
        <button data-v="right" title="Turn map (E)">⟳</button>
        <button data-v="in" title="Zoom in">+</button>
        <button data-v="out" title="Zoom out">−</button>
        <button data-v="reset" title="Whole map">⤢</button>
      </div>`;
    root.appendChild(box);
    this.needle = box.querySelector('.needle')!;
    bindThemePicker(box.querySelector('.look')!, () => true);
    // Phones: only the "⋯" button shows; it opens the rest for a few seconds.
    let hide = 0;
    const keepOpen = () => {
      clearTimeout(hide);
      hide = window.setTimeout(() => {
        // Stay open while the player is choosing a look.
        if (box.querySelector('.look.open')) return keepOpen();
        box.classList.remove('open');
      }, 5000);
    };
    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (box.classList.contains('open')) keepOpen();
      switch (b.dataset.v) {
        case 'more':
          box.classList.toggle('open');
          if (box.classList.contains('open')) keepOpen();
          break;
        case 'left': view.rotate(-1); break;
        case 'right': view.rotate(1); break;
        case 'in': view.zoomBy(0.7); break;
        case 'out': view.zoomBy(1.4); break;
        case 'north': view.faceNorth(); break;
        case 'reset': reset(); break;
        case 'look': box.querySelector('.look')!.classList.toggle('open'); break;
        case 'legend': box.querySelector('.legend')!.classList.toggle('open'); break;
      }
    });
  }

  /** Keep the compass pointing at real north as the map turns. */
  update(heading: number) {
    this.needle.style.transform = `rotate(${(heading * 180) / Math.PI}deg)`;
  }
}
