/**
 * Banana HapticBus (design section 9): at most one haptic per 80 ms, with
 * priority preemption.
 *
 *  - Window free: the request fires now.
 *  - Window busy: a request that outranks the one that fired is deferred to
 *    the end of the window (one pending slot; a higher request replaces a
 *    lower pending one). Everything else is dropped, so a late catch buzz
 *    never happens but a puffer tell or hit is always felt.
 *  - Multi-pulse patterns own their window for their whole span.
 *
 * Pure scheduling (node-tested). The game fires through GameKit primitives.
 */

export type BbPrim = 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export interface BbPulse {
  at: number;
  p: BbPrim;
}

export const HB_WINDOW_MS = 80;

// Priorities (design 9): puffer hit > threat tell > coin/Golden Hour/TIME >
// tier-up/Gold Ball > PERFECT/SAVE > Ball Pop/BONK/CLOSE > catch > bounce.
export const HB_BOUNCE = 0;
export const HB_CATCH = 1;
export const HB_POP = 2;
export const HB_PERFECT = 3;
export const HB_TIER = 4;
export const HB_COIN = 5;
export const HB_TELL = 6;
export const HB_HIT = 7;

export interface HapticBusState {
  lastAt: number;
  lastPri: number;
  busyUntil: number;
  pendPri: number;
  pendToken: number;
  token: number;
  fired: number;
  dropped: number;
}

export function createHapticBus(): HapticBusState {
  return { lastAt: -1e9, lastPri: -1, busyUntil: -1e9, pendPri: -1, pendToken: 0, token: 0, fired: 0, dropped: 0 };
}

export interface BusDecision {
  /** 'now' fire immediately, 'later' fire at `at` if the token is still current, 'drop'. */
  kind: 'now' | 'later' | 'drop';
  at: number;
  token: number;
}

export function request(bus: HapticBusState, now: number, pri: number, spanMs = 0): BusDecision {
  const free = now >= bus.busyUntil && bus.pendPri < 0;
  if (free) {
    fireAt(bus, now, pri, spanMs);
    return { kind: 'now', at: now, token: 0 };
  }
  // Tells and hits always queue behind the window (never dropped for a same-rank buzz).
  const outranks = pri > bus.pendPri && (pri > bus.lastPri || pri >= HB_TELL);
  if (!outranks) {
    bus.dropped += 1;
    return { kind: 'drop', at: now, token: 0 };
  }
  if (bus.pendPri >= 0) bus.dropped += 1;
  bus.token += 1;
  bus.pendPri = pri;
  bus.pendToken = bus.token;
  return { kind: 'later', at: Math.max(now, bus.busyUntil), token: bus.token };
}

/** The deferred slot came due: returns true when it should fire now. */
export function firePending(bus: HapticBusState, token: number, now: number, spanMs = 0): boolean {
  if (token !== bus.pendToken || bus.pendPri < 0) return false;
  const pri = bus.pendPri;
  bus.pendPri = -1;
  fireAt(bus, now, pri, spanMs);
  return true;
}

function fireAt(bus: HapticBusState, now: number, pri: number, spanMs: number): void {
  bus.lastAt = now;
  bus.lastPri = pri;
  bus.busyUntil = now + Math.max(HB_WINDOW_MS, spanMs + HB_WINDOW_MS);
  bus.fired += 1;
  if (bus.pendPri >= 0 && pri >= bus.pendPri) bus.pendPri = -1;
}

/** Forget the window (after a freeze or a set card). */
export function resetBus(bus: HapticBusState): void {
  bus.lastAt = -1e9;
  bus.lastPri = -1;
  bus.busyUntil = -1e9;
  bus.pendPri = -1;
}
