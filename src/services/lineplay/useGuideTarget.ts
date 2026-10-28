/**
 * The guide's current target as React state (core loop 4.1): screens that name the next coin (the LinePlay
 * recap's GO, the Ride logged card's NEXT COIN) re-render when the map's resolver moves the pointer,
 * instead of reading guide.current() once during render.
 */
import { useSyncExternalStore } from 'react';
import { guide, type GuideTarget } from '../guide/nextCoin';

const subscribe = (listener: () => void) => guide.subscribe(listener);
const snapshot = () => guide.current();

export function useGuideTarget(): GuideTarget | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
