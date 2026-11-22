import { GANGS, MALLS_TO_WIN, PLAYER_GANGS, REGIONS, TERRITORIES, type GangId, type PlayerGang } from '../game/data.ts';
import {
  AMBUSH_COST, AMBUSH_STRIKE, CUT_OFF_ATTACK_DICE, MAX_AMBUSHES, attackDiceFor, canAmbush, canAttack, canMove, connected, isCutOff,
  mallsHeld, recruitsFor, territoriesOf,
  type Battle, type GameEvent, type GameState, type Recruits,
} from '../game/rules.ts';
import { aiAction } from '../game/ai.ts';
import { attackDice, blitzOdds, defenceDice } from '../game/odds.ts';
import type { GameSession } from '../game/session.ts';
import { BattleView } from './battleView.ts';

// Everything on screen around the map: scoreboard, the action panel for each phase,
// the battle pop-up, the event feed, and running the computer gangs' turns.

export interface UiHooks {
  /** Highlight territories on the map. */
  highlight(selected: number | null, targets: number[], emphasis?: number[]): void;
  /** Flash a territory (capture, battle). */
  pulse(t: number, strength?: number): void;
  /** Recolour the city after ownership changes. */
  owners(owners: GangId[]): void;
  /** Camera and map effects that let the player follow the computer gangs. */
  director: {
    /** Glide the camera to fit these territories. */
    frame(territories: number[], close?: boolean): void;
    /** Draw an arrow between two territories. */
    arrow(from: number, to: number, gang: GangId, kind: 'attack' | 'move'): void;
    fadeArrows(): void;
    /** A short-lived label over a territory. */
    tag(t: number, html: string, color: string): void;
    /** Has the player moved the map themselves since this time (performance.now())? */
    userMovedSince(time: number): boolean;
  };
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
const fmtClock = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export class GameUi {
  selected: number | null = null;
  target: number | null = null;
  private amount = 1;
  private ambushMode = false;
  private moveAmount = 0;
  private aiTimer = 0;
  private fast = false;
  /** Fly the camera to the computer gangs' moves. */
  private follow = true;
  private readonly score: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly battleEl: HTMLElement;
  private readonly info: HTMLElement;
  private battleTimer = 0;
  private readonly battleView: BattleView;

  constructor(private readonly root: HTMLElement, private readonly session: GameSession, private readonly hooks: UiHooks) {
    this.score = this.el('div', 'score');
    this.feed = this.el('div', 'feed');
    this.info = this.el('div', 'info');
    this.panel = this.el('div', 'panel');
    this.battleEl = this.el('div', 'battle');
    this.battleEl.addEventListener('click', () => this.battleEl.classList.remove('show'));
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
    this.regionShown = null;
    this.showInfo(t);
    if (!this.session.isHumanTurn || s.occupy) return this.refresh();
    const me = s.human!;

    if (s.phase === 'recruit') {
      if (s.owner[t] === me && isCutOff(s, t)) {
        this.toast('Cut off: no supply line', 'This turf has no path through your territory to one of your strongholds, so it can’t be reinforced.');
        this.ambushMode = false;
      } else if (this.ambushMode) {
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

  /** Show a region: its territories lit up on the map and its details in the info card. */
  showRegion(ri: number) {
    const s = this.state;
    const r = REGIONS[ri];
    this.regionShown = ri;
    const ts = TERRITORIES.map((t, i) => (t.region === r.id ? i : -1)).filter((i) => i >= 0);
    const mine = s.human ? ts.filter((t) => s.owner[t] === s.human).length : 0;
    const rows = ts
      .map((t) => `<div class="rrow">${chip(s.owner[t])} ${TERRITORIES[t].kind === 'mall' ? '◆ ' : ''}${esc(TERRITORIES[t].name)} <span class="muted">${esc(nm(s.owner[t]))} · ${s.members[t]}</span></div>`)
      .join('');
    this.infoT = null;
    this.info.innerHTML = `<div class="tn">${esc(r.name)} region</div>
      <div class="real">Hold all ${ts.length} territories for <b class="gold">+${r.bonus}</b> members every turn.
      ${s.human ? (mine === ts.length ? '<b>You hold it all.</b>' : `You hold ${mine} of ${ts.length}.`) : ''}</div>${rows}`;
    this.info.classList.add('show');
    clearTimeout(this.infoTimer);
    if (innerWidth < 640) this.infoTimer = window.setTimeout(() => this.info.classList.remove('show'), 5000);
    this.refresh();
  }

  /** The region being inspected (its territories are lifted on the map). */
  private regionShown: number | null = null;

  private clearSelection() {
    this.regionShown = null;
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
        case 'undo':
          this.session.undo();
          this.selected = null;
          this.target = null;
          this.ambushMode = false;
          break;
        case 'endTurn':
          this.selected = null;
          this.target = null;
          this.session.act({ type: 'endTurn' });
          break;
        case 'fast': this.fast = !this.fast; break;
        case 'follow': this.follow = !this.follow; break;
        case 'takeover': this.session.net?.takeOver(); break;
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

  /**
   * Run the computer gangs one action at a time. Attacks and moves are staged so the player can
   * follow them: the camera flies over, an arrow is drawn, then the dice roll, then a pause.
   */
  private scheduleAi(delay?: number) {
    if (this.aiPending) return;
    const s = this.state;
    if (s.phase === 'over' || !this.session.runsAi) return;
    this.aiPending = true;
    this.aiTimer = window.setTimeout(() => {
      // Things may have changed while waiting (e.g. a dropped player came back online).
      if (!this.session.runsAi) {
        this.aiPending = false;
        return;
      }
      const action = aiAction(this.state);
      const gang = this.state.current;
      const watching = this.follow && !this.fast;
      if (watching && (action.type === 'attack' || action.type === 'move')) {
        const d = this.hooks.director;
        d.fadeArrows();
        if (!d.userMovedSince(this.aiTurnStart)) d.frame([action.from, action.to], true);
        d.arrow(action.from, action.to, gang, action.type);
        this.aiTimer = window.setTimeout(() => {
          this.aiPending = false;
          if (!this.session.runsAi || this.state.current !== gang) return this.scheduleAi();
          this.staged = true;
          this.session.act(action);
          this.staged = false;
          this.refresh();
          this.scheduleAi(action.type === 'attack' ? 2400 : 1000);
        }, action.type === 'attack' ? 1100 : 700);
        return;
      }
      this.aiPending = false;
      if (action.type === 'endTurn') this.hooks.director.fadeArrows();
      this.session.act(action);
      this.refresh();
      this.scheduleAi();
    }, delay ?? (this.fast ? 90 : 420));
  }

  /** A computer move is in the pipeline (so new events don't start a second one). */
  private aiPending = false;
  /** The current move was already shown with an arrow before it happened. */
  private staged = false;
  private lastOwners = '';

  /** When the current computer turn started (to tell if the player has moved the map since). */
  private aiTurnStart = 0;

  // --- Reacting to the game ---------------------------------------------------------

  private onEvents(events: GameEvent[]) {
    const s = this.state;
    NAMES = s.names ?? {}; // online: players can join mid-game and take over a gang
    let owners = false;
    const d = this.hooks.director;
    // Moves by other people (online) or computer moves played elsewhere get the same arrow and
    // camera treatment as computer moves staged here.
    const showMove = (from: number, to: number, gang: GangId, kind: 'attack' | 'move') => {
      if (this.staged || gang === s.human || !this.follow || this.fast) return;
      d.fadeArrows();
      if (!d.userMovedSince(this.aiTurnStart)) d.frame([from, to], true);
      d.arrow(from, to, gang, kind);
    };
    for (const e of events) {
      switch (e.type) {
        case 'turn': {
          const d = this.hooks.director;
          const theirs = territoriesOf(s, e.gang);
          if (e.gang === s.human) {
            // Back to you: fly to your turf.
            this.turnRecruits = e.recruits;
            d.fadeArrows();
            d.frame(theirs);
          } else {
            this.aiTurnStart = performance.now();
            if (this.follow && !this.fast) d.frame(theirs);
          }
          this.log(`${chip(e.gang)} ${gname(e.gang)} recruits ${e.recruits.total}.`);
          if (e.gang === s.human) this.toast(`Your turn: ${e.recruits.total} new members to place.`, recruitBreakdown(e.recruits));
          break;
        }
        case 'placed':
          if (e.gang !== s.human && this.follow && !this.fast) {
            this.hooks.pulse(e.t, 0.5);
            this.hooks.director.tag(e.t, `+${e.n}`, GANGS[e.gang].color);
          }
          break;
        case 'ambushSet':
          if (e.gang === s.human) this.log(`You hid an ambush in ${tname(e.t)}.`);
          break;
        case 'battle':
          showMove(e.from, e.to, e.gang, 'attack');
          this.showBattle(e);
          this.aftermath(e);
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
          else if (this.follow && !this.fast) {
            showMove(e.from, e.to, e.gang, 'move');
            this.hooks.director.tag(e.to, `+${e.n} moved in`, GANGS[e.gang].color);
          }
          break;
        case 'win':
          this.showWin(e.gang, e.reason);
          break;
      }
    }
    // Recolour the city whenever ownership changed (online, a whole new board can arrive at once).
    const ownersKey = s.owner.join();
    if (owners || ownersKey !== this.lastOwners) {
      this.lastOwners = ownersKey;
      this.hooks.owners(s.owner);
    }
    if (this.infoT !== null && this.info.classList.contains('show')) this.showInfo(this.infoT);
    this.refresh();
    this.scheduleAi();
  }

  // --- Drawing ----------------------------------------------------------------------

  refresh() {
    const s = this.state;
    const me = s.human;
    // Online, the board can change under a selection: drop picks that no longer make sense.
    if (this.selected !== null && (s.owner[this.selected] !== me || !this.session.isHumanTurn)) this.selected = null;
    if (this.target !== null && this.selected === null) this.target = null;
    if (this.target !== null && s.phase === 'attack' && !canAttack(s, this.selected!, this.target)) this.target = null;
    // Valid targets for the current selection.
    let targets: number[] = [];
    if (this.session.isHumanTurn && this.selected !== null) {
      if (s.phase === 'attack') targets = s.adjacency[this.selected].filter((j) => canAttack(s, this.selected!, j));
      if (s.phase === 'move') targets = [...connected(s, this.selected)];
    }
    if (this.session.isHumanTurn && s.phase === 'recruit' && this.ambushMode) {
      targets = territoriesOf(s, me!).filter((t) => canAmbush(s, t));
    }
    const emphasis = this.regionShown === null ? [] : TERRITORIES.map((t, i) => (t.region === REGIONS[this.regionShown!].id ? i : -1)).filter((i) => i >= 0);
    this.hooks.highlight(this.selected, this.target !== null ? [this.target] : targets, emphasis);
    this.currentTargets = this.target !== null ? [this.target] : targets;

    // Scoreboard.
    const scoreHtml =
      this.netLine() +
      `<div class="round">Round ${s.round} · first to ${MALLS_TO_WIN} ◆</div>` +
      `<div class="g head"><span class="chip" style="--c:transparent"></span><span class="gn"></span><span class="st">◆</span><span class="st">▦</span><span class="st inc">/turn</span></div>` +
      PLAYER_GANGS.map((g) => {
        const alive = s.order.includes(g);
        const terr = territoriesOf(s, g).length;
        const malls = mallsHeld(s, g);
        const r = recruitsFor(s, g);
        const income = alive ? r.total - r.firstTurn : 0;
        const cls = ['g', g === s.current ? 'now' : '', alive ? '' : 'dead', g === me ? 'me' : ''].join(' ');
        return `<div class="${cls}" style="--c:${GANGS[g].color}">${chip(g)}<span class="gn">${esc(nm(g))}${g === me ? ' (you)' : ''}${this.seatTag(g)}</span>
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
      const net = this.session.net;
      const seat = net?.seats.find((x) => x.gang === s.current);
      const person = seat && !seat.covered;
      const clock = net?.remaining();
      const what = person
        ? `${chip(s.current)} ${seat.name === nm(s.current) ? gname(s.current) : `<b>${esc(seat.name)}</b> (${gname(s.current)})`} is taking their turn${clock != null ? ` · <span class="clock">${fmtClock(clock)}</span>` : ''}`
        : `${chip(s.current)} ${gname(s.current)} is making moves…${seat ? ' <span class="muted">(computer standing in)</span>' : ''}`;
      const fastBtn = this.session.runsAi ? `<button data-act="fast" class="${this.fast ? 'on' : ''}">${this.fast ? 'Fast ✓' : 'Fast forward'}</button>` : '';
      return `<div class="phase">${what}</div>${this.netActions()}
        <div class="row">${fastBtn}
        <button data-act="follow" class="${this.follow ? 'on' : ''}" title="Fly the camera to their attacks">${this.follow ? 'Following ✓' : 'Follow camera'}</button></div>`;
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
      const cut = territoriesOf(s, s.human!).filter((t) => isCutOff(s, t)).length;
      const cutHint = cut ? `<div class="hint"><span class="cutmark">⊘</span> ${cut} of your turfs ${cut === 1 ? 'is' : 'are'} cut off from your strongholds: no recruits there, and they attack with ${CUT_OFF_ATTACK_DICE} dice at most.</div>` : '';
      return `${head}<div class="phase"><b class="big">${s.reserves}</b> members to place. Tap your turf.</div>${this.breakdownHtml()}${cutHint}${amb}
        <div class="row">
          ${[1, 3, 0].map((n) => `<button data-act="amount" data-n="${n}" class="${this.amount === n ? 'on' : ''}">${n === 0 ? 'All' : `+${n}`}</button>`).join('')}
          <button data-act="ambush" class="${this.ambushMode ? 'on' : ''}" ${s.reserves < AMBUSH_COST || mine >= MAX_AMBUSHES ? 'disabled' : ''}>Ambush (${AMBUSH_COST})</button>
          ${this.undoButton()}
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
        const cutOff = isCutOff(s, from);
        const odds = this.odds(s.members[from], s.members[t], mall, cutOff ? CUT_OFF_ATTACK_DICE : 3);
        const tone = odds >= 0.7 ? 'good' : odds >= 0.4 ? 'even' : 'bad';
        body = `<div class="phase">${tname(from)} <b>${s.members[from]}</b> ⟶ ${tname(t)} <b>${s.members[t]}</b></div>
          <div class="matchup">
            <span>You roll ${diceChip(attackDiceFor(s, from), 'att')} ${attackDiceFor(s, from)}${cutOff ? ' <em class="cutnote">⊘ cut off</em>' : ''}</span>
            <span>vs ${diceChip(defenceDice(s.members[t], mall), 'def')} ${defenceDice(s.members[t], mall)} ${mall ? '<em>stronghold +1 die</em>' : ''}</span>
            <span class="odds ${tone}" title="Chance a Blitz takes it">Blitz win ${Math.round(odds * 100)}%</span>
          </div>
          ${mall ? '' : '<div class="hint">Street turf: there may be a hidden ambush (−' + AMBUSH_STRIKE + ' attackers).</div>'}
          <div class="row"><button data-act="roll" class="primary">Attack</button><button data-act="blitz">Blitz</button><button data-act="cancel">Cancel</button></div>`;
      }
      return `${head}${body}<div class="row">${this.undoButton('Undo deployment')}<button data-act="endAttack">Done attacking</button></div>`;
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
  private odds(att: number, def: number, mall: boolean, maxAttDice = 3) {
    const key = `${att}/${def}/${mall}/${maxAttDice}`;
    if (!this.oddsCache.has(key)) this.oddsCache.set(key, blitzOdds(att, def, mall, maxAttDice));
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
    const cut = new Set(TERRITORIES.map((_, t) => t).filter((t) => isCutOff(s, t)));
    return TERRITORIES.map((def, t) => {
      let html = '';
      if (def.kind === 'mall') html += `<span class="inc" title="Pays its holder +${def.income} members per turn">+${def.income}</span>`;
      if (cut.has(t)) html += `<span class="cutmark" title="Cut off: no supply line to a stronghold. Can't be reinforced; attacks with ${CUT_OFF_ATTACK_DICE} dice at most.">⊘</span>`;
      if (!me || s.phase === 'over') return html;
      const mine = s.owner[t] === me;
      const border = mine && s.adjacency[t].some((j) => s.owner[j] !== me);
      if (attacking) {
        if (mine && border && s.members[t] >= 2 && (this.selected === null || this.selected === t)) html += diceChip(attackDiceFor(s, t), 'att');
        if (this.currentTargets.includes(t)) html += diceChip(defenceDice(s.members[t], isMallT(t)), 'def');
      } else if (border) {
        html += diceChip(defenceDice(s.members[t], isMallT(t)), 'def');
      }
      return html;
    });
  }

  /** Online: room code, your turn clock, and connection notes. */
  private netLine(): string {
    const net = this.session.net;
    if (!net) return '';
    const clock = this.session.isHumanTurn ? net.remaining() : null;
    return `<div class="netline"><span class="room" title="Room code: friends join with it">Room ${esc(net.code)}</span>
      ${net.role === 'host' ? '<span class="muted">you host</span>' : ''}
      ${clock != null ? `<span class="clock ${clock < 30000 ? 'low' : ''}">Your turn ${fmtClock(clock)}</span>` : ''}</div>`;
  }

  /** Online: who plays each gang. */
  private seatTag(g: GangId): string {
    const net = this.session.net;
    if (!net) return '';
    const seat = net.seats.find((x) => x.gang === g);
    if (!seat) return ' <span class="who">computer</span>';
    if (g === this.state.human) return '';
    const who = seat.name === nm(g) ? '' : `${esc(seat.name)} · `;
    if (!seat.connected) return ` <span class="who off">${who}offline${seat.covered ? ', computer playing' : ''}</span>`;
    return who ? ` <span class="who">${who.slice(0, -3)}</span>` : ` <span class="who">player</span>`;
  }

  /** Online: take over a host who has gone quiet, and leave the room. */
  private netActions(): string {
    const net = this.session.net;
    if (!net) return '';
    return `${net.status ? `<div class="hint">${esc(net.status)}</div>` : ''}${
      net.canTakeOver
        ? `<div class="hint warn">The host's game has gone quiet. Take over to keep playing; your browser becomes the referee.</div>
           <div class="row"><button data-act="takeover" class="primary">Take over as host</button></div>`
        : ''}`;
  }

  /** Take back deployments until the first attack of the turn. */
  private undoButton(label = 'Undo') {
    const n = this.session.undoCount;
    return n > 0 ? `<button data-act="undo" class="undo" title="Take back your last deployment (until you attack)">↶ ${label}</button>` : '';
  }

  private slider(min: number, max: number) {
    const v = Math.min(max, Math.max(min, this.moveAmount || max));
    this.moveAmount = v;
    return `<div class="slider"><input type="range" name="amount" min="${min}" max="${max}" value="${v}" ${min === max ? 'disabled' : ''}/><output>${v}</output></div>`;
  }

  private infoT: number | null = null;
  private infoTimer = 0;

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
    const cutTag = isCutOff(s, t) ? `<span class="tag cut">⊘ Cut off from its strongholds: no recruits, max ${CUT_OFF_ATTACK_DICE} attack dice</span>` : '';
    this.info.innerHTML = `<div class="tn">${esc(d.name)}</div><div class="real">${esc(d.real)}</div>
      <div class="real">${esc(region.name)} region: +${region.bonus}/turn if you hold all of it</div>
      <div>${chip(owner)} ${gname(owner)} · <b>${s.members[t]}</b> members</div>${kind}${cutTag}${ambush}`;
    this.info.classList.add('show');
    // On phones the card is a brief peek, so it doesn't sit over the map.
    clearTimeout(this.infoTimer);
    if (innerWidth < 640) this.infoTimer = window.setTimeout(() => this.info.classList.remove('show'), 3500);
  }

  /** Pin the result of a battle on the map: who holds the turf now, and what it cost. */
  private aftermath(b: Battle) {
    const att = GANGS[b.gang].color, def = GANGS[b.defender].color;
    const losses = `<span style="color:${att}">−${b.attLoss}</span> · <span style="color:${def}">−${b.defLoss}</span>`;
    const html = b.captured
      ? `<b>Captured</b> by ${esc(nm(b.gang))}<div>${losses}</div>`
      : `<b>Held</b> by ${esc(nm(b.defender))}<div>${losses}</div>`;
    this.hooks.director.tag(b.to, html, b.captured ? att : def);
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
