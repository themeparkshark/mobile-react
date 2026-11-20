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
 *
 * The look is set ONCE per launch and never changes while the app is open: a change would swap
 * every open screen's root and lose its scroll, its list and anything typed. The server's answer
 * is saved (AsyncStorage `sticker_look_last`) and read before the first screen draws (Root's
 * splash gate waits on useStickerLookReady), so a new answer takes effect on the next cold start.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onFeatureFlags } from '../../api/endpoints/platform/feature-flags';

/** Key 1: off. Flipped in one update after Dustin sees the new look. */
export const STICKER_LOOK_DEFAULT = false;

/** The server flag's name (key 2). */
export const STICKER_LOOK_FLAG = 'sticker_look';

/** Where the last server answer waits for the next cold start. */
export const STICKER_LOOK_STORE_KEY = 'sticker_look_last';

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

type Store = { readonly getItem: (key: string) => Promise<string | null>; readonly setItem: (key: string, value: string) => Promise<void> };

/**
 * One launch's look (tested with key 1 on). `on()` latches on its first read; `answer()` (each
 * server reply) only saves for the next launch; `hydrate()` reads the saved answer and is needed
 * only when the server can still decide (key 1 on, no override).
 */
export function lookSession(keys: { readonly fallback: boolean; readonly override: boolean }, store: Store) {
  let saved: boolean | undefined;
  let latched: boolean | undefined;
  let lastWritten: boolean | undefined;
  const needsStore = keys.fallback && !keys.override;
  return {
    needsStore,
    async hydrate(): Promise<void> {
      if (!needsStore || latched !== undefined) return;
      try {
        const raw = await store.getItem(STICKER_LOOK_STORE_KEY);
        saved = raw === '1' ? true : raw === '0' ? false : undefined;
      } catch {
        saved = undefined;
      }
    },
    on(): boolean {
      if (latched === undefined) latched = stickerLookFrom({ override: keys.override, fallback: keys.fallback, server: saved });
      return latched;
    },
    answer(next: boolean): void {
      if (next === lastWritten) return;
      lastWritten = next;
      store.setItem(STICKER_LOOK_STORE_KEY, next ? '1' : '0').catch(() => undefined);
    },
  };
}

const session = lookSession({ fallback: STICKER_LOOK_DEFAULT, override: stickerLookOverride() }, AsyncStorage);
try {
  onFeatureFlags(payload => { session.answer(payload?.flags?.[STICKER_LOOK_FLAG] === true); });
} catch {
  // The store is not there (a test harness): the look stays on its defaults.
}

/** Reads the saved server answer once, before the first screen (a no-op while key 1 is off). */
export function hydrateStickerLook(): Promise<void> {
  return session.hydrate();
}

/** The look for this launch: true draws the Sticker Book chrome, false today's. Never changes once read. */
export function stickerLookOn(): boolean {
  return session.on();
}

/** The look for a component: the same answer for the whole launch. */
export function useStickerLook(): boolean {
  return stickerLookOn();
}

/**
 * Root's splash gate: true once the look is known. With key 1 off (or the lane override) it is
 * true on the first render, so today's launch never waits on storage.
 */
export function useStickerLookReady(): boolean {
  const [ready, setReady] = useState(() => !session.needsStore);
  useEffect(() => {
    if (ready) return;
    let live = true;
    void session.hydrate().finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [ready]);
  return ready;
}
