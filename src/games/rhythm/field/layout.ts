/**
 * layout: per-frame draw lists for the reading surface (UI thread).
 *
 * The frame callback calls layoutFrame() once; ParadeField's Atlas and path
 * buffers only read the arrays. Everything is placed with the true 1/z lane
 * projection (core/projection.ts), and nothing here ever offsets the lane.
 */

import { J_MISS, J_NONE, K_BIG, K_CYMBAL, K_DRUM, K_FREEZE, K_POPPER, K_RIM, K_ROLL, L_MARCH, L_STANDING, F_ECHO } from '../core/types';
import type { JudgeState } from '../core/judge';
import { fadeIn, scaleAt } from '../core/projection';

export const MAX_NOTES = 40;
export const MAX_LINES = 16;
export const MAX_TAILS = 4;

/** Atlas sprite index per note kind (ParadeField builds the atlas in this order). */
export const SPR_DRUM = 0;
export const SPR_RIM = 1;
export const SPR_ROLL = 0;
export const SPR_BIG = 2;
export const SPR_CYMBAL = 3;
export const SPR_POPPER = 4;
export const SPR_FREEZE = 5;

export interface DrawList {
  n: number;
  spr: number[];
  x: number[];
  y: number[];
  size: number[];
  alpha: number[];
  rot: number[];
  /** 1 = draw a dotted ECHO outline instead of the full note (d2). */
  echo: number[];
  lineN: number;
  lineY: number[];
  lineHalf: number[];
  lineBar: number[];
  tailN: number;
  tailY0: number[];
  tailY1: number[];
  tailW0: number[];
  tailW1: number[];
  /** Current beat phase 0-1 and bar index at visual time. */
  beatPhase: number;
  beatIdx: number;
  bar: number;
  /** POPPER in view: its pips (taps needed and done) and screen y. */
  popY: number;
  popNeed: number;
}

export function createDrawList(): DrawList {
  const z = (k: number): number[] => {
    const a: number[] = [];
    for (let i = 0; i < k; i++) a.push(0);
    return a;
  };
  return {
    n: 0, spr: z(MAX_NOTES), x: z(MAX_NOTES), y: z(MAX_NOTES), size: z(MAX_NOTES), alpha: z(MAX_NOTES), rot: z(MAX_NOTES), echo: z(MAX_NOTES),
    lineN: 0, lineY: z(MAX_LINES), lineHalf: z(MAX_LINES), lineBar: z(MAX_LINES),
    tailN: 0, tailY0: z(MAX_TAILS), tailY1: z(MAX_TAILS), tailW0: z(MAX_TAILS), tailW1: z(MAX_TAILS),
    beatPhase: 0, beatIdx: 0, bar: 0, popY: -1000, popNeed: 0,
  };
}

export interface LaneGeom {
  cx: number;
  yLine: number;
  yHorizon: number;
  /** Lane half-width on the judgment line. */
  halfW: number;
  /** Note size (px) on the judgment line. */
  noteSize: number;
}

export function yOf(g: LaneGeom, u: number): number {
  'worklet';
  return g.yHorizon + (g.yLine - g.yHorizon) * scaleAt(u);
}

function beatIndexAt(beats: number[], t: number): number {
  'worklet';
  const n = beats.length;
  if (t <= beats[0]) return (t - beats[0]) / (beats[1] - beats[0]);
  if (t >= beats[n - 1]) return n - 1 + (t - beats[n - 1]) / (beats[n - 1] - beats[n - 2]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - beats[lo]) / (beats[hi] - beats[lo]);
}

export function beatAt(beats: number[], t: number): number {
  'worklet';
  return beatIndexAt(beats, t);
}

/**
 * Fill the draw list for visual time `now`. `march` (0-1) widens the lane
 * and notes (never moves them); `echoStyle` 1 = d2 dotted outlines.
 */
export function layoutFrame(
  d: DrawList, s: JudgeState, beats: number[], g: LaneGeom, now: number, approach: number,
  march: number, missAt: number[], wt: number, echoStyle: number, bigMarch: number,
): void {
  'worklet';
  const widen = 1 + 0.17 * march;
  const sizeK = 1 + 0.15 * march;
  // Beat phase and bar.
  const bf = beatIndexAt(beats, now);
  d.beatIdx = Math.floor(bf);
  d.beatPhase = bf - Math.floor(bf);
  d.bar = Math.floor(bf / 4);
  // Beat and bar lines across the lane.
  let ln = 0;
  const firstBeat = Math.max(8, Math.ceil(bf));
  for (let b = firstBeat; b < beats.length && ln < MAX_LINES; b++) {
    const u = (beats[b] - now) / approach;
    if (u > 1) break;
    if (u < 0) continue;
    const sc = scaleAt(u);
    d.lineY[ln] = g.yHorizon + (g.yLine - g.yHorizon) * sc;
    d.lineHalf[ln] = g.halfW * widen * sc;
    d.lineBar[ln] = b % 4 === 0 ? 1 : 0;
    ln++;
  }
  d.lineN = ln;
  // Notes.
  let n = 0;
  let tails = 0;
  d.popY = -1000;
  const from = s.cursor > 12 ? s.cursor - 12 : 0;
  for (let i = from; i < s.n && n < MAX_NOTES; i++) {
    const t = s.t[i];
    const u = (t - now) / approach;
    if (u > 1.02) break;
    const bar = s.bar[i];
    const layer = s.barLayer[bar] === L_MARCH ? L_MARCH : L_STANDING;
    if ((s.layers[i] & layer) === 0) continue;
    const k = s.kind[i];
    const res = s.res[i];
    let alpha = fadeIn(u);
    let y = 0;
    let sc = 1;
    let dropping = false;
    if (k === K_ROLL && res >= 1 && res <= 4 && now < s.end[i]) {
      // Held (or passed) ROLL: head sits on the line while the tail shrinks.
      sc = 1;
      y = g.yLine;
    } else if (k === K_POPPER && (res === J_NONE) && now <= s.end[i] + 60) {
      const uu = u > 0 ? u : 0;
      sc = scaleAt(uu);
      y = g.yHorizon + (g.yLine - g.yHorizon) * sc;
      d.popY = y;
    } else if (res === J_NONE || res === -1) {
      if (u < -0.12) continue;
      sc = scaleAt(u);
      y = g.yHorizon + (g.yLine - g.yHorizon) * sc;
    } else if (res === J_MISS && wt - missAt[i] < 260) {
      // MISS: desaturated drop below the line (design 6.3), no shake.
      const dt = (wt - missAt[i]) / 1000;
      sc = scaleAt(Math.max(0, u));
      y = g.yHorizon + (g.yLine - g.yHorizon) * sc + 0.5 * 1400 * dt * dt;
      alpha = 0.55 * (1 - (wt - missAt[i]) / 260);
      dropping = true;
    } else {
      continue;
    }
    if (u < 0 && !dropping && k !== K_ROLL && k !== K_POPPER) {
      // Just past the line and still unjudged: fade out quickly.
      alpha *= Math.max(0, 1 + u * 8);
    }
    let size = g.noteSize * sizeK;
    let spr = SPR_DRUM;
    if (k === K_RIM) spr = SPR_RIM;
    else if (k === K_BIG) {
      spr = SPR_BIG;
      size *= layer === L_MARCH && bigMarch ? 1.8 : 1.4;
    } else if (k === K_CYMBAL) spr = SPR_CYMBAL;
    else if (k === K_POPPER) {
      spr = SPR_POPPER;
      size *= 1.3;
    } else if (k === K_FREEZE) spr = SPR_FREEZE;
    d.spr[n] = spr;
    d.x[n] = g.cx;
    d.y[n] = y;
    d.size[n] = size * sc;
    d.alpha[n] = alpha;
    d.rot[n] = k === K_FREEZE ? Math.sin(wt / 160) * 0.1 : 0;
    d.echo[n] = (s.flags[i] & F_ECHO) && echoStyle ? 1 : 0;
    n++;
    if (k === K_ROLL && tails < MAX_TAILS) {
      const ue = (s.end[i] - now) / approach;
      const ue1 = ue > 1 ? 1 : ue;
      if (ue1 > 0) {
        const s1 = scaleAt(ue1);
        d.tailY0[tails] = y;
        d.tailY1[tails] = g.yHorizon + (g.yLine - g.yHorizon) * s1;
        d.tailW0[tails] = g.noteSize * 0.34 * sizeK * sc;
        d.tailW1[tails] = g.noteSize * 0.34 * sizeK * s1;
        tails++;
      }
    }
  }
  d.n = n;
  d.tailN = tails;
}

export { K_DRUM };
