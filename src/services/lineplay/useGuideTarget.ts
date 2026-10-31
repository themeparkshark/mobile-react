/**
 * The guide's next coin as React state (core loop 4.1): screens that name it (the LinePlay recap's GO, the Ride
 * logged card's NEXT COIN) re-render when the map's resolver moves the pointer, instead of reading guide.current()
 * once during render. With afterTaskId (the ride just finished) it never names that ride: the guide's resolver
 * picks the next coin without it (guide.nextAfter), so one resolver answers on every screen.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { guide, type GuideTarget } from '../guide/nextCoin';

const subscribe = (listener: () => void) => guide.subscribe(listener);
const snapshot = () => guide.current();

export function useGuideTarget(afterTaskId?: number | null): GuideTarget | null {
  const held = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => (afterTaskId == null ? held : guide.nextAfter(afterTaskId)), [held, afterTaskId]);
}
