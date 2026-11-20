/**
 * look.ts: the one switch for the Sticker Book look (DIRECTION.md, migration step 6 flips it).
 *
 * Off until Dustin has seen the moved screens. While it is off, every screen that moved onto
 * LookScreen draws today's Wrapper, Topbar, footer bar, back arrow, "?" and currency pills exactly
 * as before, and the kit's parts are never even loaded (LookScreen requires them only when on).
 *
 * On needs both keys, like the studio sound switch:
 *   1. STICKER_LOOK_DEFAULT (this file) flipped to true in one OTA, after his yes;
 *   2. the server flag `sticker_look` in the app's feature-flags store (GET /feature-flags), so the
 *      rollout can be paused without a release.
 * Lanes and critics see it on with EXPO_PUBLIC_STICKER_LOOK=1, honoured only in dev JS (__DEV__).
 * Store and OTA bundles are never dev JS, so a production build without the override always
 * draws today's look.
 */
import { useSyncExternalStore } from 'react';
import { featureFlagsNow, onFeatureFlags } from '../../api/endpoints/platform/feature-flags';

/** Key 1: off. Flipped in one update after Dustin sees the new look. */
export const STICKER_LOOK_DEFAULT = false;

/** The server flag's name (key 2). */
export const STICKER_LOOK_FLAG = 'sticker_look';

function isDev(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/** The lane override: dev JS only, with EXPO_PUBLIC_STICKER_LOOK=1 inlined at bundle time. */
export function stickerLookOverride(): boolean {
  return isDev() && process.env.EXPO_PUBLIC_STICKER_LOOK === '1';
}

/** Pure: the look from its keys (tested). */
export function stickerLookFrom(keys: { readonly override: boolean; readonly fallback: boolean; readonly server: boolean | undefined }): boolean {
  if (keys.override) return true;
  return keys.fallback && keys.server === true;
}

let server: boolean | undefined;
const listeners = new Set<() => void>();
function readServer(): boolean | undefined {
  if (server !== undefined) return server;
  try {
    const now = featureFlagsNow();
    return now ? now.flags?.[STICKER_LOOK_FLAG] === true : undefined;
  } catch {
    return undefined;
  }
}
try {
  onFeatureFlags(payload => {
    const next = payload?.flags?.[STICKER_LOOK_FLAG] === true;
    if (next === server) return;
    server = next;
    // Only an answer that can change the look wakes the screens (key 1 off: nothing ever changes).
    if (STICKER_LOOK_DEFAULT || stickerLookOverride()) listeners.forEach(listener => listener());
  });
} catch {
  // The store is not there (a test harness): the look stays on its defaults.
}

/** The look now: true draws the Sticker Book chrome, false today's. */
export function stickerLookOn(): boolean {
  return stickerLookFrom({ override: stickerLookOverride(), fallback: STICKER_LOOK_DEFAULT, server: readServer() });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The look for a component; a later server answer changes it in place (only once key 1 is on). */
export function useStickerLook(): boolean {
  return useSyncExternalStore(subscribe, stickerLookOn, stickerLookOn);
}
