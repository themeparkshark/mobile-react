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
import { isFirstCoinToday } from './firstCoinToday';

const KEY = (playerId: number) => `tps.firstCoinToday.v1:${playerId}`;

if (__DEV__) {
  // QA: celebrate the next coin again (lane.sh eval 'globalThis.__tpsFirstCoinReset()').
  (globalThis as Record<string, unknown>).__tpsFirstCoinReset = () => { devReset?.(); return 'reset'; };
}
let devReset: (() => void) | null = null;

export default function useFirstCoinToday({ playerId, free }: {
  readonly playerId: number | null | undefined;
  /** No other big moment (arrival, chest, catch, flight, dialog) is on screen. */
  readonly free: boolean;
}): { readonly noteCollected: () => void; readonly layer: ReactNode; readonly showing: boolean } {
  const stored = useRef<string | null | undefined>(undefined);
  const [queued, setQueued] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);

  useEffect(() => {
    stored.current = undefined;
    if (!playerId) return undefined;
    let active = true;
    void AsyncStorage.getItem(KEY(playerId)).then(value => { if (active) stored.current = value; })
      .catch(() => { if (active) stored.current = null; });
    devReset = () => { stored.current = null; void AsyncStorage.removeItem(KEY(playerId)).catch(() => undefined); };
    return () => { active = false; devReset = null; };
  }, [playerId]);

  const noteCollected = useCallback(() => {
    if (!playerId || stored.current === undefined) return;
    const today = parkDayKey(new Date());
    if (!isFirstCoinToday(stored.current, today)) return;
    // Marked first, so a quick exit never replays it.
    stored.current = today;
    void AsyncStorage.setItem(KEY(playerId), today).catch(() => undefined);
    setQueued(true);
  }, [playerId]);

  useEffect(() => {
    if (!queued || !free || playing) return undefined;
    // The 300 ms gap between celebrations.
    const timer = setTimeout(() => { setQueued(false); setPlaying(Date.now()); }, 300);
    return () => clearTimeout(timer);
  }, [queued, free, playing]);

  const layer = playing ? (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 58 }]}>
      <FirstCoinRibbon key={playing} onDone={() => setPlaying(null)} />
    </View>
  ) : null;
  return { noteCollected, layer, showing: !!playing || queued };
}
