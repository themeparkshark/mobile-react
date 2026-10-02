/**
 * paradeSprint: Parade Beat as a Line Party micro-round (sim `parade_sprint`),
 * the live "Same-Minute Race" of design 11.2.
 *
 * Every phone in the line room builds the same board from the server's seed
 * (one of the two ride stages, its canonical 12-bar sprint chart), plays the
 * song on its own phone from GO, and submits a tap log. Nothing syncs during
 * play: the score is resolved after the round by replaying the log through the
 * real Parade Beat judge (core/judge.ts), here on the phone for the claim and
 * on the server in the Node replay sidecar (the bundled registry). There is no
 * PHP port: the judge is not integer-only, so `parade_sprint` needs the
 * sidecar driver (studio note: src/games/rhythm/SERVER_NOTE.md).
 *
 * Tap log rows are [songMs, code] with songMs = ms since GO in song time
 * (already shifted by the phone's audio offset) and
 *   code = type * 100000 + zone * 10000 + pointer   (pointer 0-9999)
 *   type 0 touch-down, 1 touch-up, 3 retired (the rev 6 Fever launch; ignored),
 *        4 MARCH pill (zone 1 = march from the next section, 0 = full chart)
 *
 * Score = Duel Points (layer-normalised, design 11.2): per playable bar
 * round(bar accuracy), x1.5 in bars under your own Fever. A marcher plays
 * fewer notes but is scored on how well they played them, so walking in line
 * never loses a race. Ties break on the raw judge score (`points`).
 *
 * The line is always moving: a dropped or backgrounded player's seat is played
 * on by `ghostFill` (their own taps up to the drop, then the house drummer).
 */

import { generate, mulberry32 } from '../core/generate';
import { accuracyPct, createJudge, finishJudge, judgeDown, judgeTick, judgeUp, type JudgeState } from '../core/judge';
import { scriptHuman } from '../core/sim';
import { ACCURACY_VALUE, J_GOOD, J_MISS, J_SHARP, J_WRONG, type Chart, type StageJson } from '../core/types';
import { SIM_STAGES } from '../stages/simStages.generated';

export const PARADE_SPRINT_VERSION = 2;
export const PARADE_SPRINT_KEY = 'parade_sprint';
export const MAX_TAPS = 600;
export const TICK_MS = 8;
/** The two ride stages, in seed order. */
export const SPRINT_STAGES = ['opening_day_a', 'waiting_room_a'] as const;

export const T_DOWN = 0;
export const T_UP = 1;
export const T_LAUNCH = 3;
export const T_MARCH = 4;

export type SprintTap = [number, number];
export type SprintProfile = 'rookie' | 'regular' | 'ace';

export interface SprintBoard {
  stage: string;
  chart: Chart;
  /** Round length: the outro downbeat of the sprint (ms since GO). */
  roundMs: number;
}

export interface SprintResult {
  score: number;
  points: number;
  hits: number;
  perfects: number;
  misses: number;
  maxCombo: number;
  accuracy10: number;
  /** Duel Points per playable bar. */
  barPts: number[];
  /** Song times of every hit (rival rail flashes on the beat-map time). */
  hitT: number[];
  feverBars: number;
}

export function encodeTap(type: number, zone: number, pointer: number): number {
  'worklet';
  return type * 100000 + zone * 10000 + (pointer % 10000);
}

export function decodeTap(code: number): { type: number; zone: number; pointer: number } {
  'worklet';
  const type = Math.floor(code / 100000);
  const rest = code - type * 100000;
  const zone = Math.floor(rest / 10000);
  return { type, zone, pointer: rest - zone * 10000 };
}

export function buildBoard(seed: number): SprintBoard {
  const stage = SPRINT_STAGES[(seed >>> 0) % SPRINT_STAGES.length];
  const json = SIM_STAGES[stage] as StageJson;
  const chart = generate(json, 'ride', 1, seed >>> 0);
  return { stage, chart, roundMs: Math.ceil(chart.endMs) };
}

/** Longest round any seed can build (the registry's roundMs). */
export const ROUND_MS = Math.max(...SPRINT_STAGES.map((_, i) => buildBoard(i).roundMs));

export function validTaps(taps: unknown): taps is SprintTap[] {
  if (!Array.isArray(taps) || taps.length > MAX_TAPS) return false;
  let last = 0;
  for (const tap of taps) {
    if (!Array.isArray(tap) || tap.length !== 2) return false;
    const [t, c] = tap;
    if (!Number.isInteger(t) || !Number.isInteger(c)) return false;
    if (t < 0 || t > ROUND_MS || t < last || c < 0) return false;
    const { type, zone } = decodeTap(c);
    if (type !== T_DOWN && type !== T_UP && type !== T_LAUNCH && type !== T_MARCH) return false;
    if (zone > 4) return false;
    last = t;
  }
  return true;
}

/** Replay a tap log through the judge (8 ms ticks), up to untilMs. */
export function playLog(board: SprintBoard, taps: SprintTap[], untilMs: number = board.roundMs): JudgeState {
  const ch = board.chart;
  const s = createJudge(ch, {});
  const end = Math.min(untilMs, board.roundMs + 50);
  let now = 0;
  let e = 0;
  while (now <= end) {
    while (e < taps.length && taps[e][0] <= now && taps[e][0] < untilMs) {
      const [t, code] = taps[e++];
      const { type, zone, pointer } = decodeTap(code);
      if (type === T_DOWN) judgeDown(s, t, zone, pointer, 700);
      else if (type === T_UP) judgeUp(s, t, pointer);
      else if (type === T_MARCH) s.marchWant = zone ? 1 : 0;
    }
    judgeTick(s, now);
    now += TICK_MS;
  }
  finishJudge(s, Math.min(end, now), untilMs < board.roundMs);
  return s;
}

export function summarizeSprint(s: JudgeState): SprintResult {
  const bars = s.lastBar - s.firstBar + 1;
  const sum: number[] = [];
  const n: number[] = [];
  for (let b = 0; b < bars; b++) {
    sum.push(0);
    n.push(0);
  }
  let hits = 0;
  let perfects = 0;
  let misses = 0;
  const hitT: number[] = [];
  for (let i = 0; i < s.n; i++) {
    const r = s.res[i];
    const b = s.bar[i] - s.firstBar;
    if (b < 0 || b >= bars) continue;
    if (r >= J_SHARP && r <= J_GOOD) {
      hits++;
      if (r <= 2) perfects++;
      hitT.push(s.t[i]);
    }
    if (r === J_MISS || r === J_WRONG) misses++;
    if ((r >= J_SHARP && r <= J_GOOD) || r === J_MISS || r === J_WRONG) {
      sum[b] += ACCURACY_VALUE[r] ?? 0;
      n[b] += 1;
    }
  }
  const barPts: number[] = [];
  let score = 0;
  for (let b = 0; b < bars; b++) {
    const acc = n[b] > 0 ? Math.round(sum[b] / n[b]) : 0;
    const inFever = feverBarOf(s, s.firstBar + b);
    const pts = inFever ? Math.round((acc * 3) / 2) : acc;
    barPts.push(pts);
    score += pts;
  }
  return {
    score,
    points: s.score,
    hits,
    perfects,
    misses,
    maxCombo: s.maxCombo,
    accuracy10: Math.round(accuracyPct(s) * 10),
    barPts,
    hitT,
    feverBars: s.feverBarsUsed,
  };
}

/** Was this bar inside one of the run's Fever sections? (deployT holds [launchMs, dropBar] pairs.) */
function feverBarOf(s: JudgeState, bar: number): boolean {
  for (let i = 0; i + 1 < s.deployT.length; i += 2) {
    const drop = s.deployT[i + 1];
    if (bar >= drop && bar < drop + 4) return true;
  }
  return false;
}

export function resolve(board: SprintBoard, taps: SprintTap[], untilMs?: number): SprintResult {
  return summarizeSprint(playLog(board, taps, untilMs ?? board.roundMs));
}

const PROFILE: Record<SprintProfile, { sigma: number; lapse: number }> = {
  rookie: { sigma: 75, lapse: 0.08 },
  regular: { sigma: 48, lapse: 0.04 },
  ace: { sigma: 26, lapse: 0.01 },
};

function botSeed(seed: number, seat: number): number {
  return ((seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b1)) >>> 0;
}

/** A house drummer for an empty or dropped seat (the human model of core/sim.ts). */
export function botTaps(board: SprintBoard, seed: number, seat: number, profile: SprintProfile, fromMs = 0): SprintTap[] {
  const p = PROFILE[profile] ?? PROFILE.regular;
  const script = scriptHuman(board.chart, { sigmaMs: p.sigma, lapse: p.lapse, zoneSlip: 0.02 }, botSeed(seed, seat));
  const out: SprintTap[] = [];
  let last = 0;
  for (const ev of script) {
    const t = Math.round(ev.t);
    if (t < fromMs || t < 0 || t > board.roundMs) continue;
    if (ev.type !== 0 && ev.type !== 1) continue;
    const tt = Math.max(t, last);
    out.push([tt, encodeTap(ev.type === 0 ? T_DOWN : T_UP, ev.zone, 5000 + (ev.pid % 5000))]);
    last = tt;
  }
  return out;
}

export function ghostFill(board: SprintBoard, seed: number, seat: number, own: SprintTap[], untilMs: number, profile: SprintProfile): SprintTap[] {
  const mine = own.filter(([t]) => t < untilMs);
  // Close any touch still held at the drop, then the house drummer takes over.
  const open = new Set<number>();
  for (const [, c] of mine) {
    const d = decodeTap(c);
    if (d.type === T_DOWN) open.add(d.pointer);
    else if (d.type === T_UP) open.delete(d.pointer);
  }
  const closing: SprintTap[] = Array.from(open).map((p) => [untilMs, encodeTap(T_UP, 0, p)] as SprintTap);
  const ghost = botTaps(board, seed, seat, profile, untilMs + 1);
  const merged = [...mine, ...closing, ...ghost];
  merged.sort((a, b) => a[0] - b[0]);
  return merged;
}

/** FNV-1a over the canonical result (zero-tolerance claim check, golden vectors). */
export function resultHash(r: SprintResult): string {
  const text = [r.score, r.points, r.hits, r.perfects, r.misses, r.maxCombo, r.accuracy10, r.feverBars, r.barPts.join('.')].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The single biggest lost-points moment: the weakest bar. */
export function explain(board: SprintBoard, taps: SprintTap[]): { bar: number; pts: number } | null {
  const r = resolve(board, taps);
  if (!r.barPts.length) return null;
  let worst = 0;
  for (let b = 1; b < r.barPts.length; b++) if (r.barPts[b] < r.barPts[worst]) worst = b;
  return r.barPts[worst] >= 95 ? null : { bar: worst + 1, pts: r.barPts[worst] };
}

/** Seeded order of seats for any later room-level twist (kept for parity with other sims). */
export function seatOrder(seed: number, seats: number): number[] {
  const rand = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < seats; i++) out.push(i);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}
