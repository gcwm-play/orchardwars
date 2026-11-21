import { GANGS, MALLS_TO_WIN, PLAYER_GANGS, REGIONS, TERRITORIES, type GangId, type PlayerGang } from '../game/data.ts';
import {
  AMBUSH_COST, AMBUSH_STRIKE, MAX_AMBUSHES, canAmbush, canAttack, canMove, connected, mallsHeld, recruitsFor, territoriesOf,
  type Battle, type GameEvent, type GameState, type Recruits,
} from '../game/rules.ts';
import { aiAction } from '../game/ai.ts';
import { attackDice, blitzOdds, defenceDice } from '../game/odds.ts';
import type { Session } from '../game/session.ts';
import { BattleView } from './battleView.ts';

// Everything on screen around the map: scoreboard, the action panel for each phase,
// the battle pop-up, the event feed, and running the computer gangs' turns.

export interface UiHooks {
  /** Highlight territories on the map. */
  highlight(selected: number | null, targets: number[]): void;
  /** Flash a territory (capture, battle). */
  pulse(t: number, strength?: number): void;
  /** Recolour the city after ownership changes. */
  owners(owners: GangId[]): void;
  /** Glide the camera to a territory. */
  focus(t: number): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const chip = (g: GangId) => `<span class="chip" style="--c:${GANGS[g].color}"></span>`;
/** Display names, including the player's own team name (set when the UI starts). */
let NAMES: Partial<Record<GangId, string>> = {};
const nm = (g: GangId) => NAMES[g] ?? GANGS[g].name;
const gname = (g: GangId) => `<b style="color:${GANGS[g].color}">${esc(nm(g))}</b>`;
const tname = (t: number) => `<b>${esc(TERRITORIES[t].name)}</b>`;
/** Little dice squares: red when attacking, white when defending. */
const diceChip = (n: number, kind: 'att' | 'def') =>
  n > 0 ? `<span class="dice ${kind}" title="${kind === 'att' ? 'Attacks' : 'Defends'} with ${n} ${n === 1 ? 'die' : 'dice'}">${'<i></i>'.repeat(n)}</span>` : '';
const isMallT = (t: number) => TERRITORIES[t].kind === 'mall';

export class GameUi {
  selected: number | null = null;
  target: number | null = null;
  private amount = 1;
  private ambushMode = false;
  private moveAmount = 0;
  private aiTimer = 0;
  private fast = false;
  private readonly score: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly battleEl: HTMLElement;
  private readonly info: HTMLElement;
  private battleTimer = 0;
  private readonly battleView: BattleView;

  constructor(private readonly root: HTMLElement, private readonly session: Session, private readonly hooks: UiHooks) {
    this.score = this.el('div', 'score');
    this.feed = this.el('div', 'feed');
    this.info = this.el('div', 'info');
    this.panel = this.el('div', 'panel');
    this.battleEl = this.el('div', 'battle');
    this.battleView = new BattleView(this.battleEl);
    NAMES = session.state.names ?? {};
    session.onEvents((events) => this.onEvents(events));
    this.panel.addEventListener('click', (e) => this.onPanelClick(e));
    this.panel.addEventListener('input', (e) => this.onPanelInput(e));
  }

  get state(): GameState {
    return this.session.state;
  }

  /** Call once after construction (and after loading a saved game). */
  begin(startEvents: GameEvent[] = []) {
    this.hooks.owners(this.state.owner);
    if (startEvents.length) this.onEvents(startEvents);
    else this.refresh();
    this.scheduleAi();
  }

  // --- Player input ------------------------------------------------------------------

  tap(t: number) {
    const s = this.state;
    if (this.session.isHumanTurn) this.battleEl.classList.remove('show');
    if (t < 0) return this.clearSelection();
    this.showInfo(t);
    if (!this.session.isHumanTurn || s.occupy) return this.refresh();
    const me = s.human!;

    if (s.phase === 'recruit') {
      if (this.ambushMode) {
        if (canAmbush(s, t)) this.session.act({ type: 'ambush', t });
        this.ambushMode = false;
      } else if (s.owner[t] === me && s.reserves > 0) {
        this.session.act({ type: 'place', t, n: this.amount === 0 ? s.reserves : this.amount });
      }
      return this.refresh();
    }

    if (s.phase === 'attack') {
      if (s.owner[t] === me) {
        this.selected = s.members[t] >= 2 ? t : null;
        this.target = null;
      } else if (this.selected !== null && canAttack(s, this.selected, t)) {
        this.target = t;
      } else {
        this.target = null;
      }
      return this.refresh();
    }

    if (s.phase === 'move') {
      if (this.selected !== null && t !== this.selected && canMove(s, this.selected, t)) {
        this.target = t;
        this.moveAmount = s.members[this.selected] - 1;
      } else if (s.owner[t] === me && s.members[t] >= 2 && !s.moved) {
        this.selected = t;
        this.target = null;
      } else {
        this.selected = null;
        this.target = null;
      }
      this.refresh();
    }
  }

  hover(_t: number | null) {
    /* the map shows hover itself; kept for future tooltips */
  }

  private clearSelection() {
    this.selected = null;
    this.target = null;
    this.ambushMode = false;
    this.info.classList.remove('show');
    this.infoT = null;
    this.refresh();
  }

  private onPanelClick(e: Event) {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    this.battleEl.classList.remove('show');
    const s = this.state;
    const act = btn.dataset.act;
    try {
      switch (act) {
        case 'amount': this.amount = Number(btn.dataset.n); break;
        case 'ambush': this.ambushMode = !this.ambushMode; break;
        case 'endRecruit': this.session.act({ type: 'endRecruit' }); break;
        case 'roll':
        case 'blitz':
          if (this.selected !== null && this.target !== null) {
            this.session.act({ type: 'attack', from: this.selected, to: this.target, blitz: act === 'blitz' });
            if (s.owner[this.target] === s.human) this.target = null;
            if (this.selected !== null && s.members[this.selected] < 2) { this.selected = null; this.target = null; }
          }
          break;
        case 'occupy':
          this.session.act({ type: 'occupy', n: this.moveAmount });
          this.selected = null;
          this.target = null;
          break;
        case 'endAttack':
          this.session.act({ type: 'endAttack' });
          this.selected = null;
          this.target = null;
          break;
        case 'move':
          if (this.selected !== null && this.target !== null) {
            this.session.act({ type: 'move', from: this.selected, to: this.target, n: this.moveAmount });
          }
          this.selected = null;
          this.target = null;
          break;
        case 'cancel': this.selected = null; this.target = null; break;
        case 'endTurn':
          this.selected = null;
          this.target = null;
          this.session.act({ type: 'endTurn' });
          break;
        case 'fast': this.fast = !this.fast; break;
        case 'menu': location.reload(); break;
      }
    } catch (err) {
      this.toast((err as Error).message);
    }
    this.refresh();
    this.scheduleAi();
  }

  private onPanelInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.name === 'amount') {
      this.moveAmount = Number(input.value);
      const out = this.panel.querySelector('output');
      if (out) out.textContent = input.value;
    }
  }

  // --- Computer turns ----------------------------------------------------------------

  private scheduleAi() {
    clearTimeout(this.aiTimer);
    const s = this.state;
    if (s.phase === 'over' || this.session.isHumanTurn) return;
    const delay = this.fast ? 90 : s.phase === 'attack' ? 1500 : 380;
    this.aiTimer = window.setTimeout(() => {
      const action = aiAction(this.state);
      if (action.type === 'attack') this.hooks.focus(action.to);
      this.session.act(action);
      this.refresh();
      this.scheduleAi();
    }, delay);
  }

  // --- Reacting to the game ---------------------------------------------------------

  private onEvents(events: GameEvent[]) {
    const s = this.state;
    let owners = false;
    for (const e of events) {
      switch (e.type) {
        case 'turn':
          if (e.gang === s.human) this.turnRecruits = e.recruits;
          this.log(`${chip(e.gang)} ${gname(e.gang)} recruits ${e.recruits.total}.`);
          if (e.gang === s.human) this.toast(`Your turn: ${e.recruits.total} new members to place.`, recruitBreakdown(e.recruits));
          break;
        case 'ambushSet':
          if (e.gang === s.human) this.log(`You hid an ambush in ${tname(e.t)}.`);
          break;
        case 'battle':
          this.showBattle(e);
          this.hooks.pulse(e.to, 0.6);
          if (e.ambushLoss) this.log(`⚡ Ambush in ${tname(e.to)}! ${gname(e.gang)} lost ${e.ambushLoss}.`);
          break;
        case 'captured':
          owners = true;
          this.hooks.pulse(e.t, 1);
          this.log(`${chip(e.gang)} ${gname(e.gang)} took ${tname(e.t)} from ${gname(e.from)}.`);
          if (e.gang === s.human) {
            const o = s.occupy;
            if (o) this.moveAmount = o.max;
          }
          break;
        case 'eliminated':
          this.log(`☠ ${gname(e.gang)} has been wiped out by ${gname(e.by)}.`);
          break;
        case 'moved':
          if (e.gang === s.human) this.log(`Moved ${e.n} from ${tname(e.from)} to ${tname(e.to)}.`);
          break;
        case 'win':
          this.showWin(e.gang, e.reason);
          break;
      }
    }
    if (owners) this.hooks.owners(s.owner);
    if (this.infoT !== null) this.showInfo(this.infoT);
    this.refresh();
  }

  // --- Drawing ----------------------------------------------------------------------

  refresh() {
    const s = this.state;
    const me = s.human;
    // Valid targets for the current selection.
    let targets: number[] = [];
    if (this.session.isHumanTurn && this.selected !== null) {
      if (s.phase === 'attack') targets = s.adjacency[this.selected].filter((j) => canAttack(s, this.selected!, j));
      if (s.phase === 'move') targets = [...connected(s, this.selected)];
    }
    if (this.session.isHumanTurn && s.phase === 'recruit' && this.ambushMode) {
      targets = territoriesOf(s, me!).filter((t) => canAmbush(s, t));
    }
    this.hooks.highlight(this.selected, this.target !== null ? [this.target] : targets);
    this.currentTargets = this.target !== null ? [this.target] : targets;

    // Scoreboard.
    const scoreHtml =
      `<div class="round">Round ${s.round} · first to ${MALLS_TO_WIN} ◆</div>` +
      `<div class="g head"><span class="chip" style="--c:transparent"></span><span class="gn"></span><span class="st">◆</span><span class="st">▦</span><span class="st inc">/turn</span></div>` +
      PLAYER_GANGS.map((g) => {
        const alive = s.order.includes(g);
        const terr = territoriesOf(s, g).length;
        const malls = mallsHeld(s, g);
        const r = recruitsFor(s, g);
        const income = alive ? r.total - r.firstTurn : 0;
        const cls = ['g', g === s.current ? 'now' : '', alive ? '' : 'dead', g === me ? 'me' : ''].join(' ');
        return `<div class="${cls}" style="--c:${GANGS[g].color}">${chip(g)}<span class="gn">${esc(nm(g))}${g === me ? ' (you)' : ''}</span>
          <span class="st" title="Strongholds held">◆ ${malls}</span><span class="st" title="Territories held">▦ ${terr}</span>
          <span class="st inc" title="Members recruited per turn at current holdings">+${income}</span></div>`;
      }).join('');
    // Only touch the DOM when something changed, so buttons aren't swapped out mid-click.
    if (scoreHtml !== this.lastScore) this.score.innerHTML = this.lastScore = scoreHtml;
    const panelHtml = this.panelHtml();
    if (panelHtml !== this.lastPanel) this.panel.innerHTML = this.lastPanel = panelHtml;
  }

  private lastScore = '';
  private lastPanel = '';

  /** Territories highlighted right now (also read by the labels). */
  currentTargets: number[] = [];

  private panelHtml(): string {
    const s = this.state;
    if (s.phase === 'over') return `<div class="row"><button data-act="menu" class="primary">New game</button></div>`;
    if (!this.session.isHumanTurn) {
      return `<div class="phase">${chip(s.current)} ${gname(s.current)} is making moves…</div>
        <div class="row"><button data-act="fast" class="${this.fast ? 'on' : ''}">${this.fast ? 'Fast ✓' : 'Fast forward'}</button></div>`;
    }
    const steps = (['recruit', 'attack', 'move'] as const)
      .map((p) => `<span class="${p === s.phase ? 'on' : ''}">${p === 'recruit' ? '1 Recruit' : p === 'attack' ? '2 Attack' : '3 Move'}</span>`)
      .join('');
    const head = `<div class="steps">${steps}</div>`;

    if (s.occupy) {
      const o = s.occupy;
      if (this.moveAmount < o.min || this.moveAmount > o.max) this.moveAmount = o.max;
      return `${head}<div class="phase">You took ${tname(o.to)}! How many move in from ${tname(o.from)}?</div>
        ${this.slider(o.min, o.max)}<div class="row"><button data-act="occupy" class="primary">Move in</button></div>`;
    }

    if (s.phase === 'recruit') {
      const mine = s.ambush.filter((a) => a === s.human).length;
      const amb = this.ambushMode
        ? `<div class="hint">Tap one of your <b>street</b> turfs to hide an ambush there (costs ${AMBUSH_COST}). Rivals who attack it lose ${AMBUSH_STRIKE} members before the fight.</div>`
        : '';
      return `${head}<div class="phase"><b class="big">${s.reserves}</b> members to place. Tap your turf.</div>${this.breakdownHtml()}${amb}
        <div class="row">
          ${[1, 3, 0].map((n) => `<button data-act="amount" data-n="${n}" class="${this.amount === n ? 'on' : ''}">${n === 0 ? 'All' : `+${n}`}</button>`).join('')}
          <button data-act="ambush" class="${this.ambushMode ? 'on' : ''}" ${s.reserves < AMBUSH_COST || mine >= MAX_AMBUSHES ? 'disabled' : ''}>Ambush (${AMBUSH_COST})</button>
          <button data-act="endRecruit" class="primary" ${s.reserves > 0 ? 'disabled' : ''}>Done</button>
        </div>`;
    }

    if (s.phase === 'attack') {
      let body = `<div class="phase">Tap one of your turfs with 2+ members, then a red neighbour to attack.</div>`;
      if (this.selected !== null && this.target === null) {
        body = `<div class="phase">Attacking from ${tname(this.selected)} (${s.members[this.selected]}). Pick a red target.</div>`;
      }
      if (this.selected !== null && this.target !== null) {
        const t = this.target;
        const mall = TERRITORIES[t].kind === 'mall';
        const from = this.selected;
        const odds = this.odds(s.members[from], s.members[t], mall);
        const tone = odds >= 0.7 ? 'good' : odds >= 0.4 ? 'even' : 'bad';
        body = `<div class="phase">${tname(from)} <b>${s.members[from]}</b> ⟶ ${tname(t)} <b>${s.members[t]}</b></div>
          <div class="matchup">
            <span>You roll ${diceChip(attackDice(s.members[from]), 'att')} ${attackDice(s.members[from])}</span>
            <span>vs ${diceChip(defenceDice(s.members[t], mall), 'def')} ${defenceDice(s.members[t], mall)} ${mall ? '<em>stronghold +1 die</em>' : ''}</span>
            <span class="odds ${tone}" title="Chance a Blitz takes it">Blitz win ${Math.round(odds * 100)}%</span>
          </div>
          ${mall ? '' : '<div class="hint">Street turf: there may be a hidden ambush (−' + AMBUSH_STRIKE + ' attackers).</div>'}
          <div class="row"><button data-act="roll" class="primary">Attack</button><button data-act="blitz">Blitz</button><button data-act="cancel">Cancel</button></div>`;
      }
      return `${head}${body}<div class="row"><button data-act="endAttack">Done attacking</button></div>`;
    }

    // Move phase.
    if (s.moved) {
      return `${head}<div class="phase">Move done.</div><div class="row"><button data-act="endTurn" class="primary">End turn</button></div>`;
    }
    if (this.selected !== null && this.target !== null) {
      const max = s.members[this.selected] - 1;
      return `${head}<div class="phase">Move from ${tname(this.selected)} to ${tname(this.target)}</div>
        ${this.slider(1, max)}<div class="row"><button data-act="move" class="primary">Move</button><button data-act="cancel">Cancel</button></div>`;
    }
    return `${head}<div class="phase">${this.selected === null ? 'Optional: tap a turf to move members from, through your own territory.' : `Moving from ${tname(this.selected)}: pick a highlighted turf.`}</div>
      <div class="row"><button data-act="endTurn" class="primary">End turn</button></div>`;
  }

  /** This turn's recruits, itemised. */
  private turnRecruits: Recruits | null = null;

  private breakdownHtml(): string {
    const r = this.turnRecruits ?? recruitsFor(this.state, this.state.human!);
    const items = [`<span class="bd">${r.base} base</span>`];
    for (const m of r.malls) items.push(`<span class="bd mall">◆ ${esc(TERRITORIES[m.t].name)} +${m.n}</span>`);
    for (const g of r.regions) items.push(`<span class="bd region">${esc(REGIONS.find((x) => x.id === g.region)!.name)} region +${g.n}</span>`);
    if (r.firstTurn) items.push(`<span class="bd">opening +${r.firstTurn}</span>`);
    return `<div class="breakdown">${items.join('')}</div>`;
  }

  private oddsCache = new Map<string, number>();
  private odds(att: number, def: number, mall: boolean) {
    const key = `${att}/${def}/${mall}`;
    if (!this.oddsCache.has(key)) this.oddsCache.set(key, blitzOdds(att, def, mall));
    return this.oddsCache.get(key)!;
  }

  /**
   * Extra info on each map badge: income on strongholds, and dice counts that matter right now
   * (your attack dice on your turn, defence dice on targets and on your threatened borders).
   */
  badgeChips(): string[] {
    const s = this.state;
    const me = s.human;
    const myTurn = this.session.isHumanTurn;
    const attacking = myTurn && s.phase === 'attack' && !s.occupy;
    return TERRITORIES.map((def, t) => {
      let html = '';
      if (def.kind === 'mall') html += `<span class="inc" title="Pays its holder +${def.income} members per turn">+${def.income}</span>`;
      if (!me || s.phase === 'over') return html;
      const mine = s.owner[t] === me;
      const border = mine && s.adjacency[t].some((j) => s.owner[j] !== me);
      if (attacking) {
        if (mine && border && s.members[t] >= 2 && (this.selected === null || this.selected === t)) html += diceChip(attackDice(s.members[t]), 'att');
        if (this.currentTargets.includes(t)) html += diceChip(defenceDice(s.members[t], isMallT(t)), 'def');
      } else if (border) {
        html += diceChip(defenceDice(s.members[t], isMallT(t)), 'def');
      }
      return html;
    });
  }

  private slider(min: number, max: number) {
    const v = Math.min(max, Math.max(min, this.moveAmount || max));
    this.moveAmount = v;
    return `<div class="slider"><input type="range" name="amount" min="${min}" max="${max}" value="${v}" ${min === max ? 'disabled' : ''}/><output>${v}</output></div>`;
  }

  private infoT: number | null = null;

  private showInfo(t: number) {
    this.infoT = t;
    const s = this.state;
    const d = TERRITORIES[t];
    const region = REGIONS.find((r) => r.id === d.region)!;
    const owner = s.owner[t];
    const kind = d.kind === 'mall'
      ? `<span class="tag">Stronghold · +${d.income} members/turn · defends with 3 dice</span>`
      : `<span class="tag">Street · ambush ground</span>`;
    const ambush = s.ambush[t] && s.ambush[t] === s.human ? `<span class="tag warn">Your ambush is hidden here</span>` : '';
    this.info.innerHTML = `<div class="tn">${esc(d.name)}</div><div class="real">${esc(d.real)}</div>
      <div class="real">${esc(region.name)} region: +${region.bonus}/turn if you hold all of it</div>
      <div>${chip(owner)} ${gname(owner)} · <b>${s.members[t]}</b> members</div>${kind}${ambush}`;
    this.info.classList.add('show');
  }

  private showBattle(b: Battle) {
    clearTimeout(this.battleTimer);
    const mine = b.gang === this.state.human;
    const pace = mine ? 'full' : this.fast ? 'instant' : 'last';
    const side = (g: GangId) => ({ name: nm(g), color: GANGS[g].color });
    this.battleView.play(b, side(b.gang), side(b.defender), pace, () => {
      // Your own battles stay up until your next action; computer battles fade on a timer.
      if (mine) return;
      this.battleTimer = window.setTimeout(() => this.battleEl.classList.remove('show'), this.fast ? 500 : 1800);
    });
  }

  private showWin(g: PlayerGang, reason: 'malls' | 'last') {
    const s = this.state;
    const you = g === s.human;
    const div = this.el('div', 'win');
    div.innerHTML = `<div class="card"><div class="big" style="color:${GANGS[g].color}">${you ? 'The city is yours' : `${esc(nm(g))} rules the city`}</div>
      <p>${reason === 'malls' ? `${esc(nm(g))} held ${MALLS_TO_WIN} strongholds.` : `${esc(nm(g))} is the last gang standing.`} Round ${s.round}.</p>
      <button class="primary" onclick="location.reload()">Play again</button></div>`;
  }

  private log(html: string) {
    const row = document.createElement('div');
    row.innerHTML = html;
    this.feed.prepend(row);
    while (this.feed.children.length > 6) this.feed.lastChild!.remove();
  }

  private toast(text: string, detail = '') {
    const t = this.el('div', 'toast');
    t.innerHTML = `<div>${esc(text)}</div>${detail ? `<div class="detail">${detail}</div>` : ''}`;
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  private el(tag: string, cls: string) {
    const e = document.createElement(tag);
    e.className = cls;
    this.root.appendChild(e);
    return e;
  }
}

function recruitBreakdown(r: Recruits): string {
  const parts = [`${r.base} base`];
  if (r.firstTurn) parts.push(`${r.firstTurn} opening bonus`);
  const mall = r.malls.reduce((a, m) => a + m.n, 0);
  if (mall) parts.push(`${mall} from strongholds`);
  for (const g of r.regions) parts.push(`${g.n} for ${REGIONS.find((x) => x.id === g.region)!.name}`);
  return esc(parts.join(' + '));
}
