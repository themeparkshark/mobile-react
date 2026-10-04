/**
 * Fixed marker slot pools for the game map. Pure (slot assignment), unit
 * tested (map-declutter-stability).
 *
 * MapLibre crashes when MapView children mount, unmount or reorder mid-list
 * (-[MLRNMapView insertReactSubview:atIndex:]). Finds spawn and expire all
 * day, so each kind gets a pool of slots allocated once: a find keeps its slot
 * while it lives, a new one takes a free slot, and an empty slot stays mounted
 * as a hidden, parked marker. Only what a slot draws changes.
 */
import { useEffect, useRef, useState } from 'react';
import { soakLog, SOAK_TRACE } from './declutter/soakLog';

/** Slots per kind: more than a park ever shows at once. */
export const SLOTS = {
  rides: 80,
  coins: 24,
  keys: 8,
  redeemables: 8,
  items: 8,
  pins: 8,
  vaults: 4,
  swords: 8,
} as const;

/** A freed slot rests this long before a new id may take it: the old art's fade (280 ms) plus a frame. */
export const SLOT_COOL_MS = 400;

/**
 * Keep each id in its slot while it is present; new ids take the lowest free
 * slots in the order given; ids past the pool size wait for a free slot.
 *
 * A slot vacated in this pass, or listed in `cooling` (vacated moments ago), is
 * never taken: the new id waits for a rested slot (the hook re-renders when one
 * rests). Reusing it at once moves one native marker view to a new coordinate in
 * the same frame its content swaps, and iOS can show one frame of the old art at
 * the new spot (the soak's 1-frame blip, traced to direct reuse in a full pool).
 */
export function assignSlots(previous: readonly (string | null)[], ids: readonly string[], size: number,
  cooling: ReadonlySet<number> = new Set()): (string | null)[] {
  const present = new Set(ids);
  const resting = new Set(cooling);
  const slots: (string | null)[] = Array.from({ length: size }, (_, i) => {
    const id = previous[i] ?? null;
    if (id !== null && !present.has(id)) resting.add(i);
    return id !== null && present.has(id) ? id : null;
  });
  const placed = new Set(slots.filter((id): id is string => id !== null));
  const freeSlot = () => {
    for (let i = 0; i < size; i++) if (slots[i] === null && !resting.has(i)) return i;
    return -1;
  };
  for (const id of ids) {
    if (placed.has(id)) continue;
    const free = freeSlot();
    if (free < 0) break;
    slots[free] = id;
    placed.add(id);
  }
  return slots;
}

/** A fixed pool of `size` slots for these items (stable across renders): item or null per slot. */
export function useMarkerSlots<T>(items: readonly T[], keyOf: (item: T) => string, size: number, label = 'slots'): (T | null)[] {
  const previous = useRef<(string | null)[]>([]);
  const freedAt = useRef<number[]>([]);
  const byKey = new Map(items.map(item => [keyOf(item), item]));
  const now = Date.now();
  const cooling = new Set<number>();
  freedAt.current.forEach((at, i) => { if (at && now - at < SLOT_COOL_MS) cooling.add(i); });
  const slots = assignSlots(previous.current, [...byKey.keys()], size, cooling);
  for (let i = 0; i < size; i++) {
    const was = previous.current[i] ?? null, is = slots[i];
    if (was === is) continue;
    if (was !== null) freedAt.current[i] = now;
    if (SOAK_TRACE) soakLog(`${label} slot ${i}: ${was ?? '-'} -> ${is ?? '-'}${was !== null && is !== null ? ' (direct reuse)' : ''}`);
  }
  previous.current = slots;
  // An id waiting on a resting slot: render again once the slot has rested.
  const [, wake] = useState(0);
  const waiting = byKey.size > slots.filter(id => id !== null).length && slots.some(id => id === null);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => wake(n => n + 1), SLOT_COOL_MS + 16);
    return () => clearTimeout(timer);
  });
  return slots.map(id => (id === null ? null : byKey.get(id) ?? null));
}
