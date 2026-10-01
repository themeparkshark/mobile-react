/**
 * score: stars, badges, ride win, steadiness and timing read-outs
 * (design 3.6, 6.8, 9.1). Pure.
 */

import { accuracyPct, hitRate, marchBarsOf, type JudgeState } from './judge';
import { RIDE_RULES, STAR_ACCURACY, J_MISS, J_WRONG } from './types';

export interface RoundSummary {
  score: number;
  stars: number;
  cleared: boolean;
  stalled: boolean;
  accuracy: number;
  hitRate: number;
  maxCombo: number;
  counts: { sharp: number; perfect: number; great: number; good: number; miss: number; wrong: number; strays: number; faults: number; oos: number };
  fullCombo: boolean;
  allPerfect: boolean;
  feverBars: number;
  marchBars: number[];
  marchShare: number;
  meanErrorMs: number;
  steadiness: number;
  steadinessLabel: string;
  timingWords: string;
  histogram: number[];
  rideWin: boolean;
}

export function starsForAccuracy(acc: number): number {
  if (acc >= STAR_ACCURACY.three) return 3;
  if (acc >= STAR_ACCURACY.two) return 2;
  if (acc >= STAR_ACCURACY.one) return 1;
  return 0;
}

function mean(a: readonly number[]): number {
  if (!a.length) return 0;
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

function sd(a: readonly number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  let s = 0;
  for (const v of a) s += (v - m) * (v - m);
  return Math.sqrt(s / (a.length - 1));
}

/**
 * osu!'s unstable rate (UR = 10 x sd) in kid words, scaled for a phone
 * touch screen and the rev 6 windows: sd 15 ms -> 93 "Rock steady",
 * 30 ms -> 70 "Steady", 45 ms -> 48 "Wobbly".
 */
export function steadinessOf(errs: readonly number[]): number {
  const ur = sd(errs) * 10;
  return Math.max(0, Math.min(100, Math.round(100 - (ur - 100) * 0.15)));
}

export function steadinessLabel(v: number): string {
  if (v >= 85) return 'Rock steady';
  if (v >= 65) return 'Steady';
  return 'Wobbly';
}

export function timingWords(meanMs: number): string {
  const m = Math.round(meanMs);
  if (Math.abs(m) <= 8) return "You're right on it";
  return m < 0 ? `You're ${-m}ms early` : `You're ${m}ms late`;
}

/** 11-bin histogram of signed errors over +/-165 ms (30 ms bins). */
export function histogramOf(errs: readonly number[]): number[] {
  const bins = new Array(11).fill(0);
  for (const e of errs) {
    const k = Math.max(0, Math.min(10, Math.round(e / 30) + 5));
    bins[k]++;
  }
  return bins;
}

export function summarize(s: JudgeState, opts: { ftue?: boolean; format: 'queue' | 'ride' }): RoundSummary {
  const acc = accuracyPct(s);
  const stalled = !!s.stalled;
  const cleared = !stalled;
  let stars = cleared ? starsForAccuracy(acc) : 0;
  if (opts.ftue) stars = Math.max(1, stars);
  const march = marchBarsOf(s);
  const playable = s.lastBar - s.firstBar + 1;
  const errs = s.errs;
  const noMiss = s.cMiss === 0 && s.cWrong === 0 && s.faults === 0 && s.oos === 0;
  const hr = hitRate(s);
  let missLike = 0;
  for (let i = 0; i < s.n; i++) if (s.res[i] === J_MISS || s.res[i] === J_WRONG) missLike++;
  const st = steadinessOf(errs);
  return {
    score: s.score,
    stars,
    cleared,
    stalled,
    accuracy: Math.round(acc * 10) / 10,
    hitRate: hr,
    maxCombo: s.maxCombo,
    counts: { sharp: s.cSharp, perfect: s.cPerfect, great: s.cGreat, good: s.cGood, miss: missLike, wrong: s.cWrong, strays: s.strays, faults: s.faults, oos: s.oos },
    fullCombo: cleared && noMiss && s.accN > 0,
    allPerfect: cleared && noMiss && s.cGreat === 0 && s.cGood === 0 && s.accN > 0,
    feverBars: s.feverBarsUsed,
    marchBars: march,
    marchShare: playable > 0 ? march.length / playable : 0,
    meanErrorMs: Math.round(mean(errs)),
    steadiness: st,
    steadinessLabel: steadinessLabel(st),
    timingWords: timingWords(mean(errs)),
    histogram: histogramOf(errs),
    rideWin: cleared && hr >= RIDE_RULES.hitRate && s.strays <= RIDE_RULES.maxStrays,
  };
}

/**
 * Silent auto-tune (design 4.5): with 20+ GREAT-or-better hits and a median
 * error more than 12 ms from zero, move the route offset 50% of the median,
 * at most 40 ms a round. Returns the new offset (unchanged if not enough data).
 */
export function autoTuneOffset(currentOffsetMs: number, s: JudgeState): number {
  const good: number[] = [];
  for (let i = 0; i < s.n; i++) {
    const r = s.res[i];
    if (r >= 1 && r <= 3) good.push(s.delta[i]);
  }
  if (good.length < 20) return currentOffsetMs;
  good.sort((a, b) => a - b);
  const med = good[good.length >> 1];
  if (Math.abs(med) <= 12) return currentOffsetMs;
  const step = Math.max(-40, Math.min(40, med * 0.5));
  return clampOffset(currentOffsetMs + step);
}

/** The full suggested offset for "Fix my timing". */
export function suggestedOffset(currentOffsetMs: number, s: JudgeState): number {
  const e = s.errs.slice().sort((a, b) => a - b);
  if (e.length < 8) return currentOffsetMs;
  return clampOffset(currentOffsetMs + e[e.length >> 1]);
}

export function clampOffset(v: number): number {
  return Math.max(-100, Math.min(350, Math.round(v)));
}
