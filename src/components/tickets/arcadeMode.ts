/**
 * Whether the server runs the arcade economy (Nov 20 2026, CONTRACTS.md section 0): Tickets are spent on
 * every play, win or lose, by ride price; a loss pays Ride Parts. Read from the shared feature flags
 * (`arcade_economy`) and from any attempt answer (`arcade: true`). Today's server sends neither, so every
 * screen keeps today's behavior there.
 */
import { useSyncExternalStore } from 'react';
import getFeatureFlags, { onFeatureFlags } from '../../api/endpoints/platform/feature-flags';

let fromFlags = false;
let fromAnswer = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => { try { fn(); } catch { /* keep going */ } });

function setFlags(raw: unknown) {
  const next = !!raw && typeof raw === 'object' && (raw as Record<string, unknown>).arcade_economy === true;
  if (next !== fromFlags) { fromFlags = next; emit(); }
}

onFeatureFlags?.(payload => setFlags(payload?.flags));
let read: Promise<void> | null = null;
function ensureRead() {
  read ??= getFeatureFlags().then(payload => setFlags(payload?.flags)).catch(() => { read = null; });
}

/** An attempt answer said arcade (true) or not: the server's own word wins over the flag read. */
export function noteArcadeAnswer(answer: { arcade?: unknown } | null | undefined) {
  if (!answer || typeof answer.arcade !== 'boolean') return;
  if (answer.arcade !== fromAnswer) { fromAnswer = answer.arcade; emit(); }
}

export function arcadeEconomyNow(): boolean {
  ensureRead();
  return fromFlags || fromAnswer;
}

export function useArcadeEconomy(): boolean {
  return useSyncExternalStore(fn => { listeners.add(fn); ensureRead(); return () => { listeners.delete(fn); }; },
    arcadeEconomyNow, arcadeEconomyNow);
}
