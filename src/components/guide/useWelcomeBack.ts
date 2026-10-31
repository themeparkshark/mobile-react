/**
 * Welcome back (core loop 4.1): the first open after 14 or more days away shows the guide's welcome
 * back state first ("Welcome back! Your Disneyland shelf..."), then the card goes on as usual.
 * The last open is kept per player on the phone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WELCOME_BACK_DAYS } from '../../services/guide/nextCoin';

const KEY = 'tps.guide.lastOpen.v1';
/** The welcome back card holds this long (or until the player taps the card), then the guide goes on. */
export const WELCOME_BACK_HOLD_MS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Pure: whole days between the last open and now (null when there was no last open). */
export function daysBetween(lastOpenAt: number | null, now: number): number | null {
  if (lastOpenAt == null || !Number.isFinite(lastOpenAt) || lastOpenAt > now) return null;
  return Math.floor((now - lastOpenAt) / DAY_MS);
}

export default function useWelcomeBack(playerId: number | null): { daysAway: number | null; done: boolean; finish: () => void } {
  const [daysAway, setDaysAway] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDaysAway(null);
    setDone(false);
    if (playerId == null) return undefined;
    let live = true;
    const key = `${KEY}@p${playerId}`;
    const now = Date.now();
    AsyncStorage.getItem(key).then(raw => {
      if (!live) return;
      setDaysAway(daysBetween(raw ? Number(raw) : null, now));
    }).catch(() => undefined).finally(() => {
      void AsyncStorage.setItem(key, String(now)).catch(() => undefined);
    });
    return () => { live = false; };
  }, [playerId]);
  const welcome = daysAway != null && daysAway >= WELCOME_BACK_DAYS && !done;
  useEffect(() => {
    if (!welcome) return undefined;
    const timer = setTimeout(() => setDone(true), WELCOME_BACK_HOLD_MS);
    return () => clearTimeout(timer);
  }, [welcome]);
  const finish = useCallback(() => setDone(true), []);
  return useMemo(() => ({ daysAway, done, finish }), [daysAway, done, finish]);
}
