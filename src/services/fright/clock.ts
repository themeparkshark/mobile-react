/**
 * R5: the server clock is authoritative. Every /parks/{id}/fright response
 * carries `server_now`; the app keeps `offset = server_now - request midpoint`
 * and runs all phase math on `Date.now() + offset`. The offset is re-derived on
 * every fetch. A phone clock moved forward or back between fetches is caught by
 * comparing the wall clock to a monotonic clock (performance.now()): a drift of
 * more than 2 minutes forces a refetch, so a tampered clock never unlocks
 * anything (and the server rechecks every write anyway). Pure.
 */
import { FRIGHT_DEFAULTS } from './config';

/** Offset in ms to add to the phone clock, or null when the payload is unusable. */
export function clockOffset(serverNowIso: string | null | undefined, sentAt: number, receivedAt: number): number | null {
  if (!serverNowIso) return null;
  const server = Date.parse(serverNowIso);
  if (!Number.isFinite(server) || !Number.isFinite(sentAt) || !Number.isFinite(receivedAt) || receivedAt < sentAt) return null;
  return Math.round(server - (sentAt + receivedAt) / 2);
}

export function serverNow(offset: number | null | undefined, deviceNow: number = Date.now()): number {
  return deviceNow + (offset ?? 0);
}

export interface ClockBaseline {
  /** Phone wall clock at the fetch. */
  readonly wall: number;
  /** Monotonic clock (performance.now()) at the fetch. */
  readonly mono: number;
}

/** True when the wall clock moved more than the monotonic clock allows (tamper, or a long sleep): refetch. */
export function clockJumped(baseline: ClockBaseline | null, wallNow: number, monoNow: number,
  limitMs: number = FRIGHT_DEFAULTS.clockJumpMs): boolean {
  if (!baseline || !Number.isFinite(monoNow) || !Number.isFinite(wallNow)) return false;
  const drift = (wallNow - baseline.wall) - (monoNow - baseline.mono);
  return Math.abs(drift) > limitMs;
}

/** Monotonic ms, or NaN where unavailable (then the jump check is skipped). */
export function monoNow(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof perf?.now === 'function' ? perf.now() : NaN;
}
