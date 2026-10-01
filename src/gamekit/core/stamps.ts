/**
 * stamps.ts: bubble-letter stamps (pure pose maths + the FIFO queue).
 *
 * Every design has a "slam a word onto the screen" beat with the same shape
 * and different numbers:
 *   - Sharky: slam 1.4 -> 1.0 over 140 ms outBack(1.7) with a squash frame,
 *     380 ms hold, 12 pt drift up; ONE at a time, FIFO.
 *   - Trivia: 2.2 -> 1.0 in 120 ms, exits up 40 pt within the stage band.
 *   - Line Party: SNATCHED 1.8 -> 1.0 in 120 ms easeOutBack; social pops one
 *     at a time, 600 ms apart, dropped after 2 s.
 *   - Whack combo slab: -12 deg tilt, slams in at the last hit.
 *   - Rhythm ribbons: 0.4 -> 1.15 in 90 ms, settle, rise 24 pt, hold 320, fade 180.
 *
 * stampPose(t, style) is closed-form and worklet-safe, so a hit-stop on the
 * fx clock freezes a stamp mid-slam. The queue is plain JS (stamps change
 * text, so they start from JS anyway; one React render per stamp, none per frame).
 */

import { ease } from './ease';

export interface StampStyle {
  /** Scale at t=0 (the slam starts big). */
  from: number;
  /** Slam-in duration (ms). */
  inMs: number;
  /** outBack overshoot (1.70158 is the classic; 0 = plain outCubic). */
  back: number;
  /** One squash frame on landing (sx 1.08, sy 0.92 for ~33 ms). */
  squash: boolean;
  holdMs: number;
  outMs: number;
  /** Total upward drift over hold + out (pt). */
  rise: number;
  /** Tilt (deg), e.g. -12 for the Whack combo slab. */
  rotate: number;
  /** Starting alpha (0 fades in over inMs, 1 slams in opaque). */
  fromAlpha: number;
}

export const STAMP_STYLES = {
  sharky: { from: 1.4, inMs: 140, back: 1.7, squash: true, holdMs: 380, outMs: 180, rise: 12, rotate: 0, fromAlpha: 1 },
  trivia: { from: 2.2, inMs: 120, back: 1.4, squash: true, holdMs: 420, outMs: 200, rise: 40, rotate: 0, fromAlpha: 1 },
  party: { from: 1.8, inMs: 120, back: 1.70158, squash: true, holdMs: 500, outMs: 200, rise: 16, rotate: 0, fromAlpha: 1 },
  slab: { from: 1.6, inMs: 110, back: 1.4, squash: true, holdMs: 450, outMs: 160, rise: 8, rotate: -12, fromAlpha: 1 },
  ribbon: { from: 0.4, inMs: 90, back: 2.2, squash: false, holdMs: 320, outMs: 180, rise: 24, rotate: 0, fromAlpha: 0 },
  fever: { from: 2.0, inMs: 160, back: 1.6, squash: true, holdMs: 400, outMs: 220, rise: 20, rotate: -6, fromAlpha: 1 },
} satisfies Record<string, StampStyle>;

export type StampStyleName = keyof typeof STAMP_STYLES;

export interface StampPose {
  scale: number;
  sx: number;
  sy: number;
  alpha: number;
  dy: number;
  rotate: number;
  done: boolean;
}

export function stampTotalMs(s: StampStyle): number {
  'worklet';
  return s.inMs + s.holdMs + s.outMs;
}

/** Pose of a stamp `t` ms after it started (fx clock). */
export function stampPose(t: number, s: StampStyle): StampPose {
  'worklet';
  const total = s.inMs + s.holdMs + s.outMs;
  if (t < 0) return { scale: s.from, sx: 1, sy: 1, alpha: 0, dy: 0, rotate: s.rotate, done: false };
  if (t >= total) return { scale: 1, sx: 1, sy: 1, alpha: 0, dy: -s.rise, rotate: s.rotate, done: true };
  let scale = 1;
  let alpha = 1;
  let sx = 1;
  let sy = 1;
  let dy = 0;
  if (t < s.inMs) {
    const p = t / s.inMs;
    const e = s.back > 0 ? ease('outBack', p, s.back) : ease('outCubic', p);
    scale = s.from + (1 - s.from) * e;
    alpha = s.fromAlpha + (1 - s.fromAlpha) * Math.min(1, p * 2);
  } else {
    const after = t - s.inMs;
    if (s.squash && after < 33) {
      sx = 1.08;
      sy = 0.92;
    }
    const tail = s.holdMs + s.outMs;
    dy = -s.rise * ease('outQuad', tail > 0 ? after / tail : 1);
    if (after > s.holdMs) alpha = 1 - ease('inQuad', s.outMs > 0 ? (after - s.holdMs) / s.outMs : 1);
  }
  return { scale, sx, sy, alpha, dy, rotate: s.rotate, done: false };
}

// =============================================================================
// Queue
// =============================================================================

export interface StampItem {
  text: string;
  x: number;
  y: number;
  style: StampStyle;
  color: string;
  size: number;
  /** Higher jumps the queue (a SNATCH beats an emote). */
  priority: number;
  /** ms since epoch it was pushed (stale items are dropped). */
  pushedAt: number;
}

export interface StampQueueConfig {
  /** Stamps on screen at once (Sharky 1). */
  maxLive: number;
  /** Min ms between two stamp starts (Line Party 600). */
  spacingMs: number;
  /** Drop items that waited longer than this (Line Party 2000). */
  maxWaitMs: number;
  /** Queue length cap (oldest lowest-priority dropped). */
  maxQueued: number;
}

export const DEFAULT_STAMP_QUEUE: StampQueueConfig = { maxLive: 1, spacingMs: 0, maxWaitMs: 1500, maxQueued: 4 };

export interface StampQueue {
  cfg: StampQueueConfig;
  waiting: StampItem[];
  /** End times (ms) of the stamps on screen. */
  liveEnds: number[];
  lastStartAt: number;
  dropped: number;
}

export function createStampQueue(cfg: Partial<StampQueueConfig> = {}): StampQueue {
  return { cfg: { ...DEFAULT_STAMP_QUEUE, ...cfg }, waiting: [], liveEnds: [], lastStartAt: -1e9, dropped: 0 };
}

export function stampEnqueue(q: StampQueue, item: StampItem): void {
  // Priority order, FIFO inside a priority.
  let i = q.waiting.length;
  while (i > 0 && q.waiting[i - 1].priority < item.priority) i -= 1;
  q.waiting.splice(i, 0, item);
  while (q.waiting.length > q.cfg.maxQueued) {
    q.waiting.pop();
    q.dropped += 1;
  }
}

/**
 * Pop the next stamp that may start at `now` (null if none may yet). Call it
 * after a push and whenever a stamp ends (stampNextCheckMs says when).
 */
export function stampTake(q: StampQueue, now: number): StampItem | null {
  q.liveEnds = q.liveEnds.filter((e) => e > now);
  while (q.waiting.length && now - q.waiting[0].pushedAt > q.cfg.maxWaitMs) {
    q.waiting.shift();
    q.dropped += 1;
  }
  if (!q.waiting.length) return null;
  if (q.liveEnds.length >= q.cfg.maxLive) return null;
  if (now - q.lastStartAt < q.cfg.spacingMs) return null;
  const item = q.waiting.shift() as StampItem;
  q.liveEnds.push(now + stampTotalMs(item.style));
  q.lastStartAt = now;
  return item;
}

/** When to look again (ms from now), or -1 when nothing is waiting. */
export function stampNextCheckMs(q: StampQueue, now: number): number {
  if (!q.waiting.length) return -1;
  let at = q.lastStartAt + q.cfg.spacingMs;
  if (q.liveEnds.length >= q.cfg.maxLive) at = Math.max(at, Math.min(...q.liveEnds));
  return Math.max(0, at - now);
}
