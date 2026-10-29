/**
 * Play preferences that belong to one player (core loop blueprint 5.1 Settings
 * and 5.3, must-fix 33): "Picture games only".
 *
 * A child who cannot read yet turns on Picture games only (in Settings, or on
 * the Trivia how-to card). Every paid ride try then sends picture_only=1 and
 * the server deals only Whack-a-Shark or Memory Match, never trivia. The
 * setting shows only while the server's picture_games switch is on (the
 * server that honors the flag is the one that sends the switch).
 *
 * Stored per player id (AsyncStorage "tps.playPrefs.v1@p<id>"), so a second
 * shark on a family phone keeps its own choice. Reads never throw; a failed
 * read means "off".
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import getFeatureFlags from '../api/endpoints/platform/feature-flags';

const KEY = 'tps.playPrefs.v1';

export interface PlayPrefs {
  /** Deal only picture games (Whack, Memory) on paid ride tries. */
  readonly pictureOnly: boolean;
}

export const DEFAULT_PLAY_PREFS: PlayPrefs = Object.freeze({ pictureOnly: false });

/** Server switches this file reads, from GET /feature-flags (absent reads as off). */
export interface PlayFlags {
  /** The server deals picture games only when asked (be-core-loop). */
  readonly pictureGames: boolean;
  /** Push reminders work (retention_push). Favorites Alerts hide while it is off. */
  readonly pushWorks: boolean;
  /** Queue Tickets: the first wait at a ride earns a Ticket. */
  readonly queueTickets: boolean;
  /**
   * TRY AGAIN deals the lost game again (the server honors retry_of). Read from the server's own
   * retry_same_game switch when it sends one; until then, picture_games stands in, since be-core-loop
   * ships retry_of with it. The loss card says "Same game" only while this is true.
   */
  readonly retrySameGame: boolean;
}

export const PLAY_FLAGS_OFF: PlayFlags = Object.freeze({ pictureGames: false, pushWorks: false, queueTickets: false, retrySameGame: false });

/** The same-game switch: the server's explicit answer wins; an older server falls back to picture_games. */
export function retrySameGameFlag(serverFlags: Record<string, unknown> | null | undefined): boolean {
  const explicit = serverFlags?.retry_same_game;
  if (typeof explicit === 'boolean') return explicit;
  return serverFlags?.picture_games === true;
}

export function playPrefsKey(playerId: number | string): string {
  return `${KEY}@p${playerId}`;
}

/** A stored record, cleaned: anything unknown or broken reads as the defaults. */
export function parsePlayPrefs(raw: string | null | undefined): PlayPrefs {
  if (!raw) return DEFAULT_PLAY_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<PlayPrefs> | null;
    return { pictureOnly: value?.pictureOnly === true };
  } catch {
    return DEFAULT_PLAY_PREFS;
  }
}

/** Whether a paid try asks the server for picture games: the switch and the setting must both be on. */
export function pictureOnlyRequest(flags: Pick<PlayFlags, 'pictureGames'> | null | undefined,
  prefs: Pick<PlayPrefs, 'pictureOnly'> | null | undefined): boolean {
  return flags?.pictureGames === true && prefs?.pictureOnly === true;
}

/* ---------- the store ---------- */

let flags: PlayFlags | null = null;
let flagsPending: Promise<PlayFlags> | null = null;
const prefs = new Map<string, PlayPrefs>();
const loading = new Map<string, Promise<PlayPrefs>>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version += 1; listeners.forEach(listener => { try { listener(); } catch { /* keep going */ } }); };

/** The server switches, read once per app run (a failed read tries again next time). */
export function loadPlayFlags(read: typeof getFeatureFlags = getFeatureFlags): Promise<PlayFlags> {
  if (flags) return Promise.resolve(flags);
  flagsPending ??= read().then(payload => {
    flags = {
      pictureGames: payload.flags.picture_games === true,
      pushWorks: payload.flags.retention_push === true,
      queueTickets: payload.flags.queue_tickets === true,
      retrySameGame: retrySameGameFlag(payload.flags as Record<string, unknown>),
    };
    emit();
    return flags;
  }).catch(() => { flagsPending = null; return PLAY_FLAGS_OFF; });
  return flagsPending;
}

/** The switches read this run, or the all-off answer before the first read. */
export function playFlagsNow(): PlayFlags {
  return flags ?? PLAY_FLAGS_OFF;
}

/** This player's preferences (loads once per player and app run). */
export function loadPlayPrefs(playerId: number | null | undefined): Promise<PlayPrefs> {
  if (playerId == null) return Promise.resolve(DEFAULT_PLAY_PREFS);
  const id = String(playerId);
  const known = prefs.get(id);
  if (known) return Promise.resolve(known);
  let pending = loading.get(id);
  if (!pending) {
    pending = AsyncStorage.getItem(playPrefsKey(id)).then(parsePlayPrefs, () => DEFAULT_PLAY_PREFS).then(value => {
      if (!prefs.has(id)) { prefs.set(id, value); emit(); }
      loading.delete(id);
      return prefs.get(id) ?? value;
    });
    loading.set(id, pending);
  }
  return pending;
}

/** The answer a paid try sends right now (loads the record first when it is not in memory yet). */
export async function pictureOnlyFor(playerId: number | null | undefined): Promise<boolean> {
  const [switches, own] = await Promise.all([loadPlayFlags(), loadPlayPrefs(playerId)]);
  return pictureOnlyRequest(switches, own);
}

/** Save a change for this player. The new value is live at once; the write is best effort. */
export function setPlayPrefs(playerId: number | null | undefined, change: Partial<PlayPrefs>): Promise<void> {
  if (playerId == null) return Promise.resolve();
  const id = String(playerId);
  const next: PlayPrefs = { ...(prefs.get(id) ?? DEFAULT_PLAY_PREFS), ...change };
  prefs.set(id, next);
  emit();
  return AsyncStorage.setItem(playPrefsKey(id), JSON.stringify(next)).catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * The switches and this player's preferences for a screen, plus a setter.
 * `available` is false while the server's picture_games switch is off: the
 * setting is not shown at all then.
 */
export function usePlayPrefs(playerId: number | null | undefined): {
  readonly flags: PlayFlags;
  readonly prefs: PlayPrefs;
  readonly available: boolean;
  readonly setPictureOnly: (on: boolean) => void;
} {
  useSyncExternalStore(subscribe, () => version, () => version);
  useEffect(() => {
    void loadPlayFlags();
    void loadPlayPrefs(playerId);
  }, [playerId]);
  const own = playerId == null ? DEFAULT_PLAY_PREFS : prefs.get(String(playerId)) ?? DEFAULT_PLAY_PREFS;
  const switches = playFlagsNow();
  const setPictureOnly = useCallback((on: boolean) => { void setPlayPrefs(playerId, { pictureOnly: on }); }, [playerId]);
  return { flags: switches, prefs: own, available: switches.pictureGames, setPictureOnly };
}

/** Tests only. */
export function resetPlayPrefsForTests(): void {
  flags = null;
  flagsPending = null;
  prefs.clear();
  loading.clear();
  emit();
}
