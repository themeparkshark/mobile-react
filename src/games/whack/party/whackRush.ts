/**
 * whackRush.ts: Whack-a-Shark as a live Line Party game ("Whack Rush").
 *
 * Everyone in the ride's line plays the same 20 s Bonk Rush Burst at the same
 * moment on their own board (parallel boards, Tetris 99 style), with the full
 * Whack roster, grades, crits, combo tiers and fever. The server replays each
 * tap log with this exact file (bundled by tools/build-sim-bundle.mjs for the
 * Node sidecar), so the only score that counts is the replayed one.
 *
 * Differences from the solo formats, all because the room shares one clock:
 * - No Auto Look-Up. Looking away is the player's personal HOLD (the pause
 *   button or the phone going to the background): 6 s of budget, then the
 *   ghost finishes the seat. Nobody else ever freezes.
 * - No splats or boss. Every tap is a plain touch-down [ms since GO, hole].
 *
 * Pure: no clock, no Math.random. Floats only through the seeded autoplayer,
 * which the sidecar runs as the same JavaScript (no PHP port: see
 * src/games/whack/SERVER_REPLAY.md, "Line Party").
 */

import { autoplayBurst, type ProfileName } from '../autoplayer';
import { createSim, simAdvanceTo, simTap, P_TELL, P_UP } from '../sim';
import { buildBurst, type Timeline } from '../timeline';
import { MAX_TAPS as BURST_MAX_TAPS } from '../waves';

export const WHACK_RUSH_VERSION = 1;
export const ROUND_MS = 20000;
export const HOLES = 9;
export const MAX_TAPS = BURST_MAX_TAPS;

export type RushTap = [number, number];
export type RushProfile = 'rookie' | 'regular' | 'ace';

export interface RushResult {
  score: number;
  hits: number;
  quick: number;
  good: number;
  late: number;
  crits: number;
  goldens: number;
  decoyHits: number;
  whiffs: number;
  butters: number;
  maxStreak: number;
  escapes: number;
  doubles: number;
  /** ms from emerge to the bonk for every scored hit, in tap order (human-limit checks). */
  reactions: number[];
  /** Event ids hit, in tap order (ghost markers and replay equality). */
  hitIds: number[];
}

/** The shared board every seat plays (theme is presentation only). */
export function buildBoard(seed: number): Timeline {
  return buildBurst({ seed: seed >>> 0, burstIndex: 0, format: 'party', difficulty: 2, theme: 'park', unlockLevel: 9 });
}

export function validTaps(taps: unknown): taps is RushTap[] {
  if (!Array.isArray(taps) || taps.length > MAX_TAPS) return false;
  let last = 0;
  for (const tap of taps) {
    if (!Array.isArray(tap) || tap.length !== 2) return false;
    const [t, h] = tap;
    if (!Number.isInteger(t) || !Number.isInteger(h)) return false;
    if (t < 0 || t > ROUND_MS || h < 0 || h >= HOLES || t < last) return false;
    last = t;
  }
  return true;
}

/** Replay a tap log on the board. The same function scores the player, the bots and the ghosts. */
export function resolve(board: Timeline, taps: RushTap[]): RushResult {
  const s = createSim(board, undefined, false);
  const reactions: number[] = [];
  const hitIds: number[] = [];
  for (const [t, h] of taps) {
    simAdvanceTo(s, t);
    if (s.ended || s.t !== t) break;
    const ph = s.hPh[h];
    const ev = s.hEv[h];
    const before = s.hits;
    simTap(s, h);
    if (s.hits > before && (ph === P_UP || ph === P_TELL) && ev >= 0) {
      reactions.push(Math.max(0, t - s.evEmerge[ev]));
      hitIds.push(ev);
    }
  }
  if (!s.ended) simAdvanceTo(s, board.lengthMs);
  return {
    score: s.score, hits: s.hits, quick: s.quick, good: s.good, late: s.late, crits: s.crits, goldens: s.goldens,
    decoyHits: s.decoyHits, whiffs: s.whiffs, butters: s.butters, maxStreak: s.maxStreak, escapes: s.escapes,
    doubles: s.doubles, reactions, hitIds,
  };
}

/**
 * Score after each `stepMs` of board time for one tap log (one sim pass), so a
 * live scoreboard can show bots and ghosts climbing without re-running the sim
 * every frame. curve[k] is the score at k * stepMs.
 */
export function scoreCurve(board: Timeline, taps: RushTap[], stepMs = 250): number[] {
  const s = createSim(board, undefined, false);
  const curve: number[] = [0];
  let next = stepMs;
  let i = 0;
  while (next <= board.lengthMs) {
    while (i < taps.length && taps[i][0] <= next) {
      simAdvanceTo(s, taps[i][0]);
      if (s.ended || s.t !== taps[i][0]) { i = taps.length; break; }
      simTap(s, taps[i][1]);
      i++;
    }
    simAdvanceTo(s, next);
    curve.push(s.score);
    next += stepMs;
  }
  return curve;
}

const PROFILE_OF: Record<RushProfile, ProfileName> = { rookie: 'novice', regular: 'median', ace: 'expert' };

/** A house bot (or a ghost from `fromMs`) for `seat`: seeded, so the server and every phone agree. */
export function botTaps(board: Timeline, seed: number, seat: number, profile: RushProfile, fromMs = 0): RushTap[] {
  const run = autoplayBurst(board, PROFILE_OF[profile] ?? 'median', ((seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b1)) >>> 0);
  const out: RushTap[] = [];
  const log = run.sim.taps;
  for (let i = 0; i + 2 < log.length; i += 3) {
    const t = log[i];
    const h = log[i + 1];
    if (h < 0 || t < fromMs || t > ROUND_MS) continue;
    out.push([t, h]);
  }
  return out;
}

/** A dropped player's own taps before `untilMs`, then their ghost. */
export function ghostFill(board: Timeline, seed: number, seat: number, own: RushTap[], untilMs: number, profile: RushProfile): RushTap[] {
  const mine = own.filter(([t]) => t < untilMs);
  const merged = [...mine, ...botTaps(board, seed, seat, profile, untilMs)];
  merged.sort((a, b) => a[0] - b[0]);
  return merged;
}

/** FNV-1a over the canonical result: the claim the replay must equal exactly. */
export function resultHash(r: RushResult): string {
  const text = [r.score, r.hits, r.quick, r.good, r.late, r.crits, r.goldens, r.decoyHits, r.whiffs, r.butters, r.maxStreak,
    r.escapes, r.doubles, r.reactions.join('.'), r.hitIds.join('.')].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
