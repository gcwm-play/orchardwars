// Where a multiplayer room lives. One document per room holds everything:
//   - fields the host writes: the game state, an event log, seats, settings, a heartbeat
//   - fields each player writes under their own key: joins.<token>, intents.<token>, beats.<token>
// Writes only touch their own field paths, so players never overwrite each other.
//
// Two implementations: Firestore (real games) and a localStorage one for testing several
// tabs in one browser (?net=local), like the merchant game's local mode.

export type RoomDoc = Record<string, unknown>;

export interface RoomStore {
  /** Read a room once (null if it doesn't exist). */
  get(code: string): Promise<RoomDoc | null>;
  /** Create or replace a room. */
  create(code: string, data: RoomDoc): Promise<void>;
  /**
   * Update some fields; keys may be dotted paths ("intents.abc"). Each write also pushes the room's
   * expiry date forward: ROOM_TTL_DAYS by default, or opts.expiresInDays (e.g. for a finished game).
   */
  update(code: string, fields: RoomDoc, opts?: { expiresInDays?: number }): Promise<void>;
  /** Watch a room; returns an unsubscribe function. */
  watch(code: string, cb: (doc: RoomDoc | null) => void, onError?: (e: Error) => void): () => void;
}

export const COLLECTION = 'orchardwars';

/**
 * Rooms carry an `expiresAt` date so a Firestore TTL policy can delete them (docs/multiplayer.md).
 * Abandoned rooms: 14 days after the last activity, plus a 2-day buffer.
 * Finished games: 1 day after the end, plus a 2-day buffer.
 */
export const ROOM_TTL_DAYS = 16;
export const FINISHED_TTL_DAYS = 3;

// --- Firestore ---------------------------------------------------------------------------

/** The Firebase project shared with the induction escape room. The web API key is not a
 * secret: access is controlled by Firestore security rules (see docs/multiplayer.md). */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAC0tPipkA0KTJEoTZL1j9vfg6npOgJBx0',
  authDomain: 'cpf-induction-escape-room.firebaseapp.com',
  projectId: 'cpf-induction-escape-room',
  storageBucket: 'cpf-induction-escape-room.firebasestorage.app',
  messagingSenderId: '229405051997',
  appId: '1:229405051997:web:0292b3ad4f8225bcc111b4',
};

export async function firestoreStore(): Promise<RoomStore> {
  // Loaded only when someone plays online, so single-player stays light.
  const [{ initializeApp, getApps }, fs] = await Promise.all([import('firebase/app'), import('firebase/firestore')]);
  const app = getApps().find((a) => a.name === 'orchardwars') ?? initializeApp(FIREBASE_CONFIG, 'orchardwars');
  const db = fs.getFirestore(app);
  const ref = (code: string) => fs.doc(db, COLLECTION, code);
  // Lets a Firestore TTL policy clear rooms nobody has touched for two weeks (docs/multiplayer.md).
  const expiry = (days = ROOM_TTL_DAYS) => fs.Timestamp.fromMillis(Date.now() + days * 24 * 3600 * 1000);
  return {
    async get(code) {
      const snap = await fs.getDoc(ref(code));
      return snap.exists() ? (snap.data() as RoomDoc) : null;
    },
    async create(code, data) {
      await fs.setDoc(ref(code), { ...data, updatedAt: fs.serverTimestamp(), expiresAt: expiry() });
    },
    async update(code, fields, opts) {
      await fs.updateDoc(ref(code), { ...fields, updatedAt: fs.serverTimestamp(), expiresAt: expiry(opts?.expiresInDays) });
    },
    watch(code, cb, onError) {
      return fs.onSnapshot(
        ref(code),
        (snap) => cb(snap.exists() ? (snap.data() as RoomDoc) : null),
        (e) => onError?.(e),
      );
    },
  };
}

// --- Local (several tabs of one browser) ------------------------------------------------
// Each tab keeps its own part of the room under its own key and only ever rewrites that part;
// readers merge all parts. Like Firestore field updates, tabs never overwrite each other.

const partPrefix = (code: string) => `ow-local-room-${code}|`;
const tabId = Math.random().toString(36).slice(2, 10);

/** Set a dotted path ("a.b") inside an object. */
function setPath(obj: RoomDoc, path: string, value: unknown) {
  const parts = path.split('.');
  let o = obj as Record<string, unknown>;
  for (const p of parts.slice(0, -1)) {
    if (typeof o[p] !== 'object' || o[p] === null || Array.isArray(o[p])) o[p] = {};
    o = o[p] as Record<string, unknown>;
  }
  o[parts[parts.length - 1]] = value;
}

/** Merge b into a: plain objects merge key by key, everything else is replaced. */
function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>) {
  for (const [k, v] of Object.entries(b)) {
    const cur = a[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>);
    } else a[k] = v;
  }
  return a;
}

export function localStore(): RoomStore {
  const listeners = new Map<string, Set<(d: RoomDoc | null) => void>>();
  const mine = new Map<string, RoomDoc>(); // this tab's own part of each room
  const read = (code: string): RoomDoc | null => {
    const parts: { at: number; data: RoomDoc }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(partPrefix(code))) {
        try {
          parts.push(JSON.parse(localStorage.getItem(k)!));
        } catch {
          /* skip broken part */
        }
      }
    }
    if (!parts.some((p) => p.data.game)) return null; // nobody created it
    // The creator's part first, then the rest in write order.
    parts.sort((x, y) => (y.data.game ? 1 : 0) - (x.data.game ? 1 : 0) || x.at - y.at);
    return parts.reduce((acc, p) => deepMerge(acc, structuredClone(p.data)), {} as RoomDoc);
  };
  const write = (code: string) => {
    localStorage.setItem(partPrefix(code) + tabId, JSON.stringify({ at: Date.now(), data: mine.get(code) }));
    notify(code);
  };
  const notify = (code: string) => {
    const d = read(code);
    listeners.get(code)?.forEach((fn) => setTimeout(() => fn(d && structuredClone(d)), 0));
  };
  // Other tabs' writes arrive as storage events.
  addEventListener('storage', (e) => {
    const m = e.key?.match(/^ow-local-room-([A-Z0-9]+)\|/);
    if (m) notify(m[1]);
  });
  return {
    async get(code) {
      return read(code);
    },
    async create(code, data) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)!;
        if (k.startsWith(partPrefix(code))) localStorage.removeItem(k);
      }
      mine.set(code, { ...structuredClone(data), updatedAt: Date.now() });
      write(code);
    },
    async update(code, fields) {
      if (!read(code)) throw new Error('Room not found');
      const part = mine.get(code) ?? {};
      for (const [k, v] of Object.entries(fields)) setPath(part, k, structuredClone(v));
      part.updatedAt = Date.now();
      mine.set(code, part);
      write(code);
    },
    watch(code, cb) {
      if (!listeners.has(code)) listeners.set(code, new Set());
      listeners.get(code)!.add(cb);
      setTimeout(() => cb(read(code)), 0);
      return () => listeners.get(code)?.delete(cb);
    },
  };
}

export function roomStore(): Promise<RoomStore> {
  const local = new URLSearchParams(location.search).get('net') === 'local';
  return local ? Promise.resolve(localStore()) : firestoreStore();
}
