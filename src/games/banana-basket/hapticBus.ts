/**
 * Banana HapticBus (design 9.1) on the engine's priority bus (banana preset):
 * at most 12 per second (84 ms spacing); priority notification Error > impact
 * Heavy > notification Success/Warning > impact Medium > impact Light >
 * selection; a lower request within 50 ms of a higher one is dropped; a
 * higher one preempts a queued lower one (queued at most 30 ms).
 *
 * The x3-x4 on-beat rule (9.1, B-9): a catch gets impact Light only within
 * +/- 2 steps of a beat; off-beat catches get no haptic.
 *
 * Pure scheduling (node-tested). The game fires through GameKit primitives.
 */

import {
  BUS_DROP, BUS_FIRE, busDue, busOffer, busStats, createHapticBus as createEngineBus, type HapticBusState,
} from '../../gamekit/core/hapticBus';

export type BbPrim = 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

/** Design 9.1 ladder on the engine bus scale (higher wins). */
export const BB_PRIORITY: Record<BbPrim, number> = {
  selection: 1,
  light: 2,
  medium: 3,
  success: 4,
  warning: 4,
  heavy: 5,
  error: 6,
};

export interface BananaBus {
  bus: HapticBusState;
}

export function createHapticBus(): BananaBus {
  return { bus: createEngineBus('banana') };
}

export interface BusDecision {
  kind: 'now' | 'later' | 'drop';
  at: number;
}

/** Offer one haptic (the first pulse of a pattern decides). */
export function request(b: BananaBus, now: number, prim: BbPrim): BusDecision {
  const r = busOfferPrim(b, now, prim);
  if (r === BUS_FIRE) return { kind: 'now', at: now };
  if (r === BUS_DROP) return { kind: 'drop', at: now };
  return { kind: 'later', at: b.bus.queue ? b.bus.queue.dueAt : now };
}

function busOfferPrim(b: BananaBus, now: number, prim: BbPrim): number {
  return busOffer(b.bus, now, { priority: BB_PRIORITY[prim], strength: BB_PRIORITY[prim], payload: prim });
}

/** A queued haptic that came due (or null). */
export function due(b: BananaBus, now: number): BbPrim | null {
  const r = busDue(b.bus, now);
  return r ? (r.payload as BbPrim) : null;
}

/** Forget the window (after a freeze or a set card). */
export function resetBus(b: BananaBus): void {
  b.bus.lastAt = -1e9;
  b.bus.lastPriority = -1;
  b.bus.queue = null;
  b.bus.recent = [];
}

export function stats(b: BananaBus) {
  return busStats(b.bus);
}

/** 9.1: x3+ catches buzz only on the beat (within +/- 2 steps); x1-x2 get selection. */
export function catchHaptic(tier: number, onBeat: boolean, perfect: boolean): BbPrim | null {
  if (perfect) return 'light';
  if (tier <= 2) return 'selection';
  return onBeat ? 'light' : null;
}

/** The 9.1 table (doc-sync checks it against the design). */
export const HAPTIC_TABLE: [string, string][] = [
  ['CATCH x1-x2', 'selection'],
  ['CATCH x3-x4', 'impact Light only if within ±2 steps of a beat; off-beat none'],
  ['PERFECT', 'impact Light'],
  ['Bunch, POP, BONK, coin pip', 'impact Medium'],
  ['Lucky Bunch POP', 'Medium + Light at +90 ms'],
  ['Tier-up, gate unlock', 'notification Success'],
  ['Star notch passed', 'impact Light'],
  ['Ball bounce', 'selection on bounces 1-3 of each life and on Gold Ball bounces'],
  ['Pail save', 'impact Light'],
  ['Puffer tell / gull tell', 'impact Light / selection x2 (60 ms apart)'],
  ['Puffer hit', 'notification Error'],
  ['Parked shield', 'selection'],
  ['Gull steal', 'notification Warning'],
  ['CLOSE CALL', 'impact Light'],
  ['Golden Hour start', 'Heavy, then Light at +120 and +240 ms'],
  ['Set end', 'impact Medium'],
  ['Heat GO', 'impact Medium; heat podium top 3: notification Success'],
  ['Finale catch, TIME!, each star slam', 'Heavy'],
  ['Ride win', 'notification Success'],
  ['"Line\'s moving" chip', 'one Light'],
];
