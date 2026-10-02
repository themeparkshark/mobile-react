/**
 * calibration: per-device timing offsets shared by Rhythm, Boss, Trivia and
 * Current Quest.
 *
 * - audioLatencyMs: output latency (tap-to-sound). Telegraph cues are started
 *   this much early; haptics aligned to audio are delayed by it.
 * - inputOffsetMs: how early or late this player taps against the audio. It is
 *   subtracted from touch times before judging (positive = taps late).
 * - Stored per audio route (speaker, wired, Bluetooth), because Bluetooth adds
 *   150-250 ms.
 *
 * Grading still uses sim time only. Calibration moves when things are HEARD
 * and how taps are READ, never the server's rules.
 *
 * Pure. Persistence is in session/calibrationStore.ts.
 */

export interface Calibration {
  route: string;
  audioLatencyMs: number;
  inputOffsetMs: number;
  /** Spread (MAD, ms) of the last calibration taps; lower = more trustworthy. */
  spreadMs: number;
  samples: number;
  updatedAt: number;
}

export const DEFAULT_ROUTE_LATENCY: Record<string, number> = {
  speaker: 20,
  wired: 15,
  bluetooth: 180,
  airplay: 250,
  unknown: 40,
};

export function defaultCalibration(route = 'speaker', backend: 'audio-api' | 'expo-av' = 'audio-api'): Calibration {
  const base = DEFAULT_ROUTE_LATENCY[route] ?? DEFAULT_ROUTE_LATENCY.unknown;
  return {
    route,
    audioLatencyMs: base + (backend === 'expo-av' ? 60 : 0),
    inputOffsetMs: 0,
    spreadMs: 0,
    samples: 0,
    updatedAt: 0,
  };
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 ? sorted[(n - 1) >> 1] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/**
 * Robust offset from calibration tap errors (tap time minus beat time, ms).
 * Drops the outer 20% on each side, takes the median, and reports the MAD.
 * Needs at least 6 taps; returns null when the taps are too scattered to
 * trust (MAD over `maxSpreadMs`).
 */
export function estimateOffset(errorsMs: readonly number[], maxSpreadMs = 45): { offsetMs: number; spreadMs: number; used: number } | null {
  if (errorsMs.length < 6) return null;
  const s = [...errorsMs].sort((a, b) => a - b);
  const cut = Math.floor(s.length * 0.2);
  const kept = s.slice(cut, s.length - cut);
  const m = median(kept);
  const mad = median(kept.map((e) => Math.abs(e - m)).sort((a, b) => a - b));
  if (mad > maxSpreadMs) return null;
  return { offsetMs: Math.round(m), spreadMs: Math.round(mad * 10) / 10, used: kept.length };
}

/** Fold a new estimate in (weighted by sample count, capped so it keeps adapting). */
export function applyEstimate(cal: Calibration, est: { offsetMs: number; spreadMs: number; used: number }, now: number): Calibration {
  const w0 = Math.min(cal.samples, 40);
  const w1 = est.used;
  const offset = (cal.inputOffsetMs * w0 + est.offsetMs * w1) / (w0 + w1);
  return {
    ...cal,
    inputOffsetMs: Math.round(offset),
    spreadMs: est.spreadMs,
    samples: cal.samples + est.used,
    updatedAt: now,
  };
}

/** Touch time corrected for this player's habit (worklet-safe). */
export function correctedTouchMs(touchMs: number, inputOffsetMs: number): number {
  'worklet';
  return touchMs - inputOffsetMs;
}

/** When to START a cue so it is HEARD at `targetMs` (never before `nowMs`). */
export function cueStartMs(targetMs: number, nowMs: number, audioLatencyMs: number): number {
  'worklet';
  return Math.max(nowMs, targetMs - audioLatencyMs);
}
