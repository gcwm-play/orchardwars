// Holds the running game: applies actions, keeps a short history for the event feed,
// and saves to the browser after every change so a game survives a refresh.

import { PLAYER_GANGS, type PlayerGang } from './data.ts';
import { apply, newGame, type Action, type GameEvent, type GameState } from './rules.ts';

const SAVE_KEY = 'orchardwars-save-v1';

export class Session {
  private listeners: ((events: GameEvent[]) => void)[] = [];

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

  onEvents(fn: (events: GameEvent[]) => void) {
    this.listeners.push(fn);
  }

  act(action: Action): GameEvent[] {
    const events = apply(this.state, action);
    this.save();
    for (const fn of this.listeners) fn(events);
    return events;
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
