/**
 * playerStorage.ts: game saves that belong to one player, not one phone.
 *
 * Bests, ghosts, streaks, cards and progress used to live under plain
 * AsyncStorage keys, so a brother signing in on the same phone saw his
 * sister's "BEST 2,320". Every game save now goes through this store, which
 * adds the signed-in player to the key ("@whack_a_shark/best@p21").
 *
 * The first player to sign in after this update keeps the saves made before
 * it (on most phones there was only ever one player). Anyone else starts
 * fresh. Device settings (tap calibration) stay on plain AsyncStorage.
 *
 * Same calls as AsyncStorage (getItem, setItem, removeItem) and it never
 * throws more than AsyncStorage would.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Which player the saves made before this update belong to. */
const OWNER_KEY = '@tps/game_saves_owner';

/** Every game save key starts with one of these. */
export const GAME_SAVE_PREFIXES = [
  '@whack/',
  '@whack_a_shark/',
  '@sharky_swim/',
  'tps.memorymatch.',
  'tps.banana.',
  'tps.triviaDuel.',
  'paradeBeat.',
  'cq.progress',
  'boss_bash_',
  'boss_v7_',
  'boss_v8_',
  'boss_ghost_',
  'gamekit:snapshot:',
] as const;

let playerId: string | null = null;
let ready: Promise<void> = Promise.resolve();

/** The key a save is stored under for the signed-in player. */
export function playerKey(key: string, id: string | null = playerId): string {
  return `${key}@p${id ?? 'guest'}`;
}

/** True for a pre-update save key (a game save with no player on it). */
export function isLegacyGameKey(key: string): boolean {
  return !/@p[^@/]+$/.test(key) && GAME_SAVE_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * The first player to sign in after the update adopts the saves made before
 * it. Copies only, and never over a save that player already has.
 */
async function adoptLegacySaves(id: string): Promise<void> {
  try {
    const owner = await AsyncStorage.getItem(OWNER_KEY);
    if (owner && owner !== id) return;
    if (!owner) await AsyncStorage.setItem(OWNER_KEY, id);
    if (owner === id) return; // already adopted on an earlier launch
    const keys = (await AsyncStorage.getAllKeys()).filter(isLegacyGameKey);
    if (!keys.length) return;
    const existing = new Set(await AsyncStorage.getAllKeys());
    const pairs = await AsyncStorage.multiGet(keys);
    const copies: [string, string][] = [];
    for (const [k, v] of pairs) {
      if (v == null) continue;
      const scoped = playerKey(k, id);
      if (!existing.has(scoped)) copies.push([scoped, v]);
    }
    if (copies.length) await AsyncStorage.multiSet(copies);
  } catch {
    // A failed copy only means old bests do not carry over. Never block play.
  }
}

/** Called by the auth provider whenever the signed-in player changes. */
export function setGameSavesPlayer(id: string | number | null | undefined): void {
  const next = id == null || id === '' ? null : String(id);
  if (next === playerId) return;
  playerId = next;
  ready = next ? adoptLegacySaves(next) : Promise.resolve();
}

/** The signed-in player's id as the store sees it (tests and captures). */
export function gameSavesPlayer(): string | null {
  return playerId;
}

const playerStorage = {
  /** Whose saves these are ('guest' when signed out). Module caches key on it. */
  owner(): string {
    return playerId ?? 'guest';
  },
  async getItem(key: string): Promise<string | null> {
    await ready;
    return AsyncStorage.getItem(playerKey(key));
  },
  async setItem(key: string, value: string): Promise<void> {
    await ready;
    return AsyncStorage.setItem(playerKey(key), value);
  },
  async removeItem(key: string): Promise<void> {
    await ready;
    return AsyncStorage.removeItem(playerKey(key));
  },
};

export default playerStorage;
