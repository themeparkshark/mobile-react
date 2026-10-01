/**
 * One-time tip ("coach mark") seen state, per player, stored on the device.
 *
 * Pure logic over a tiny key-value interface so it is testable without
 * AsyncStorage. One key per player holds a JSON array of tip ids.
 */

/** Every one-time tip in the game. Mini-game intros use `game:<type>`. */
export type TipId =
  | 'park_hud'
  | 'coin_in_range'
  | 'ride_challenge'
  | 'lineplay_intro'
  | 'first_ride_part'
  | 'coin_card'
  | 'first_level_up'
  | 'supplies_tab'
  | 'bonus_ads'
  | `game:${string}`;

export const TIP_STORAGE_PREFIX = 'tps_tips_seen_v1';

/** Tips about a player's very first moments. Veterans never need them. */
export const NEW_PLAYER_TIPS: readonly TipId[] = ['park_hud', 'coin_in_range', 'ride_challenge'];

export function tipStorageKey(playerId: number | string): string {
  return `${TIP_STORAGE_PREFIX}:${playerId}`;
}

export function parseSeen(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0) : []);
  } catch {
    return new Set();
  }
}

export function serializeSeen(seen: ReadonlySet<string>): string {
  return JSON.stringify([...seen].sort());
}

/** Same signal the Finn tutorials use to skip veterans after a reinstall. */
export function isExistingPlayer(player: {
  completed_tasks_count?: number | null; total_experience?: number | null; friends_count?: number | null;
} | null | undefined): boolean {
  if (!player) return false;
  return (player.completed_tasks_count ?? 0) > 0 || (player.total_experience ?? 0) > 50 || (player.friends_count ?? 0) > 0;
}

export interface TipGate {
  /** Seen state has loaded for this player. */
  readonly loaded: boolean;
  readonly seen: ReadonlySet<string>;
  /** Something that must not be interrupted is on screen (mini-game, moving line, a dialog, a Finn lesson). */
  readonly busy: boolean;
  /** Another tip is already showing. One at a time. */
  readonly tipShowing?: boolean;
}

/** A tip shows once, only when the player is free, and only one at a time. */
export function shouldShowTip(id: TipId, gate: TipGate): boolean {
  if (!gate.loaded || gate.busy || gate.tipShowing) return false;
  return !gate.seen.has(id);
}

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SeenTipStore {
  load(): Promise<Set<string>>;
  /** `fresh` is true when this player has never stored any tip state on this device. */
  loadState(): Promise<{ seen: Set<string>; fresh: boolean }>;
  mark(id: TipId, current: ReadonlySet<string>): Promise<Set<string>>;
  markMany(ids: readonly TipId[], current: ReadonlySet<string>): Promise<Set<string>>;
  reset(): Promise<Set<string>>;
}

/**
 * Storage trouble never traps a player: a failed read counts as nothing seen
 * (tips are light and skippable), a failed write keeps the in-memory state.
 */
export function createSeenTipStore(kv: KeyValueStore, playerId: number | string): SeenTipStore {
  const key = tipStorageKey(playerId);
  const write = async (next: Set<string>) => {
    try { await kv.setItem(key, serializeSeen(next)); } catch { /* memory still holds it */ }
    return next;
  };
  return {
    async load() {
      try { return parseSeen(await kv.getItem(key)); } catch { return new Set(); }
    },
    async loadState() {
      try {
        const raw = await kv.getItem(key);
        return { seen: parseSeen(raw), fresh: raw == null };
      } catch {
        return { seen: new Set(), fresh: false };
      }
    },
    mark(id, current) {
      if (current.has(id)) return Promise.resolve(new Set(current));
      return write(new Set([...current, id]));
    },
    markMany(ids, current) {
      const next = new Set(current);
      ids.forEach(id => next.add(id));
      return write(next);
    },
    // An empty list, not a removed key: a replay must not look like a fresh
    // install, or veterans would get the new-player tips skipped again.
    reset() {
      return write(new Set());
    },
  };
}

/**
 * First load on a device: veterans get the new-player tips pre-marked so a
 * reinstall never re-teaches the basics. Feature tips (LinePlay, level-ups,
 * game intros) still show once to everyone.
 */
export function initialSeenFor(fresh: boolean, existingPlayer: boolean, seen: ReadonlySet<string>): Set<string> | null {
  if (!fresh) return null;
  const next = new Set(seen);
  if (existingPlayer) NEW_PLAYER_TIPS.forEach(id => next.add(id));
  return next;
}
