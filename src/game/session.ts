// Holds the running game: applies actions, keeps a short history for the event feed,
// and saves to the browser after every change so a game survives a refresh.

import { PLAYER_GANGS, type PlayerGang } from './data.ts';
import { apply, newGame, type Action, type GameEvent, type GameState } from './rules.ts';

const SAVE_KEY = 'orchardwars-save-v1';

/** Actions the player can take back: deploying members, ambushes, and finishing recruitment. */
export const UNDOABLE = new Set<Action['type']>(['place', 'ambush', 'endRecruit']);

/** Multiplayer details the UI shows (room code, players, timer). Absent in single player. */
export interface NetView {
  code: string;
  role: 'host' | 'client';
  seats: { name: string; gang: PlayerGang | null; connected: boolean; host: boolean; covered: boolean }[];
  /** Milliseconds left in the current human turn, or null without a timer. */
  remaining(): number | null;
  status: string;
  /** The host has gone quiet and this player could take over. */
  canTakeOver: boolean;
  takeOver(): void;
  leave(): void;
}

/** What the game UI needs from a running game, local or online. */
export interface GameSession {
  readonly state: GameState;
  /** Is it this player's turn? */
  readonly isHumanTurn: boolean;
  /** Should this browser play the computer gangs' moves right now? */
  readonly runsAi: boolean;
  readonly undoCount: number;
  act(action: Action): void;
  undo(): void;
  onEvents(fn: (events: GameEvent[]) => void): void;
  readonly net?: NetView;
}

export class Session implements GameSession {
  private listeners: ((events: GameEvent[]) => void)[] = [];
  /**
   * Snapshots taken before each undoable action this turn. Cleared by the first attack (or any
   * other action), so dice are never re-rolled: deploying doesn't touch the dice.
   */
  private undoStack: string[] = [];

  private constructor(public state: GameState) {}

  static start(adjacency: number[][], human: PlayerGang, seed = Date.now(), teamName?: string): { session: Session; events: GameEvent[] } {
    const { state, events } = newGame(adjacency, human, seed, teamName ? { [human]: teamName } : {});
    const session = new Session(state);
    session.save();
    return { session, events };
  }

  /** A saved game that isn't finished, if there is one. */
  static load(adjacency: number[][]): Session | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw) as GameState;
      if (state.version !== 1 || state.phase === 'over' || state.owner.length !== adjacency.length) return null;
      if (!PLAYER_GANGS.includes(state.current)) return null;
      state.adjacency = adjacency; // always use the current map's borders
      return new Session(state);
    } catch {
      return null;
    }
  }

  static clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* storage blocked: nothing to clear */
    }
  }

  get isHumanTurn() {
    return this.state.phase !== 'over' && this.state.current === this.state.human;
  }

  get runsAi() {
    return this.state.phase !== 'over' && !this.isHumanTurn;
  }

  onEvents(fn: (events: GameEvent[]) => void) {
    this.listeners.push(fn);
  }

  act(action: Action): GameEvent[] {
    const human = this.isHumanTurn;
    const before = human && UNDOABLE.has(action.type) ? this.snapshot() : null;
    const events = apply(this.state, action);
    if (before) this.undoStack.push(before);
    else this.undoStack = [];
    this.save();
    for (const fn of this.listeners) fn(events);
    return events;
  }

  /** How many deployment steps can be taken back right now. */
  get undoCount() {
    return this.isHumanTurn ? this.undoStack.length : 0;
  }

  /** Take back the last deployment step (a placement, an ambush, or "Done"). */
  undo(): boolean {
    const snap = this.undoStack.pop();
    if (!snap || !this.isHumanTurn) return false;
    const adjacency = this.state.adjacency;
    this.state = { ...(JSON.parse(snap) as GameState), adjacency };
    this.save();
    for (const fn of this.listeners) fn([]);
    return true;
  }

  private snapshot() {
    const { adjacency: _skip, ...rest } = this.state;
    return JSON.stringify(rest);
  }

  private save() {
    try {
      const { adjacency: _skip, ...rest } = this.state;
      if (this.state.phase === 'over') localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...rest, adjacency: [] }));
    } catch {
      /* private mode or storage full: the game still works, it just won't resume */
    }
  }
}
