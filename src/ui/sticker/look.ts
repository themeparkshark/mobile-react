/**
 * look.ts: the one switch for the Sticker Book look (DIRECTION.md, migration step 6 flips it).
 *
 * Off until Dustin has seen the moved screens. While it is off, every screen that moved onto the
 * kit's LookScreen draws today's Wrapper, Topbar, footer bar, back arrow and "?" exactly as before.
 *
 * On needs both keys, like the studio sound switch:
 *   1. STICKER_LOOK_DEFAULT (this file) flipped to true in one OTA, after his yes;
 *   2. the server flag `sticker_look` (GET /feature-flags, the shared store), so the rollout can
 *      be paused without a release.
 * Lanes and critics see it on with EXPO_PUBLIC_STICKER_LOOK=1, honoured only in dev JS or a muted
 * studio run (EXPO_PUBLIC_STUDIO_MUTE=1, lane bundles). Store and OTA bundles set neither, so a
 * production build without the override always draws today's look.
 */
import { useSyncExternalStore } from 'react';
import { featureFlagsNow, onFeatureFlags } from '../../api/endpoints/platform/feature-flags';

/** Key 1: off. Flipped in one update after Dustin sees the new look. */
export const STICKER_LOOK_DEFAULT = false;

/** The server flag's name (key 2). */
export const STICKER_LOOK_FLAG = 'sticker_look';

function isDev(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/** The lane override: dev JS or a muted lane bundle, and EXPO_PUBLIC_STICKER_LOOK=1 inlined at bundle time. */
export function stickerLookOverride(): boolean {
  if (process.env.EXPO_PUBLIC_STICKER_LOOK !== '1') return false;
  return isDev() || process.env.EXPO_PUBLIC_STUDIO_MUTE === '1';
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
    const now = featureFlagsNow?.();
    return now ? now.flags?.[STICKER_LOOK_FLAG] === true : undefined;
  } catch {
    return undefined;
  }
}
onFeatureFlags?.(payload => {
  const next = payload?.flags?.[STICKER_LOOK_FLAG] === true;
  if (next === server) return;
  server = next;
  listeners.forEach(listener => listener());
});

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
