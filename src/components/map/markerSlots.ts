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
import { useRef } from 'react';

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

/**
 * Keep each id in its slot while it is present; new ids take the lowest free
 * slots in the order given; ids past the pool size wait for a free slot.
 */
export function assignSlots(previous: readonly (string | null)[], ids: readonly string[], size: number): (string | null)[] {
  const present = new Set(ids);
  const slots: (string | null)[] = Array.from({ length: size }, (_, i) => {
    const id = previous[i] ?? null;
    return id !== null && present.has(id) ? id : null;
  });
  const placed = new Set(slots.filter((id): id is string => id !== null));
  let free = 0;
  for (const id of ids) {
    if (placed.has(id)) continue;
    while (free < size && slots[free] !== null) free++;
    if (free >= size) break;
    slots[free] = id;
    placed.add(id);
  }
  return slots;
}

/** A fixed pool of `size` slots for these items (stable across renders): item or null per slot. */
export function useMarkerSlots<T>(items: readonly T[], keyOf: (item: T) => string, size: number): (T | null)[] {
  const previous = useRef<(string | null)[]>([]);
  const byKey = new Map(items.map(item => [keyOf(item), item]));
  const slots = assignSlots(previous.current, [...byKey.keys()], size);
  previous.current = slots;
  return slots.map(id => (id === null ? null : byKey.get(id) ?? null));
}
