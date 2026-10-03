/**
 * Shared friend answers for this session. When a player says Yes in the bell,
 * the Friends screen, the profile and every row agree at once without a
 * refetch. Snapshots are immutable so React only re-renders when something
 * actually changed.
 */
import { useSyncExternalStore } from 'react';
import type { FriendStatus } from './socialModel';

type Listener = () => void;

let overrides: ReadonlyMap<number, FriendStatus> = new Map();
/** Requests waiting on me, as last known (null until the first load). */
let pendingIncoming: number | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getOverrides(): ReadonlyMap<number, FriendStatus> {
  return overrides;
}

export function setStatus(id: number, status: FriendStatus): void {
  if (overrides.get(id) === status) return;
  const next = new Map(overrides);
  next.set(id, status);
  overrides = next;
  emit();
}

/** Drop a local answer (an undo, or the server confirmed something else). */
export function clearStatus(id: number): void {
  if (!overrides.has(id)) return;
  const next = new Map(overrides);
  next.delete(id);
  overrides = next;
  emit();
}

export function getPendingIncoming(): number | null {
  return pendingIncoming;
}

export function setPendingIncoming(count: number | null): void {
  const value = count == null ? null : Math.max(0, Math.round(count));
  if (value === pendingIncoming) return;
  pendingIncoming = value;
  emit();
}

/** Nudge the waiting-requests count after an answer (never below zero). */
export function adjustPendingIncoming(delta: number): void {
  if (pendingIncoming == null) return;
  setPendingIncoming(pendingIncoming + delta);
}

/** Sign-out and tests. */
export function resetSocialStore(): void {
  overrides = new Map();
  pendingIncoming = null;
  emit();
}

export function useFriendOverrides(): ReadonlyMap<number, FriendStatus> {
  return useSyncExternalStore(subscribe, getOverrides, getOverrides);
}

export function usePendingIncoming(): number | null {
  return useSyncExternalStore(subscribe, getPendingIncoming, getPendingIncoming);
}
