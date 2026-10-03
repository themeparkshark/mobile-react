/**
 * Shared friend answers for this session. When a player says Yes in the bell,
 * the Friends screen, the profile and every row agree at once without a
 * refetch. Snapshots are immutable so React only re-renders when something
 * actually changed.
 */
import { createContext, useSyncExternalStore } from 'react';
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

// ---- Moments: a friendship just made here, played once by whichever row shows it.
const justFriended = new Map<number, { at: number; surface: string }>();
const CELEBRATE_MS = 2500;

/** Where the Yes was tapped (a screen or tab): only that surface celebrates. */
export const SurfaceContext = createContext<string>('app');

export function markJustFriended(id: number, surface: string, now: number = Date.now()): void {
  justFriended.set(id, { at: now, surface });
}

/** True once per new friendship, on the surface that made it (hidden tabs and recycled rows never replay it). */
export function takeJustFriended(id: number, surface: string, now: number = Date.now()): boolean {
  const entry = justFriended.get(id);
  if (!entry || entry.surface !== surface) return false;
  justFriended.delete(id);
  return now - entry.at < CELEBRATE_MS;
}

// ---- Hearts sent today, per signed-in player and local day.
let heartKey = '';
const heartsSent = new Set<number>();

function localDay(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function heartScope(viewerId: number | null | undefined, now: Date): void {
  const key = `${viewerId ?? 0}|${localDay(now)}`;
  if (key !== heartKey) { heartKey = key; heartsSent.clear(); }
}

export function wasHearted(viewerId: number | null | undefined, id: number, now: Date = new Date()): boolean {
  heartScope(viewerId, now);
  return heartsSent.has(id);
}

export function setHearted(viewerId: number | null | undefined, id: number, sent: boolean, now: Date = new Date()): void {
  heartScope(viewerId, now);
  if (sent) heartsSent.add(id); else heartsSent.delete(id);
}

/** Sign-out and tests. */
export function resetSocialStore(): void {
  overrides = new Map();
  pendingIncoming = null;
  justFriended.clear();
  heartsSent.clear();
  heartKey = '';
  emit();
}

export function useFriendOverrides(): ReadonlyMap<number, FriendStatus> {
  return useSyncExternalStore(subscribe, getOverrides, getOverrides);
}

export function usePendingIncoming(): number | null {
  return useSyncExternalStore(subscribe, getPendingIncoming, getPendingIncoming);
}
