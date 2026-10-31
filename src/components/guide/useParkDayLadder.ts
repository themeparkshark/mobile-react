/**
 * The map feeds the unlock ladder and records the park day events (core loop blueprint 4.4,
 * "Who records what"). guide-map is the only caller of feedLadder and of the park_day_started,
 * park_day_done and home_day events. The park day record is kept per player on the phone, so a
 * park day closes on the next home-mode open even after the app was closed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { feedLadder, localDay, recordProgress } from '../../services/reveal/revealLadder';
import { EMPTY_PARK_DAY, parkDaySignal, parkDayStep, type ParkDayRecord } from '../../services/guide/parkDay';
import type { GuidePoint } from '../../services/guide/nextCoin';

const KEY = 'tps.parkday.v1';

export interface LadderFeed {
  readonly coinsWon: number;
  readonly levelUpReady: boolean;
  readonly level: number;
  readonly hasTeam: boolean;
  readonly keysHeld: number;
  readonly trailBoxes: number;
  readonly ownsPin: boolean;
  readonly revealAll: boolean;
  readonly inLineNow: boolean;
  /** An event is scheduled for this player (rung 9 needs one). */
  readonly eventScheduled: boolean;
}

export default function useParkDayLadder(input: {
  readonly playerId: number | null;
  readonly mode: 'park' | 'home' | 'unknown';
  readonly parkId: number | null;
  readonly location: GuidePoint | null;
  /** The reading's horizontal accuracy in meters, or null (a far reading then needs a second one in a row). */
  readonly accuracy?: number | null;
  /** Bumped by one for each coin won on this map. */
  readonly winCount: number;
  readonly progress: LadderFeed | null;
  readonly flags: Readonly<Record<string, boolean>>;
}): void {
  const { playerId, mode, parkId, winCount } = input;
  const record = useRef<{ player: number | null; value: ParkDayRecord | null }>({ player: null, value: null });
  const counted = useRef(0);
  const [loaded, setLoaded] = useState(0);

  // Load this player's park day record once.
  useEffect(() => {
    record.current = { player: playerId, value: null };
    counted.current = winCount;
    if (playerId == null) return;
    let live = true;
    AsyncStorage.getItem(`${KEY}@p${playerId}`).then(raw => {
      if (!live || record.current.player !== playerId) return;
      let value: ParkDayRecord = EMPTY_PARK_DAY;
      try { if (raw) value = { ...EMPTY_PARK_DAY, ...JSON.parse(raw) }; } catch { value = EMPTY_PARK_DAY; }
      record.current = { player: playerId, value };
      setLoaded(n => n + 1);
    }).catch(() => { if (live) { record.current = { player: playerId, value: EMPTY_PARK_DAY }; setLoaded(n => n + 1); } });
    return () => { live = false; };
  }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lat = input.location ? Math.round(input.location.latitude * 2000) / 2000 : null;
  const lng = input.location ? Math.round(input.location.longitude * 2000) / 2000 : null;
  useEffect(() => {
    const prev = record.current.value;
    if (playerId == null || record.current.player !== playerId || !prev) return;
    const won = Math.max(0, winCount - counted.current);
    counted.current = winCount;
    const { next, events } = parkDayStep(prev, {
      mode, parkId, location: input.location ?? null, today: localDay(Date.now()), coinsWon: won, accuracy: input.accuracy ?? null,
    });
    record.current = { player: playerId, value: next };
    if (next !== prev) void AsyncStorage.setItem(`${KEY}@p${playerId}`, JSON.stringify(next)).catch(() => undefined);
    for (const event of events) {
      if (event.kind === 'park_day_started') recordProgress('park_day_started', { parkId: event.parkId });
      else if (event.kind === 'home_day') recordProgress('home_day');
      else {
        recordProgress('park_day_done', { parkId: event.parkId });
        parkDaySignal.publish({ parkId: event.parkId, day: event.day, coins: event.coins, at: Date.now() });
      }
    }
  }, [playerId, mode, parkId, lat, lng, winCount, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // The ladder's feed: server progress, the player's switches and the place.
  const progressKey = input.progress ? JSON.stringify(input.progress) : '';
  const flagsKey = JSON.stringify(input.flags);
  useEffect(() => {
    if (playerId == null || !input.progress) return;
    feedLadder({ progress: input.progress, flags: { ...input.flags }, atPark: mode === 'park' });
  }, [playerId, progressKey, flagsKey, mode]); // eslint-disable-line react-hooks/exhaustive-deps
}
