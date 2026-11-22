import { THEME, THEMES, switchTheme, type ThemeId } from '../engine/theme.ts';

// A row of theme swatches. Each swatch is a tiny painting of the theme: sky, a building and its
// roof, and a window, so the choice is visible before the page reloads with it.

const BLURB: Record<ThemeId, string> = {
  neon: 'Dystopian dusk, glowing signs',
  daylight: 'Pastel anime afternoon',
  golden: 'Sunset, long shadows',
  moonlit: 'Calm night, ink lines',
};

export function themePickerHtml(): string {
  return `<div class="themes" role="radiogroup" aria-label="Look">${Object.values(THEMES)
    .map((t) => {
      const [top, horizon] = t.sky;
      const style = [
        `--sky:linear-gradient(${top}, ${horizon})`,
        `--wall:${t.walls[0]}`,
        `--wall2:${t.walls[2] ?? t.walls[1]}`,
        `--roof:${t.roofs[0]}`,
        `--ground:${t.ground}`,
        `--win:${t.windows.glow > 0 ? t.windows.warm : t.windows.cool}`,
        `--ink:${t.outlines?.color ?? 'transparent'}`,
      ].join(';');
      const on = t.id === THEME.id;
      return `<button type="button" class="theme ${on ? 'on' : ''}" data-theme-id="${t.id}" role="radio" aria-checked="${on}" style="${style}">
        <span class="sw"><i class="b1"></i><i class="b2"></i></span>
        <span class="tname">${t.name}</span><span class="tblurb">${BLURB[t.id]}</span></button>`;
    })
    .join('')}</div>`;
}

/** Wire up a picker inside `el`. resumeGame: continue the current game after the reload. */
export function bindThemePicker(el: HTMLElement, resumeGame: () => boolean) {
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-theme-id]');
    if (!b) return;
    e.stopPropagation();
    const id = b.dataset.themeId as ThemeId;
    if (id === THEME.id) return;
    b.classList.add('loading');
    switchTheme(id, resumeGame());
  });
}
