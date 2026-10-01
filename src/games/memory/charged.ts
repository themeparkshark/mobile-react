/**
 * charged.ts: Ride Sprint's charged clock (design v8 4.1, 10.1).
 *
 * The server charges only the player's think time, bounded by its own receive
 * gaps, so a slow park signal never costs a Ticket:
 *
 *   gap_i       = server time from sending reveal i-1 (GO for i = 0) to receiving flip i
 *   think_i     = client_t_i - rx_prev_t, clamped to [0, gap_i] (0 for a pipelined tap)
 *   allowance_i = gap_i - think_i, capped at 1500ms per flip and 12000ms per try
 *   charged_i   = gap_i - allowance_i
 *
 * When the per-try allowance is used up, everything charges at the server gap
 * and the rope's network glint turns orange.
 *
 * Integrity (10.1.5): flips at least 140ms apart on client_t and on server
 * receive, median gap at least 260ms; sessions using more than 8000ms of
 * allowance while the start pings showed RTT under 400ms are flagged (they
 * still pay).
 *
 * Signal Mode: when the median of the 3 start pings is over 2000ms the try
 * runs on a 24-bead turn rope instead of the clock.
 */

export const ALLOWANCE_PER_FLIP_MS = 1500;
export const ALLOWANCE_PER_TRY_MS = 12000;
export const SIGNAL_RTT_MS = 2000;
export const SIGNAL_TURNS = 24;
export const HUMAN_FLOOR_MS = 140;
export const HUMAN_MEDIAN_MS = 260;
export const FLAG_ALLOWANCE_MS = 8000;
export const FLAG_RTT_MS = 400;
/** The rope stops once a reveal has been in flight this long. */
export const PENDING_STOP_MS = 150;

export interface ChargeState {
  chargedMs: number;
  allowanceMs: number;
  flips: number;
  /** Server time the last reveal was sent (GO for the first flip). */
  lastSentAt: number;
  capHit: boolean;
  /** Per-flip records (for integrity and analytics). */
  clientTs: number[];
  recvAts: number[];
}

export function createCharge(goAt: number): ChargeState {
  return { chargedMs: 0, allowanceMs: 0, flips: 0, lastSentAt: goAt, capHit: false, clientTs: [], recvAts: [] };
}

export interface FlipTiming {
  /** Client ms since GO when the tap happened. */
  clientT: number;
  /** Client ms since GO when the previous reveal was rendered (0 for the first flip). */
  rxPrevT: number;
  /** Server receive time of this flip. */
  recvAt: number;
  /** A buffered tap sent before the previous reveal arrived: think time 0. */
  pipelined?: boolean;
}

export interface ChargeResult {
  gap: number;
  think: number;
  allowance: number;
  charged: number;
}

/** Charge one flip, then call `revealSent` when its reveal goes out. */
export function chargeFlip(cs: ChargeState, f: FlipTiming): ChargeResult {
  const gap = Math.max(0, f.recvAt - cs.lastSentAt);
  const think = f.pipelined ? 0 : Math.max(0, Math.min(gap, f.clientT - f.rxPrevT));
  const tryLeft = Math.max(0, ALLOWANCE_PER_TRY_MS - cs.allowanceMs);
  const allowance = Math.max(0, Math.min(gap - think, ALLOWANCE_PER_FLIP_MS, tryLeft));
  const charged = gap - allowance;
  cs.allowanceMs += allowance;
  if (cs.allowanceMs >= ALLOWANCE_PER_TRY_MS) cs.capHit = true;
  cs.chargedMs += charged;
  cs.flips += 1;
  cs.clientTs.push(f.clientT);
  cs.recvAts.push(f.recvAt);
  return { gap, think, allowance, charged };
}

export function revealSent(cs: ChargeState, sentAt: number): void {
  cs.lastSentAt = sentAt;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = xs.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Signal Mode is chosen once, at start, from the 3 start pings. */
export function signalModeFor(pingsMs: number[]): boolean {
  return pingsMs.length > 0 && median(pingsMs) > SIGNAL_RTT_MS;
}

export interface Integrity {
  humanOk: boolean;
  flagged: boolean;
  reasons: string[];
}

export function integrity(cs: ChargeState, startRttMs: number): Integrity {
  const reasons: string[] = [];
  const gapsC: number[] = [];
  const gapsS: number[] = [];
  for (let i = 1; i < cs.clientTs.length; i++) {
    gapsC.push(cs.clientTs[i] - cs.clientTs[i - 1]);
    gapsS.push(cs.recvAts[i] - cs.recvAts[i - 1]);
  }
  if (gapsC.some((g) => g < HUMAN_FLOOR_MS)) reasons.push('client_floor');
  if (gapsS.some((g) => g < HUMAN_FLOOR_MS)) reasons.push('server_floor');
  if (gapsC.length && median(gapsC) < HUMAN_MEDIAN_MS) reasons.push('median');
  const humanOk = reasons.length === 0;
  const flagged = cs.allowanceMs > FLAG_ALLOWANCE_MS && startRttMs < FLAG_RTT_MS;
  if (flagged) reasons.push('allowance_flag');
  return { humanOk, flagged, reasons };
}

// -----------------------------------------------------------------------------
// Latency injectors (tests and the in-process stand-ins)
// -----------------------------------------------------------------------------

export type Latency = (i: number) => number;

export const fixedLatency = (ms: number): Latency => () => ms;

export function jitterLatency(meanMs: number, jitterMs: number, seed = 1): Latency {
  let a = seed >>> 0 || 1;
  return () => {
    a = (Math.imul(a, 1103515245) + 12345) >>> 0;
    return Math.max(0, Math.round(meanMs + ((a / 4294967296) * 2 - 1) * jitterMs));
  };
}

/** Replay a recorded park trace (round-trip ms per flip), looping. */
export function traceLatency(trace: number[]): Latency {
  return (i) => (trace.length ? trace[i % trace.length] : 0);
}

/** A synthetic park LTE trace: mostly 120-400ms with spikes, p95 about 1500ms. */
export const PARK_TRACE_P95_1500: number[] = [
  180, 220, 140, 260, 1500, 210, 300, 160, 240, 380, 200, 1600, 190, 230, 170, 350, 260, 150, 900, 210,
];
