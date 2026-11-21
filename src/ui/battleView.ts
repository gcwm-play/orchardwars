import { TERRITORIES } from '../game/data.ts';
import type { Battle } from '../game/rules.ts';

// The battle pop-up. Dice tumble, land, then line up highest-against-highest so it is clear why
// each side lost members: every matched pair costs its loser one member, and ties go to the
// defender. A blitz plays its rounds one after another with a running tally.

export interface Side {
  name: string;
  color: string;
}

// Which of the 3×3 pip cells are filled for each face.
const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};
const face = (v: number) => Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('');
const die = (v: number, color: string, cls = '') =>
  `<span class="pd ${cls}" style="--c:${color}" aria-label="${v}">${face(v)}</span>`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class BattleView {
  private timers: number[] = [];

  constructor(private readonly el: HTMLElement) {}

  stop() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  /**
   * Play a battle. `pace`: 'full' animates every round (your battles), 'last' only the final
   * round (computer battles), 'instant' skips the tumbling (fast forward). Calls onDone at the end.
   */
  play(b: Battle, att: Side, def: Side, pace: 'full' | 'last' | 'instant', onDone: () => void) {
    this.stop();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mall = TERRITORIES[b.to].kind === 'mall';
    const rounds = pace === 'full' ? b.rounds : b.rounds.slice(-1);
    const skipped = b.rounds.slice(0, b.rounds.length - rounds.length);
    // Losses from rounds we don't replay count straight away.
    let attLost = b.ambushLoss + skipped.reduce((a, r) => a + r.attLoss, 0);
    let defLost = skipped.reduce((a, r) => a + r.defLoss, 0);
    const tumble = pace === 'instant' || reduced ? 0 : rounds.length > 1 ? Math.max(220, Math.min(520, 2600 / rounds.length)) : 560;
    const settle = pace === 'instant' ? 0 : Math.max(380, Math.min(900, 3200 / rounds.length));

    this.el.innerHTML = `
      ${b.ambushLoss ? `<div class="ambush-hit">⚡ AMBUSH! ${esc(att.name)} walked into a trap: −${b.ambushLoss}</div>` : ''}
      <div class="b-head">
        <div class="b-side" style="--c:${att.color}"><b>${esc(att.name)}</b><span>attacking</span></div>
        <div class="b-mid">⚔</div>
        <div class="b-side right" style="--c:${def.color}"><b>${esc(def.name)}</b><span>${mall ? 'defending a stronghold' : 'defending'}</span></div>
      </div>
      <div class="b-round"></div>
      <div class="b-rule">Highest die vs highest, second vs second. Each pair's loser loses 1. Ties go to the defender.${mall ? ' Strongholds roll 3 and keep their best 2.' : ''}</div>
      <div class="b-tally">
        <span style="--c:${att.color}">${esc(att.name)} <b class="ta">−${attLost}</b></span>
        <span class="b-count"></span>
        <span style="--c:${def.color}">${esc(def.name)} <b class="td">−${defLost}</b></span>
      </div>
      <div class="b-end"></div>`;
    this.el.classList.add('show');
    const roundEl = this.el.querySelector<HTMLElement>('.b-round')!;
    const countEl = this.el.querySelector<HTMLElement>('.b-count')!;
    const ta = this.el.querySelector<HTMLElement>('.ta')!;
    const td = this.el.querySelector<HTMLElement>('.td')!;
    const endEl = this.el.querySelector<HTMLElement>('.b-end')!;

    let t = b.ambushLoss && pace !== 'instant' ? 700 : 0; // let the ambush banner land first
    rounds.forEach((r, k) => {
      const n = skipped.length + k + 1;
      // 1. Tumble: random faces flicker.
      this.at(t, () => {
        countEl.textContent = b.rounds.length > 1 ? `Round ${n} of ${b.rounds.length}` : '';
        roundEl.innerHTML = this.tumbleHtml(r.att.length, r.def.length, att.color, def.color);
        if (tumble > 0) {
          const dice = [...roundEl.querySelectorAll<HTMLElement>('.pd')];
          const spin = window.setInterval(() => dice.forEach((d) => (d.innerHTML = face(1 + Math.floor(Math.random() * 6)))), 70);
          this.timers.push(spin);
          this.at(tumble, () => clearInterval(spin));
        }
      });
      t += tumble;
      // 2. Land: show the real dice in matched pairs, then the results.
      this.at(t, () => {
        roundEl.innerHTML = this.resultHtml(r.att, r.def, att, def);
        attLost += r.attLoss;
        defLost += r.defLoss;
        ta.textContent = `−${attLost}`;
        td.textContent = `−${defLost}`;
        if (r.attLoss) ta.classList.remove('bump'), void ta.offsetWidth, ta.classList.add('bump');
        if (r.defLoss) td.classList.remove('bump'), void td.offsetWidth, td.classList.add('bump');
      });
      t += settle;
    });
    this.at(Math.max(0, t - settle * 0.4), () => {
      const where = `${esc(TERRITORIES[b.from].name)} ⟶ ${esc(TERRITORIES[b.to].name)}`;
      endEl.innerHTML = b.captured
        ? `<div class="taken">${esc(TERRITORIES[b.to].name)} captured!</div><div class="where">${where}</div>`
        : `<div class="where">${where}${b.rounds.length > 1 ? ` · attack stopped after ${b.rounds.length} rounds` : ''}</div>`;
      onDone();
    });
  }

  private at(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private tumbleHtml(na: number, nd: number, ca: string, cd: string) {
    let html = '';
    for (let i = 0; i < Math.max(na, nd); i++) {
      html += `<div class="pair rolling"><span class="res l"></span>
        <span class="slot">${i < na ? die(1, ca, 'spin') : ''}</span><span class="cmp"></span>
        <span class="slot">${i < nd ? die(1, cd, 'spin') : ''}</span><span class="res r"></span></div>`;
    }
    return html;
  }

  /** Dice in matched pairs; each pair's loss is written on the loser's side. */
  private resultHtml(attDice: number[], defDice: number[], att: Side, def: Side) {
    const pairs = Math.min(attDice.length, defDice.length, 2);
    let html = '';
    for (let i = 0; i < Math.max(attDice.length, defDice.length); i++) {
      const a = attDice[i], d = defDice[i];
      const delay = `style="animation-delay:${i * 120}ms"`;
      if (i < pairs) {
        const attWins = a > d;
        const tie = a === d ? ' <em>tie</em>' : '';
        html += `<div class="pair land" ${delay}>
          <span class="res l" style="--c:${att.color}">${attWins ? '' : `−1${tie}`}</span>
          <span class="slot">${die(a, att.color, attWins ? 'won' : 'lost')}</span>
          <span class="cmp">${attWins ? '&gt;' : a === d ? '=' : '&lt;'}</span>
          <span class="slot">${die(d, def.color, attWins ? 'lost' : 'won')}</span>
          <span class="res r" style="--c:${def.color}">${attWins ? '−1' : ''}</span></div>`;
      } else {
        html += `<div class="pair land spare" ${delay}>
          <span class="res l">${a !== undefined ? 'not compared' : ''}</span>
          <span class="slot">${a !== undefined ? die(a, att.color, 'unused') : ''}</span><span class="cmp"></span>
          <span class="slot">${d !== undefined ? die(d, def.color, 'unused') : ''}</span>
          <span class="res r">${d !== undefined ? 'not counted' : ''}</span></div>`;
      }
    }
    return html;
  }
}
