/**
 * The Shark Shop wishlist as a tiny external store. Each tile subscribes to
 * its own id (useWished), so a heart tap re-renders exactly one tile and the
 * count pill, never the shelves.
 */
import { useSyncExternalStore } from 'react';

type Listener = () => void;

let ids = new Set<number>();
let alerts: boolean | null | undefined;
const listeners = new Set<Listener>();

function emit() { listeners.forEach(l => l()); }

export const wishStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  has(id: number): boolean { return ids.has(id); },
  count(): number { return ids.size; },
  ids(): number[] { return [...ids]; },
  alerts(): boolean | null | undefined { return alerts; },
  /** Replace from the server (shop load). No emit when nothing changed. */
  seed(next: number[], nextAlerts?: boolean | null) {
    const same = next.length === ids.size && next.every(id => ids.has(id));
    alerts = nextAlerts;
    if (same) return;
    ids = new Set(next);
    emit();
  },
  set(id: number, on: boolean) {
    if (ids.has(id) === on) return;
    ids = new Set(ids);
    if (on) ids.add(id); else ids.delete(id);
    emit();
  },
  setAlerts(on: boolean) { alerts = on; },
};

export function useWished(id: number): boolean {
  return useSyncExternalStore(wishStore.subscribe, () => wishStore.has(id));
}

export function useWishCount(): number {
  return useSyncExternalStore(wishStore.subscribe, () => wishStore.count());
}
