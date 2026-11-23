// Online play, modelled on the merchant game's multiplayer: the host's browser is the referee.
// It keeps the real game, applies every move, runs the computer gangs and anyone who drops out,
// and publishes the result. Other players send their moves as "intents" and watch the published
// game. Unlike a peer-to-peer room, everything lives in one Firestore document, so the game
// survives the host's tab closing: any player can take over as host and carry on.

import { GANGS, PLAYER_GANGS, type GangId, type PlayerGang } from '../game/data.ts';
import { apply, newGame, type Action, type GameEvent, type GameState } from '../game/rules.ts';
import { UNDOABLE, type GameSession, type NetView } from '../game/session.ts';
import { FINISHED_TTL_DAYS, type RoomDoc, type RoomStore } from './store.ts';

export interface NetSettings {
  /** Seconds per human turn; 0 = no timer. */
  timer: number;
  /** When a player drops out: the computer plays for them, or everyone waits. */
  drop: 'ai' | 'wait';
}

interface Seat {
  token: string;
  name: string;
  gang: PlayerGang | null;
  host: boolean;
}

type Intent = { n: number; a: Action | { type: 'undo' } };

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const genToken = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const OFFLINE_MS = 40_000; // no heartbeat for this long = offline
const BEAT_MS = 10_000;
const LOG_KEEP = 40;

/** This browser's identity for online play (kept across visits). Separate per ?profile= for testing. */
export function netPlayer(): { token: string; name: string } {
  const key = 'ow-net-player' + (new URLSearchParams(location.search).get('profile') ?? '');
  try {
    const p = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (p?.token) return p;
  } catch {
    /* fall through */
  }
  const p = { token: genToken(), name: '' };
  try {
    localStorage.setItem(key, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
  return p;
}
function saveNetPlayer(p: { token: string; name: string }) {
  try {
    localStorage.setItem('ow-net-player' + (new URLSearchParams(location.search).get('profile') ?? ''), JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
}

/** The last room this browser was in, for a "Rejoin" button. */
export function lastRoom(): string | null {
  try {
    return localStorage.getItem('ow-net-last' + (new URLSearchParams(location.search).get('profile') ?? ''));
  } catch {
    return null;
  }
}
function rememberRoom(code: string | null) {
  try {
    const k = 'ow-net-last' + (new URLSearchParams(location.search).get('profile') ?? '');
    if (code) localStorage.setItem(k, code);
    else localStorage.removeItem(k);
  } catch {
    /* storage blocked */
  }
}

const strip = (s: GameState) => {
  const { adjacency: _a, ...rest } = s;
  return JSON.stringify({ ...rest, human: null });
};

export class NetSession implements GameSession {
  role: 'host' | 'client' = 'client';
  readonly code: string;
  private readonly me: { token: string; name: string };
  private doc: RoomDoc | null = null;
  private auth: GameState | null = null;
  private listeners: ((events: GameEvent[]) => void)[] = [];
  private lobbyListeners: (() => void)[] = [];
  private unwatch: (() => void) | null = null;
  private timers: number[] = [];
  status = '';

  // Host bookkeeping.
  private seats: Seat[] = [];
  private settings: NetSettings = { timer: 120, drop: 'ai' };
  private acks: Record<string, number> = {};
  private beatSeen = new Map<string, { value: unknown; at: number }>();
  private undoStack: string[] = [];
  private log: { seq: number; events: string }[] = [];
  private seq = 0;
  private pending: GameEvent[] = [];
  private publishTimer = 0;
  private lastPublish = 0;
  private deadline = 0;
  private timedOut = false;

  // Client bookkeeping.
  private lastSeq = -1;
  private intentN = 0;
  private intents: Intent[] = [];
  private remainingAt: { ms: number | null; at: number } = { ms: null, at: 0 };
  private hostBeatSeen = { value: undefined as unknown, at: Date.now() };

  private constructor(private readonly store: RoomStore, code: string, private readonly adjacency: number[][], name: string) {
    this.code = code;
    const p = netPlayer();
    p.name = name || p.name || 'Player';
    saveNetPlayer(p);
    this.me = p;
  }

  // --- Creating and joining -------------------------------------------------------------

  static async host(store: RoomStore, adjacency: number[][], name: string): Promise<NetSession> {
    let code = genCode();
    for (let i = 0; i < 5 && (await store.get(code)); i++) code = genCode();
    const s = new NetSession(store, code, adjacency, name);
    s.role = 'host';
    s.seats = [{ token: s.me.token, name: s.me.name, gang: null, host: true }];
    await store.create(code, {
      game: 'orchardwars', v: 1, status: 'lobby', hostToken: s.me.token, hostBeat: Date.now(),
      settings: s.settings, seats: s.seats, seq: 0, log: [], acks: {},
    });
    rememberRoom(code);
    s.listen();
    return s;
  }

  static async join(store: RoomStore, adjacency: number[][], rawCode: string, name: string): Promise<NetSession> {
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const doc = await store.get(code);
    if (!doc || doc.game !== 'orchardwars') throw new Error(`No game with room code ${code}. Check the code with the host.`);
    if (doc.status === 'over') throw new Error('That game has finished.');
    const s = new NetSession(store, code, adjacency, name);
    rememberRoom(code);
    if (doc.hostToken === s.me.token) {
      s.becomeHost(doc); // the host coming back after a refresh
    } else {
      await store.update(code, { [`joins.${s.me.token}`]: { name: s.me.name, at: Date.now() }, [`beats.${s.me.token}`]: Date.now() });
    }
    s.listen();
    return s;
  }

  private listen() {
    this.unwatch = this.store.watch(
      this.code,
      (d) => this.onDoc(d),
      (e) => {
        this.status = `Connection problem: ${e.message}`;
        this.emitLobby();
      },
    );
    // Heartbeats, timers and drop-outs.
    this.timers.push(window.setInterval(() => this.tick(), 1000));
    this.beat();
    this.timers.push(window.setInterval(() => this.beat(), BEAT_MS));
  }

  /** The game has ended: stop heartbeats, so they don't push the room's expiry date out again. */
  private finished = false;

  private beat() {
    if (this.finished) return;
    const field = this.role === 'host' ? { hostBeat: Date.now() } : { [`beats.${this.me.token}`]: Date.now() };
    this.store.update(this.code, field).catch(() => {});
  }

  leave() {
    this.timers.forEach(clearInterval);
    this.unwatch?.();
    rememberRoom(null);
    location.href = location.pathname + location.search.replace(/([?&])(gang|seed|name)=[^&]*/g, '$1');
  }

  // --- Lobby ------------------------------------------------------------------------------

  get started() {
    return this.auth !== null;
  }

  get lobbySeats(): { name: string; host: boolean; connected: boolean; me: boolean }[] {
    const seats = this.role === 'host' ? this.seats : ((this.doc?.seats as Seat[]) ?? []);
    return seats.map((s) => ({ name: s.name, host: s.host, connected: this.isConnected(s), me: s.token === this.me.token }));
  }

  get lobbySettings(): NetSettings {
    return this.role === 'host' ? this.settings : ((this.doc?.settings as NetSettings) ?? this.settings);
  }

  setSettings(s: Partial<NetSettings>) {
    if (this.role !== 'host' || this.started) return;
    this.settings = { ...this.settings, ...s };
    this.store.update(this.code, { settings: this.settings }).catch(() => {});
    this.emitLobby();
  }

  onLobby(fn: () => void) {
    this.lobbyListeners.push(fn);
  }

  private emitLobby() {
    this.lobbyListeners.forEach((f) => f());
  }

  /** Host: start with everyone in the room; corners are drawn at random, empty ones go to the computer. */
  start() {
    if (this.role !== 'host' || this.started) return;
    const players = this.seats.slice(0, PLAYER_GANGS.length);
    const corners = [...PLAYER_GANGS].sort(() => Math.random() - 0.5);
    players.forEach((s, i) => (s.gang = corners[i]));
    const names: Partial<Record<GangId, string>> = {};
    for (const s of players) names[s.gang!] = s.name;
    const { state, events } = newGame(this.adjacency, null, Date.now(), names);
    state.humans = players.map((s) => s.gang!);
    this.auth = state;
    this.auth.human = this.myGang;
    this.resetTurnClock();
    this.queue(events);
    this.publishNow({ status: 'playing' });
    this.emitLobby();
  }

  // --- GameSession ------------------------------------------------------------------------

  get state(): GameState {
    return this.auth!;
  }

  private get myGang(): PlayerGang | null {
    const seats = this.role === 'host' ? this.seats : ((this.doc?.seats as Seat[]) ?? []);
    return seats.find((s) => s.token === this.me.token)?.gang ?? null;
  }

  /** Is the computer playing this gang right now? */
  private covered(g: GangId): boolean {
    if (g === 'neutral') return true;
    const covered = this.role === 'host' ? this.coveredList() : ((this.doc?.covered as string[]) ?? []);
    return covered.includes(g);
  }

  private coveredList(): PlayerGang[] {
    const out: PlayerGang[] = [];
    if (!this.auth) return out;
    for (const g of PLAYER_GANGS) {
      const seat = this.seats.find((s) => s.gang === g);
      if (!seat) out.push(g);
      else if (!seat.host && !this.isConnected(seat) && this.settings.drop === 'ai') out.push(g);
      else if (g === this.auth.current && this.timedOut) out.push(g);
    }
    return out;
  }

  get isHumanTurn() {
    const s = this.auth;
    return !!s && s.phase !== 'over' && s.current === this.myGang && !this.covered(s.current);
  }

  get runsAi() {
    const s = this.auth;
    return this.role === 'host' && !!s && s.phase !== 'over' && this.covered(s.current);
  }

  get undoCount() {
    if (!this.isHumanTurn) return 0;
    if (this.role === 'host') return this.undoStack.length;
    const u = this.doc?.undo as { gang: string; count: number } | undefined;
    return u && u.gang === this.myGang ? u.count : 0;
  }

  act(action: Action) {
    if (this.role === 'host') {
      try {
        this.applyAuth(action, this.isHumanTurn);
      } catch (e) {
        console.warn(e);
      }
    } else this.sendIntent(action);
  }

  undo() {
    if (this.role === 'host') this.undoAuth();
    else this.sendIntent({ type: 'undo' });
  }

  onEvents(fn: (events: GameEvent[]) => void) {
    this.listeners.push(fn);
  }

  private emit(events: GameEvent[]) {
    for (const fn of this.listeners) fn(events);
  }

  get net(): NetView {
    const seats = this.role === 'host' ? this.seats : ((this.doc?.seats as Seat[]) ?? []);
    return {
      code: this.code,
      role: this.role,
      seats: seats.map((s) => ({ name: s.name, gang: s.gang, connected: this.isConnected(s), host: s.host, covered: !!s.gang && this.covered(s.gang) })),
      remaining: () => this.remaining(),
      status: this.status,
      canTakeOver: this.role === 'client' && Date.now() - this.hostBeatSeen.at > OFFLINE_MS,
      takeOver: () => this.takeOver(),
      leave: () => this.leave(),
    };
  }

  // --- Host: applying moves ---------------------------------------------------------------

  private applyAuth(action: Action, byHuman: boolean) {
    const s = this.auth!;
    const before = byHuman && UNDOABLE.has(action.type) ? strip(s) : null;
    const events = apply(s, action);
    if (before) this.undoStack.push(before);
    else this.undoStack = [];
    if (events.some((e) => e.type === 'turn')) this.resetTurnClock();
    this.queue(events);
    this.emit(events);
  }

  private undoAuth() {
    const snap = this.undoStack.pop();
    if (!snap || !this.auth) return;
    this.auth = { ...(JSON.parse(snap) as GameState), adjacency: this.adjacency, human: this.myGang };
    this.queue([]);
    this.emit([]);
  }

  private resetTurnClock() {
    this.timedOut = false;
    this.deadline = this.settings.timer ? Date.now() + this.settings.timer * 1000 : 0;
    this.undoStack = [];
  }

  /** Apply intents players have sent since the host last looked. */
  private processIntents(doc: RoomDoc) {
    const all = (doc.intents as Record<string, string>) ?? {};
    let changed = false;
    for (const [token, raw] of Object.entries(all)) {
      const seat = this.seats.find((x) => x.token === token);
      let list: Intent[] = [];
      try {
        list = JSON.parse(raw);
      } catch {
        continue;
      }
      for (const it of list) {
        if (it.n <= (this.acks[token] ?? 0)) continue;
        this.acks[token] = it.n;
        changed = true;
        const s = this.auth;
        if (!s || !seat?.gang || s.current !== seat.gang || this.covered(seat.gang)) continue;
        try {
          if (it.a.type === 'undo') this.undoAuth();
          else this.applyAuth(it.a, true);
        } catch (e) {
          console.warn('Ignored a move', it.a, e);
        }
      }
    }
    if (changed) this.schedulePublish();
  }

  private processJoins(doc: RoomDoc) {
    const joins = (doc.joins as Record<string, { name: string }>) ?? {};
    let changed = false;
    for (const [token, j] of Object.entries(joins)) {
      let seat = this.seats.find((s) => s.token === token);
      if (!seat) {
        seat = { token, name: String(j.name || 'Player').slice(0, 24), gang: null, host: false };
        this.seats.push(seat);
        changed = true;
        // Joining mid-game: take over a computer gang that's still in the game.
        if (this.auth) {
          const free = this.auth.order.filter((g) => !this.seats.some((x) => x.gang === g));
          if (free.length) {
            seat.gang = free[Math.floor(Math.random() * free.length)];
            this.auth.names = { ...(this.auth.names ?? {}), [seat.gang]: seat.name };
            this.auth.humans = [...(this.auth.humans ?? []), seat.gang];
            this.queue([]);
            this.emit([]);
          }
        }
      }
    }
    if (changed) {
      this.schedulePublish();
      this.emitLobby();
    }
  }

  private isConnected(seat: { token: string; host: boolean }): boolean {
    if (seat.token === this.me.token) return true;
    if (seat.host) return Date.now() - this.hostBeatSeen.at < OFFLINE_MS || this.role === 'host';
    const b = this.beatSeen.get(seat.token);
    return !!b && Date.now() - b.at < OFFLINE_MS;
  }

  private trackBeats(doc: RoomDoc) {
    const beats = (doc.beats as Record<string, unknown>) ?? {};
    for (const [token, v] of Object.entries(beats)) {
      const seen = this.beatSeen.get(token);
      if (!seen || seen.value !== v) this.beatSeen.set(token, { value: v, at: Date.now() });
    }
    if (doc.hostBeat !== this.hostBeatSeen.value) this.hostBeatSeen = { value: doc.hostBeat, at: Date.now() };
  }

  // --- Host: publishing -------------------------------------------------------------------

  private queue(events: GameEvent[]) {
    this.pending.push(...events);
    this.schedulePublish();
  }

  /** Publish at most about twice a second; batches fast moves (Firestore likes ~1 write/s per doc). */
  private schedulePublish() {
    if (this.publishTimer) return;
    const wait = Math.max(0, 450 - (Date.now() - this.lastPublish));
    this.publishTimer = window.setTimeout(() => {
      this.publishTimer = 0;
      this.publishNow();
    }, wait);
  }

  private publishNow(extra: RoomDoc = {}) {
    clearTimeout(this.publishTimer);
    this.publishTimer = 0;
    this.lastPublish = Date.now();
    const fields: RoomDoc = {
      ...extra,
      seats: this.seats,
      acks: this.acks,
      hostBeat: Date.now(),
      covered: this.coveredList(),
      remaining: this.deadline && !this.timedOut ? Math.max(0, this.deadline - Date.now()) : null,
    };
    if (this.auth) {
      if (this.pending.length) {
        this.seq++;
        this.log = [...this.log, { seq: this.seq, events: JSON.stringify(this.pending) }].slice(-LOG_KEEP);
        this.pending = [];
      }
      fields.state = strip(this.auth);
      fields.seq = this.seq;
      fields.log = this.log;
      fields.undo = { gang: this.auth.current, count: this.undoStack.length };
      if (this.auth.phase === 'over') {
        fields.status = 'over';
        this.finished = true;
        rememberRoom(null);
      }
    }
    // A finished game's room expires sooner (FINISHED_TTL_DAYS) than an abandoned one.
    this.store.update(this.code, fields, this.finished ? { expiresInDays: FINISHED_TTL_DAYS } : undefined).catch((e) => {
      this.status = `Couldn't save the game online: ${e.message}`;
      this.emitLobby();
    });
  }

  private tick() {
    if (this.role === 'host' && this.auth && this.auth.phase !== 'over') {
      // Turn timer: when it runs out, the computer finishes that player's turn.
      const before = this.coveredList().join();
      if (this.deadline && !this.timedOut && Date.now() > this.deadline && !this.covered(this.auth.current)) {
        const seat = this.seats.find((s) => s.gang === this.auth!.current);
        if (seat) this.timedOut = true;
      }
      if (this.coveredList().join() !== before) {
        this.schedulePublish();
        this.emit([]); // lets the UI start the computer for a dropped or timed-out player
      }
    }
    if (this.role === 'client' && this.auth) this.emit([]); // refresh the clock and takeover offer
    this.emitLobby();
  }

  private remaining(): number | null {
    if (this.role === 'host') return this.deadline && !this.timedOut ? Math.max(0, this.deadline - Date.now()) : null;
    const r = this.remainingAt;
    return r.ms === null ? null : Math.max(0, r.ms - (Date.now() - r.at));
  }

  // --- Client -----------------------------------------------------------------------------

  private sendIntent(a: Intent['a']) {
    this.intents = [...this.intents, { n: ++this.intentN, a }].slice(-20);
    this.store.update(this.code, { [`intents.${this.me.token}`]: JSON.stringify(this.intents) }).catch((e) => {
      this.status = `Couldn't send your move: ${e.message}`;
    });
  }

  private onDoc(doc: RoomDoc | null) {
    if (!doc) {
      this.status = 'This room no longer exists.';
      this.emitLobby();
      return;
    }
    this.doc = doc;
    this.trackBeats(doc);

    // Someone else took over as host while this browser was away: carry on as a player.
    if (this.role === 'host' && doc.hostToken !== this.me.token) {
      this.role = 'client';
      this.lastSeq = (doc.seq as number) ?? -1;
    }

    if (this.role === 'host') {
      this.processJoins(doc);
      this.processIntents(doc);
      this.emitLobby();
      return;
    }

    // Client: pick up our own intent counter after a refresh.
    const mine = (doc.intents as Record<string, string> | undefined)?.[this.me.token];
    if (mine && this.intentN === 0) {
      try {
        this.intents = JSON.parse(mine);
        this.intentN = this.intents.reduce((m, i) => Math.max(m, i.n), 0);
      } catch {
        /* ignore */
      }
    }
    this.remainingAt = { ms: (doc.remaining as number | null) ?? null, at: Date.now() };
    if (typeof doc.state === 'string') {
      const st = JSON.parse(doc.state) as GameState;
      st.adjacency = this.adjacency;
      st.human = this.myGang;
      if (st.phase === 'over') this.finished = true;
      const first = this.auth === null;
      this.auth = st;
      const seq = (doc.seq as number) ?? 0;
      const events: GameEvent[] = [];
      if (first) this.lastSeq = seq; // start from now; the board itself shows what came before
      for (const b of (doc.log as { seq: number; events: string }[]) ?? []) {
        if (b.seq > this.lastSeq) events.push(...(JSON.parse(b.events) as GameEvent[]));
      }
      this.lastSeq = seq;
      if (!first) this.emit(events);
    }
    this.emitLobby();
  }

  /** Become the host, using the game as it stands in the room. */
  private becomeHost(doc: RoomDoc) {
    this.role = 'host';
    this.doc = doc;
    this.seats = ((doc.seats as Seat[]) ?? []).map((s) => ({ ...s, host: s.token === this.me.token }));
    if (!this.seats.some((s) => s.token === this.me.token)) this.seats.push({ token: this.me.token, name: this.me.name, gang: null, host: true });
    this.settings = (doc.settings as NetSettings) ?? this.settings;
    this.acks = { ...((doc.acks as Record<string, number>) ?? {}) };
    this.log = (doc.log as { seq: number; events: string }[]) ?? [];
    this.seq = (doc.seq as number) ?? 0;
    if (typeof doc.state === 'string') {
      this.auth = { ...(JSON.parse(doc.state) as GameState), adjacency: this.adjacency };
      this.auth.human = this.myGang;
      this.resetTurnClock();
    }
    // Everyone else counts as connected until their heartbeats say otherwise.
    for (const s of this.seats) this.beatSeen.set(s.token, { value: 'resume', at: Date.now() });
    this.store.update(this.code, { hostToken: this.me.token, hostBeat: Date.now(), seats: this.seats }).catch(() => {});
  }

  private takeOver() {
    if (this.role !== 'client' || !this.doc) return;
    this.becomeHost(this.doc);
    this.status = 'You are now the host. Keep this tab open.';
    this.publishNow();
    this.emit([]);
  }

  /** The gang names to show (players' own names for their gangs). */
  static gangLabel(s: GameState, g: GangId) {
    return s.names?.[g] ?? GANGS[g].name;
  }
}
