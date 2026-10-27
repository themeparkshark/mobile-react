/**
 * Batched mounting of ride island art on the game map.
 *
 * Each ride slot is a map marker that is always mounted (MapView children never mount or unmount:
 * MapLibre's insertReactSubview crash). Until a slot first gets a ride it draws one bare box; its art
 * (about a dozen views and six UI-thread animated styles) mounts the first time it has a ride, and
 * then stays mounted for good. Those first mounts run a few islands per frame, never 80 in one
 * commit: a profile of the launch showed the map screen's first commit holding the main thread for
 * 2 s or more (UI-thread style setup and native view creation), which froze the launch bar.
 * Pure JS, no native change.
 */
import { useEffect, useRef, useState } from 'react';
import { useCoverArt } from '../../components/map/mapCover';

/** Islands whose art may mount in one frame. */
export const ISLANDS_PER_FRAME = 8;

/** The ten nearest islands hold the loading cover (ranks are exact below ALIVE_RANK_LIMIT, 10); the rest are off screen. */
export const HOLD_RANKS = 10;

type Waiting = { readonly go: () => void; readonly rank: number };
/** Nearest first: the islands a kid sees on the first map frame mount in the first batches. */
const waiting: Waiting[] = [];
let pumping = false;

function nextFrame(fn: () => void) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn());
  else setTimeout(fn, 0);
}

function pump() {
  pumping = false;
  const batch = waiting.splice(0, ISLANDS_PER_FRAME);
  batch.forEach(item => item.go());
  if (waiting.length > 0) schedule();
}

function schedule() {
  if (pumping) return;
  pumping = true;
  nextFrame(pump);
}

/**
 * Queue one island's first mount, nearest first (rank: 0 is nearest the player); the returned
 * function takes it out of the queue again.
 */
export function queueIslandMount(go: () => void, rank = Number.MAX_SAFE_INTEGER): () => void {
  const item: Waiting = { go, rank };
  let at = waiting.length;
  while (at > 0 && waiting[at - 1].rank > rank) at--;
  waiting.splice(at, 0, item);
  schedule();
  return () => {
    const i = waiting.indexOf(item);
    if (i >= 0) waiting.splice(i, 1);
  };
}

/** Tests only: how many islands still wait for their turn. */
export function islandsWaiting(): number {
  return waiting.length;
}

/**
 * True once this slot's art has mounted. It turns true a frame or so after the slot first has a
 * ride (in turn with the other islands) and never turns false again.
 */
export function useIslandMount(hasRide: boolean, rank = Number.MAX_SAFE_INTEGER): boolean {
  const [mounted, setMounted] = useState(false);
  // Under the map's loading cover, the lift waits (never past its hard cap) until the islands near
  // the player have their art, so the first lifted frame never shows them popping in. Far islands
  // (off screen) mount right after, nearest first.
  useCoverArt(hasRide && !mounted && rank < HOLD_RANKS);
  const rankRef = useRef(rank);
  rankRef.current = rank;
  useEffect(() => {
    if (mounted || !hasRide) return undefined;
    return queueIslandMount(() => setMounted(true), rankRef.current);
  }, [mounted, hasRide]);
  return mounted;
}
