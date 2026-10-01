/**
 * Ghosts (design 10.2 C). A ghost is a verified Burst replayed into a list of
 * hits and a pace line. The personal-best ghost is on by default: on shared
 * seeds (daily / weekly) its puck flashes the holes it hit at their logged
 * game times, and on random seeds a pace line shows +ahead / -behind.
 */

import { mapGhostHole } from '../formations';
import { E_BRUISER, E_HIT, createSim, simAdvanceTo, simBank, simSwipe, simTap, simUnfreeze, TAP_SWIPE } from '../sim';
import type { Timeline } from '../timeline';
import type { WhackGhost } from './types';

export const PACE_STEP_MS = 500;

/** Replay a tap log into a ghost (hits + pace). */
export function ghostFromRun(tl: Timeline, taps: number[][], name: string, endAt?: number): WhackGhost {
  const s = createSim(tl, undefined, true);
  const hits: [number, number][] = [];
  const pace: number[] = [0];
  const drain = () => {
    for (let i = 0; i < s.ev.length; i += 5) {
      if (s.ev[i] === E_HIT || s.ev[i] === E_BRUISER) hits.push([s.ev[i + 4], s.ev[i + 1]]);
    }
    s.ev.length = 0;
  };
  const stepTo = (gt: number) => {
    while (s.t < gt && !s.ended && !s.frozen) {
      const next = Math.min(gt, (Math.floor(s.t / PACE_STEP_MS) + 1) * PACE_STEP_MS);
      simAdvanceTo(s, next);
      drain();
      if (s.t % PACE_STEP_MS === 0) pace[s.t / PACE_STEP_MS] = s.score;
    }
  };
  for (const [gt, hole, flags] of taps) {
    stepTo(gt);
    if (s.ended || s.t !== gt) break;
    if (hole < 0) simUnfreeze(s);
    else if (flags & TAP_SWIPE) simSwipe(s, hole);
    else simTap(s, hole);
    drain();
  }
  const end = endAt ?? tl.lengthMs;
  stepTo(end);
  if (!s.ended && end < tl.lengthMs) simBank(s);
  for (let i = 1; i < pace.length; i++) if (pace[i] == null) pace[i] = pace[i - 1];
  pace.push(s.score);
  return { name, xform: (tl.input.xform ?? 0) & 7, hits, pace, score: s.score };
}

/** Ghost score at a game time (pace line). */
export function paceAt(g: WhackGhost, gt: number): number {
  const i = Math.floor(gt / PACE_STEP_MS);
  if (i <= 0) return g.pace[0] ?? 0;
  if (i >= g.pace.length) return g.pace[g.pace.length - 1] ?? g.score;
  return g.pace[i];
}

/** Ghost hits due in (from, to] of game time, mapped into my board through mine o theirs^-1. */
export function ghostHitsBetween(g: WhackGhost, from: number, to: number, myXform: number): number[] {
  const out: number[] = [];
  for (const [t, h] of g.hits) if (t > from && t <= to) out.push(mapGhostHole(h, g.xform, myXform));
  return out;
}

/** Storage key for a personal-best ghost. Random-seed runs share one pace ghost per format and Burst. */
export function pbGhostKey(format: string, burstIndex: number, sharedSeed?: number): string {
  return sharedSeed != null ? `@whack/ghost/${format}/${sharedSeed >>> 0}/${burstIndex}` : `@whack/ghost/${format}/pace/${burstIndex}`;
}
