/**
 * Banana Basket on Line Party: "Snack Dash", an 11-bar (20.5 s) micro-round (v2.1 adapter) for the
 * Party Series (design 11.2, multiplayer.md 4). Same shape as the shared
 * party sim registry entries (bonk_race, trivia_sprint): pure, integer-only,
 * replayable by the backend's Node sidecar from this exact file.
 *
 * Everyone in the room plays the same seed in their own field (rivals never
 * enter your field). The input is the sim's own per-step log, sent as a
 * change list: tap [ms, v] means "from logged step stepOf(ms) on, the input
 * is v" where v = targetQ4 * 2 + touch (the wire format; the sim logs q4 * 4 + touch). ms = floor(step * 1000 / 60) of the
 * player's LOGGED steps, so a personal HOLD (thumb up) costs nothing and
 * never pauses anyone else. A dropped or backgrounded seat is finished by its
 * ghost (ghostFill): their own inputs until the drop, then a bot plays on
 * from that exact state.
 *
 * Registry entry (for the netcode branch's src/games-registry/partySims.ts):
 *   snack_dash: { key: 'snack_dash', version: SNACK_DASH_VERSION, roundMs: ROUND_MS,
 *     maxTaps: MAX_TAPS, build, validTaps, resolve, botTaps, ghostFill, resultHash }
 */

import { BOT_CASUAL, BOT_EXPERT, BOT_HUMAN, botInput, createBot } from './bots';
import { mixSeed } from './fixed';
import { MODE_PARTY, PARTY_STEPS, createSim, finalScore, step, type SimConfig, type SimState } from './sim';

export const SNACK_DASH_VERSION = 2;
export const ROUND_MS = Math.floor((PARTY_STEPS * 1000) / 60);
/** Input changes per round (a 60 Hz change every step would be 1232; HOLD adds none). */
export const MAX_TAPS = 6000;
/** Hard cap on logged steps the replay will run (a stuck thumb-up log ends). */
export const MAX_STEPS = 6000;

export type SnackTap = [number, number];
export type SnackProfile = 'rookie' | 'regular' | 'ace';

export interface SnackBoard {
  seed: number;
  cfg: SimConfig;
}

export interface SnackResult {
  score: number;
  catches: number;
  perfects: number;
  maxChain: number;
  bounces: number;
  hearts: number;
  misses: number;
  ballLive: number;
  steps: number;
  clock: number;
}

export function msOfStep(i: number): number {
  return Math.floor((i * 1000) / 60);
}

export function stepOfMs(ms: number): number {
  return Math.floor((ms * 60 + 999) / 1000);
}

export function build(seed: number): SnackBoard {
  const s = seed >>> 0;
  return {
    seed: s,
    cfg: { seed: s, difficulty: 2, mode: MODE_PARTY, deck: 'park', unlock: 3, cards: 0xffff, assist: false, twist: 0 },
  };
}

export function validTaps(taps: unknown): taps is SnackTap[] {
  if (!Array.isArray(taps) || taps.length > MAX_TAPS) return false;
  let last = -1;
  for (const t of taps) {
    if (!Array.isArray(t) || t.length !== 2) return false;
    const [ms, v] = t as unknown[];
    if (!Number.isInteger(ms) || !Number.isInteger(v)) return false;
    if ((ms as number) < 0 || (ms as number) <= last) return false;
    if ((v as number) < 0 || (v as number) > 400 * 16 * 2 + 1) return false;
    last = ms as number;
  }
  return true;
}

/** Expand a change list into the per-step log the sim replays. */
function expand(taps: SnackTap[]): (i: number) => number {
  let k = 0;
  let cur = 200 * 16 * 2; // basket centred, thumb up
  return (i: number) => {
    while (k < taps.length && stepOfMs(taps[k][0]) <= i) {
      cur = taps[k][1];
      k++;
    }
    return cur;
  };
}

/** Compress a per-step log into a change list. */
export function compress(log: readonly number[]): SnackTap[] {
  const out: SnackTap[] = [];
  let prev = -1;
  for (let i = 0; i < log.length; i++) {
    if (log[i] !== prev) {
      out.push([msOfStep(i), log[i]]);
      prev = log[i];
    }
  }
  return out;
}

function run(board: SnackBoard, taps: SnackTap[]): SimState {
  const s = createSim(board.cfg);
  const at = expand(taps);
  let idle = 0;
  for (let i = 0; i < MAX_STEPS && !s.done; i++) {
    const v = at(i);
    step(s, v & 1, v >> 1);
    // A thumb-up tail with no further changes would never finish: stop after 1 s of zero progress.
    if (!(v & 1) && s.holdTs === 0) {
      idle++;
      if (idle > 60 && stepOfMs(taps.length ? taps[taps.length - 1][0] : 0) < i) break;
    } else idle = 0;
  }
  return s;
}

function summarize(s: SimState): SnackResult {
  return {
    score: s.done ? finalScore(s) : s.score,
    catches: s.catches,
    perfects: s.perfects,
    maxChain: s.maxChain,
    bounces: s.bounces,
    hearts: s.hearts,
    misses: s.misses,
    ballLive: s.ballLive,
    steps: s.steps,
    clock: s.clock,
  };
}

export function resolve(board: SnackBoard, taps: SnackTap[]): SnackResult {
  return summarize(run(board, taps));
}

const PROFILE_BOT = { rookie: BOT_CASUAL, regular: BOT_HUMAN, ace: BOT_EXPERT } as const;

export function botSeed(seed: number, seat: number): number {
  return mixSeed(seed >>> 0, 0x534e4b00 + seat) >>> 0;
}

/** Deterministic bot inputs for an empty seat, or from a given logged step on (fromMs). */
export function botTaps(board: SnackBoard, seed: number, seat: number, profile: SnackProfile, fromMs = 0): SnackTap[] {
  return ghostFill(board, seed, seat, [], fromMs, profile);
}

/** A dropped player's final log: their own inputs before `untilMs`, then their ghost from that state. */
export function ghostFill(board: SnackBoard, seed: number, seat: number, own: SnackTap[], untilMs: number, profile: SnackProfile): SnackTap[] {
  const s = createSim(board.cfg);
  const at = expand(own.filter(([t]) => t < untilMs));
  const until = stepOfMs(untilMs);
  const bot = createBot(PROFILE_BOT[profile], botSeed(seed, seat));
  for (let i = 0; i < MAX_STEPS && !s.done; i++) {
    if (i < until) {
      const v = at(i);
      step(s, v & 1, v >> 1);
    } else {
      if (i === until) bot.x = s.bx >> 8;
      const q4 = botInput(s, bot);
      step(s, 1, q4);
    }
  }
  return compress(s.log.map(toWire));
}

/** Sim log entry (q4 * 4 + autoRun * 2 + touch) to the wire value (q4 * 2 + touch). */
export function toWire(v: number): number {
  return (v >> 2) * 2 + (v & 1);
}

/** FNV-1a over the canonical result (zero-tolerance claim check). */
export function resultHash(r: SnackResult): string {
  const text = [r.score, r.catches, r.perfects, r.maxChain, r.bounces, r.hearts, r.misses, r.ballLive, r.steps, r.clock].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
