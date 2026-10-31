/**
 * session.ts: interruption-safe play for a line that never stops moving.
 *
 * QUEUE REALITY (Dustin): "The line will always be moving." So:
 *   - Movement, steps, GPS drift and pedometer NEVER pause a game.
 *   - Interruptions are free and instant: app backgrounded, phone pocketed,
 *     screen locked, or a manual pause. The exact state is snapshotted and a
 *     quick 3-2-1 resumes it.
 *   - Only a real queue event ends a session: leaving the queue geofence or
 *     boarding ("Your ride's up!"), which wraps up and saves the result.
 *   - A gentle, non-nagging heads-up when the queue advances a lot, without
 *     pausing play.
 *
 * This file is pure (no React, no storage) so every rule is unit-tested.
 */

export type HoldReason = 'manual' | 'background' | 'inactive' | 'dialog';
export type WrapUpReason = 'boarding' | 'left-queue' | 'session-ended';

// =============================================================================
// Snapshots
// =============================================================================

export interface SessionSnapshot<T = unknown> {
  v: 1;
  /** Game id, e.g. 'whack'. */
  game: string;
  /** Session key (game + ride + attempt), so a stale snapshot never leaks. */
  key: string;
  savedAt: number;
  reason: HoldReason;
  score: number;
  /** Gameplay clock at the hold. */
  simMs: number;
  steps: number;
  /** Game-owned state (must be JSON-serialisable). */
  state: T;
}

export const SNAPSHOT_TTL_MS = 30 * 60 * 1000;

export function makeSnapshot<T>(
  game: string,
  key: string,
  reason: HoldReason,
  now: number,
  data: { score: number; simMs: number; steps: number; state: T },
): SessionSnapshot<T> {
  return { v: 1, game, key, savedAt: now, reason, score: data.score, simMs: data.simMs, steps: data.steps, state: data.state };
}

export function isSnapshot(value: unknown): value is SessionSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return s.v === 1 && typeof s.game === 'string' && typeof s.key === 'string' && typeof s.savedAt === 'number'
    && typeof s.score === 'number' && typeof s.simMs === 'number' && 'state' in s;
}

/** A snapshot is usable if it is for this session and not stale. */
export function snapshotUsable(snap: unknown, key: string, now: number, ttlMs = SNAPSHOT_TTL_MS): snap is SessionSnapshot {
  return isSnapshot(snap) && snap.key === key && now - snap.savedAt >= 0 && now - snap.savedAt <= ttlMs;
}

// =============================================================================
// Resume gate: hold -> quick 3-2-1 -> live
// =============================================================================

export type GatePhase = 'live' | 'held' | 'counting' | 'wrapped';

export interface ResumeGate {
  phase: GatePhase;
  reason: HoldReason | null;
  heldAt: number;
  countStart: number;
  /** ms per count beat. Quick by design: 3 beats + GO about 1.1s. */
  stepMs: number;
  goMs: number;
  /** Total time spent held (for fair timers and proof meta). */
  heldTotalMs: number;
  holds: number;
  wrapReason: WrapUpReason | null;
}

export function createResumeGate(stepMs = 300, goMs = 200): ResumeGate {
  return { phase: 'live', reason: null, heldAt: 0, countStart: 0, stepMs, goMs, heldTotalMs: 0, holds: 0, wrapReason: null };
}

/** Freeze play (manual pause, background, lock). Idempotent while held. */
export function holdGate(g: ResumeGate, reason: HoldReason, now: number): boolean {
  if (g.phase === 'wrapped') return false;
  if (g.phase === 'held') return false;
  if (g.phase === 'counting') {
    // Interrupted mid-countdown: back to held, time already counted.
    g.phase = 'held';
    g.reason = reason;
    return true;
  }
  g.phase = 'held';
  g.reason = reason;
  g.heldAt = now;
  g.holds += 1;
  return true;
}

/** Player tapped resume (or came back): start the quick 3-2-1. */
export function beginResume(g: ResumeGate, now: number, instant = false): void {
  if (g.phase !== 'held') return;
  if (instant) {
    g.heldTotalMs += now - g.heldAt;
    g.phase = 'live';
    g.reason = null;
    return;
  }
  g.phase = 'counting';
  g.countStart = now;
}

export interface GateTick {
  /** '3' | '2' | '1' | 'GO' while counting, '' otherwise. */
  label: string;
  /** Beat index changed this tick (fire tick sfx/haptic). */
  beat: boolean;
  /** Play resumed this tick. */
  resumed: boolean;
}

const LABELS = ['3', '2', '1', 'GO'];

export function tickGate(g: ResumeGate, now: number, lastLabel: string): GateTick {
  if (g.phase !== 'counting') return { label: '', beat: false, resumed: false };
  const t = now - g.countStart;
  const total = g.stepMs * 3 + g.goMs;
  if (t >= total) {
    g.heldTotalMs += now - g.heldAt;
    g.phase = 'live';
    g.reason = null;
    return { label: '', beat: false, resumed: true };
  }
  const idx = t < g.stepMs * 3 ? Math.floor(t / g.stepMs) : 3;
  const label = LABELS[idx];
  return { label, beat: label !== lastLabel, resumed: false };
}

/** A real queue event ends the session: no more holds or resumes. */
export function wrapGate(g: ResumeGate, reason: WrapUpReason, now: number): boolean {
  if (g.phase === 'wrapped') return false;
  if (g.phase === 'held' || g.phase === 'counting') g.heldTotalMs += now - g.heldAt;
  g.phase = 'wrapped';
  g.wrapReason = reason;
  return true;
}

/**
 * The wrap-up card's words. A run saved before its first star shows the gold
 * RUN SAVED stamp, so its title and note never say "saved" again (savedTitle,
 * savedBody): the stamp says it once.
 */
export const WRAP_UP_COPY: Record<WrapUpReason, { title: string; body: string; savedTitle: string; savedBody: string }> = {
  boarding: { title: "YOUR RIDE'S UP!", body: 'Run saved. Enjoy the ride!', savedTitle: "YOUR RIDE'S UP!", savedBody: 'Enjoy the ride!' },
  'left-queue': { title: 'RUN SAVED', body: 'You left the line, so we saved your score.', savedTitle: 'ALL DONE!', savedBody: 'You left the line.' },
  'session-ended': { title: 'RUN SAVED', body: 'Your score is locked in.', savedTitle: 'ALL DONE!', savedBody: '' },
};

/** The wrap-up title and note, with "saved" said once (by the stamp) on a saved run. */
export function wrapUpCopy(reason: WrapUpReason, saved: boolean): { title: string; body: string } {
  const c = WRAP_UP_COPY[reason];
  return saved ? { title: c.savedTitle, body: c.savedBody } : { title: c.title, body: c.body };
}

/**
 * Stars for a run a queue event ended. Boarding mid-run never throws the run
 * away: a run with points but no star yet is a saved run (partial). It shows a
 * RUN SAVED stamp instead of a star and counts as played, but it is never
 * written down as a real star (no best, no difficulty change). A paid ride
 * challenge has no saved runs: its goal has to be met for real.
 */
export function wrapUpStars(stars: number, score: number, paid: boolean): { stars: number; partial: boolean } {
  const safe = Number.isFinite(stars) ? Math.max(0, stars) : 0;
  return { stars: safe, partial: safe === 0 && !paid && score > 0 };
}

/** The bits of a run result the wrap-up credit touches. */
export interface WrapResultLike {
  score?: number;
  stars?: number;
  message?: string;
  meta?: Record<string, unknown>;
}

/**
 * Apply the wrap-up credit to a run result, so the title, the RUN SAVED stamp
 * and the note always agree. `gameMessage` is a title the game picked itself
 * (kept as is); otherwise the title comes from this result's own saved flag,
 * never from an older snapshot's.
 */
export function creditWrapResult<T extends WrapResultLike>(
  result: T,
  reason: WrapUpReason,
  paid: boolean,
  gameMessage?: string,
): T & { stars: number; message: string; meta: Record<string, unknown> } {
  const score = result.score ?? 0;
  const credit = wrapUpStars(result.stars ?? 0, score, paid);
  const saved = credit.partial || score <= 0;
  return {
    ...result,
    stars: credit.stars,
    message: gameMessage ?? wrapUpCopy(reason, saved).title,
    meta: { ...(result.meta ?? {}), wrapUp: reason, ...(credit.partial ? { partial: true } : {}) },
  };
}

/** True when a game-owned results surface rendered nothing (null, false, true, undefined or ''). */
export function isEmptyResultsNode(node: unknown): boolean {
  return node == null || node === false || node === true || node === '';
}

// =============================================================================
// Movement: never pause. A gentle heads-up when the line advances a lot.
// =============================================================================

export interface HeadsUpConfig {
  /** Metres of advance within windowMs that count as "a lot". */
  metres: number;
  /** Or this many discrete advance events in the window. */
  events: number;
  windowMs: number;
  /** Minimum gap between heads-ups (non-nagging). */
  cooldownMs: number;
  /** How long the chip/glow shows. */
  showMs: number;
}

export const DEFAULT_HEADS_UP: HeadsUpConfig = {
  metres: 8,
  events: 4,
  windowMs: 20000,
  cooldownMs: 45000,
  showMs: 2600,
};

export interface HeadsUpState {
  cfg: HeadsUpConfig;
  /** Recent advances (ms, metres). */
  at: number[];
  metres: number[];
  lastShownAt: number;
  showUntil: number;
  shownCount: number;
}

export function createHeadsUp(cfg: Partial<HeadsUpConfig> = {}): HeadsUpState {
  return { cfg: { ...DEFAULT_HEADS_UP, ...cfg }, at: [], metres: [], lastShownAt: -1e12, showUntil: 0, shownCount: 0 };
}

/**
 * Report a queue advance (from LinePlay's movement context). Returns true
 * when the heads-up should show now. Never pauses anything.
 */
export function reportAdvance(h: HeadsUpState, now: number, metres = 1): boolean {
  h.at.push(now);
  h.metres.push(metres > 0 ? metres : 1);
  while (h.at.length && now - h.at[0] > h.cfg.windowMs) {
    h.at.shift();
    h.metres.shift();
  }
  let sum = 0;
  for (const m of h.metres) sum += m;
  const alot = sum >= h.cfg.metres || h.at.length >= h.cfg.events;
  if (!alot || now - h.lastShownAt < h.cfg.cooldownMs) return false;
  h.lastShownAt = now;
  h.showUntil = now + h.cfg.showMs;
  h.shownCount += 1;
  h.at.length = 0;
  h.metres.length = 0;
  return true;
}

export function headsUpVisible(h: HeadsUpState, now: number): boolean {
  return now < h.showUntil;
}

/**
 * Movement policy. 'playThrough' is the only behaviour for queue games; the
 * legacy 'pause' value is accepted for type compatibility but is treated as
 * playThrough (movement never pauses: QUEUE REALITY overrides older designs).
 */
export type MovementPolicy = 'playThrough' | 'pause';

export function movementPauses(_policy: MovementPolicy | undefined): boolean {
  return false;
}
