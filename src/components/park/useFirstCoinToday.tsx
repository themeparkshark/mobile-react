/**
 * The first real coin of the local day: after the catch (or the ride coin's
 * flight home) has finished, a sunrise sweep crosses the map and a "First coin
 * today!" ribbon slides down with Finn's cheer. Once per player per local day
 * (stored per player), only from a real collection, and only while no other
 * big moment is on screen (it waits its turn, never stacks).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import FirstCoinRibbon from './FirstCoinRibbon';
import { parkDayKey } from './parkArrival';
import { firstCoinVariant, isFirstCoinToday } from './firstCoinToday';

const KEY = (playerId: number) => `tps.firstCoinToday.v1:${playerId}`;
/** How many days have had a first-coin ribbon (the fourth and later play the short one). */
const DAYS_KEY = (playerId: number) => `tps.firstCoinToday.days.v1:${playerId}`;

if (__DEV__) {
  // QA: celebrate the next coin again (lane.sh eval 'globalThis.__tpsFirstCoinReset()'); pass a day count to pick
  // the ribbon (__tpsFirstCoinReset(3) makes the next one the short repeat).
  (globalThis as Record<string, unknown>).__tpsFirstCoinReset = (daysSoFar?: number) => { devReset?.(daysSoFar); return 'reset'; };
}
let devReset: ((daysSoFar?: number) => void) | null = null;

export default function useFirstCoinToday({ playerId, free }: {
  readonly playerId: number | null | undefined;
  /** No other big moment (arrival, chest, catch, flight, dialog) is on screen. */
  readonly free: boolean;
}): {
  readonly noteCollected: () => void;
  /**
   * For a coin that is about to fly home: the ribbon it gets ('full' for the first few days, then 'short') when it is
   * the first of the day (and marks it), or false.
   */
  readonly claim: () => 'full' | 'short' | false;
  readonly layer: ReactNode;
  readonly showing: boolean;
} {
  const stored = useRef<string | null | undefined>(undefined);
  const days = useRef(0);
  const [queued, setQueued] = useState<'full' | 'short' | false>(false);
  const [playing, setPlaying] = useState<{ key: number; short: boolean } | null>(null);

  useEffect(() => {
    stored.current = undefined;
    if (!playerId) return undefined;
    let active = true;
    void AsyncStorage.getItem(DAYS_KEY(playerId)).then(raw => {
      const n = Number(raw);
      if (active) days.current = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }).catch(() => undefined).finally(() => AsyncStorage.getItem(KEY(playerId)).then(value => { if (active) stored.current = value; })
      .catch(() => { if (active) stored.current = null; }));
    devReset = (daysSoFar?: number) => {
      stored.current = null;
      if (typeof daysSoFar === 'number') days.current = daysSoFar;
      void AsyncStorage.removeItem(KEY(playerId)).catch(() => undefined);
    };
    return () => { active = false; devReset = null; };
  }, [playerId]);

  const claim = useCallback((): 'full' | 'short' | false => {
    if (!playerId || stored.current === undefined) return false;
    const today = parkDayKey(new Date());
    if (!isFirstCoinToday(stored.current, today)) return false;
    // Marked first, so a quick exit never replays it.
    stored.current = today;
    days.current += 1;
    void AsyncStorage.setItem(KEY(playerId), today).catch(() => undefined);
    void AsyncStorage.setItem(DAYS_KEY(playerId), String(days.current)).catch(() => undefined);
    return firstCoinVariant(days.current);
  }, [playerId]);
  const noteCollected = useCallback(() => { const kind = claim(); if (kind) setQueued(kind); }, [claim]);

  useEffect(() => {
    if (!queued || !free || playing) return undefined;
    // The 300 ms gap between celebrations.
    const timer = setTimeout(() => { setQueued(false); setPlaying({ key: Date.now(), short: queued === 'short' }); }, 300);
    return () => clearTimeout(timer);
  }, [queued, free, playing]);

  const layer = playing ? (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 58 }]}>
      <FirstCoinRibbon key={playing.key} short={playing.short} onDone={() => setPlaying(null)} />
    </View>
  ) : null;
  return { noteCollected, claim, layer, showing: !!playing || !!queued };
}
