/**
 * Banana Basket proof bb2r8 (design section 10): the replay inputs plus the
 * claimed result. The server (WS7: TaskGameProofService + BananaReplay.php, a
 * port of sim.ts) replays `input` on seed / difficulty / deck / mode / rules /
 * unlock / cards / twist / assist and requires an exact score match. Every
 * stat is recomputed by the replay; `freezes` is telemetry only. The client
 * never computes a reward.
 *
 * input = base64 of zigzag varints, one per logged step:
 *   (zigzag(targetQ4 - prevTargetQ4) << 2) | (autoRun << 1) | touch
 * Frozen time logs nothing, so a 10 minute freeze adds 0 bytes.
 */

import { R_INTRO, RULES_NAMES, VERSION } from './constants';
import { base64ToBytes, bytesToBase64, readVarint, unzigzag, writeVarint, zigzag } from './fixed';
import {
  END_HEARTS, MODE_HEAT, MODE_QUEUE, MODE_RIDE, ballShare, finalScore, replay, type SimConfig, type SimState,
} from './sim';

export function encodeInput(log: readonly number[]): string {
  const bytes: number[] = [];
  let prev = 0;
  for (let i = 0; i < log.length; i++) {
    const v = log[i];
    const low = v & 3;
    const q4 = (v - low) / 4;
    writeVarint(bytes, zigzag(q4 - prev) * 4 + low);
    prev = q4;
  }
  return bytesToBase64(bytes);
}

export function decodeInput(text: string, maxSteps = 40000): number[] {
  const bytes = base64ToBytes(text);
  const out: number[] = [];
  const pos = { i: 0 };
  let prev = 0;
  while (pos.i < bytes.length) {
    if (out.length >= maxSteps) throw new Error('proof: too many steps');
    const v = readVarint(bytes, pos);
    const low = v % 4;
    const q4 = prev + unzigzag((v - low) / 4);
    out.push(q4 * 4 + low);
    prev = q4;
  }
  return out;
}

export type ProofMode = 'ride' | 'queue' | 'heat';

export interface BananaProof {
  game: 'banana';
  version: string;
  seed: number;
  difficulty: number;
  deck: string;
  mode: ProofMode;
  rules: 'ride_intro' | 'ride' | 'queue' | 'heat';
  unlock: number;
  cards: number;
  twist: number | null;
  assist: boolean;
  heat_id: number | null;
  ghost_ref: string | null;
  score: number;
  end: 'time' | 'hearts';
  logged_steps: number;
  clock_steps: number;
  elapsed_ms: number;
  input: string;
  freezes: number[][];
  catches: number;
  perfects: number;
  pops: number;
  bonks: number;
  close_calls: number;
  shields: number;
  max_chain: number;
  hearts_left: number;
  fevers: number;
  ball_bounces: number;
  best_life_bounces: number;
  gold_balls: number;
  ball_live_steps: number;
  pail_saves: number;
  misses: number;
  forks_ball: number;
  forks_bunch: number;
  forks_both: number;
  ball_share: number;
}

function modeName(mode: number): ProofMode {
  return mode === MODE_QUEUE ? 'queue' : mode === MODE_HEAT ? 'heat' : 'ride';
}

export function buildProof(
  cfg: SimConfig, s: SimState, elapsedMs: number, freezes: number[][] = [], ghostRef: string | null = null,
): BananaProof {
  return {
    game: 'banana',
    version: VERSION,
    seed: cfg.seed >>> 0,
    difficulty: s.diff,
    deck: cfg.deck,
    mode: modeName(s.mode),
    rules: RULES_NAMES[s.rules],
    unlock: s.unlock,
    cards: cfg.cards | 0,
    twist: s.twist > 0 ? s.twist : null,
    assist: s.assist === 1,
    heat_id: s.mode === MODE_HEAT ? (cfg.heatId ?? null) : null,
    ghost_ref: ghostRef,
    score: finalScore(s),
    end: s.endReason === END_HEARTS ? 'hearts' : 'time',
    logged_steps: s.steps,
    clock_steps: s.clock,
    elapsed_ms: Math.round(elapsedMs),
    input: encodeInput(s.log),
    freezes,
    catches: s.catches,
    perfects: s.perfects,
    pops: s.pops,
    bonks: s.bonks,
    close_calls: s.closeCalls,
    shields: s.shields,
    max_chain: s.maxChain,
    hearts_left: s.hearts,
    fevers: s.fevers,
    ball_bounces: s.bounces,
    best_life_bounces: s.bestLife,
    gold_balls: s.goldBalls,
    ball_live_steps: s.ballLive,
    pail_saves: s.pailSaves,
    misses: s.misses,
    forks_ball: s.forksBall,
    forks_bunch: s.forksBunch,
    forks_both: s.forksBoth,
    ball_share: ballShare(s),
  };
}

export function configFromProof(p: BananaProof): SimConfig {
  const mode = p.mode === 'queue' ? MODE_QUEUE : p.mode === 'heat' ? MODE_HEAT : MODE_RIDE;
  return {
    seed: p.seed >>> 0,
    difficulty: p.difficulty,
    mode,
    rules: p.rules === 'ride_intro' ? R_INTRO : 1,
    deck: p.deck,
    unlock: p.unlock,
    cards: p.cards,
    assist: p.assist,
    twist: p.twist ?? 0,
    heatId: p.heat_id,
  };
}

export interface ProofVerdict {
  ok: boolean;
  reason: string;
  score: number;
  state?: SimState;
}

/** Stats the replay recomputes; every one must match the claim. */
const STAT_KEYS: [keyof BananaProof, (s: SimState) => number][] = [
  ['catches', (s) => s.catches], ['perfects', (s) => s.perfects], ['pops', (s) => s.pops], ['bonks', (s) => s.bonks],
  ['close_calls', (s) => s.closeCalls], ['shields', (s) => s.shields], ['max_chain', (s) => s.maxChain],
  ['hearts_left', (s) => s.hearts], ['fevers', (s) => s.fevers], ['ball_bounces', (s) => s.bounces],
  ['best_life_bounces', (s) => s.bestLife], ['gold_balls', (s) => s.goldBalls], ['ball_live_steps', (s) => s.ballLive],
  ['pail_saves', (s) => s.pailSaves], ['misses', (s) => s.misses], ['forks_ball', (s) => s.forksBall],
  ['forks_bunch', (s) => s.forksBunch], ['forks_both', (s) => s.forksBoth], ['ball_share', (s) => ballShare(s)],
  ['clock_steps', (s) => s.clock],
];

/** What the server does (shape checks + full deterministic replay). */
export function verifyProof(
  p: BananaProof, opts: { expectSeed?: number; ride?: boolean; expectRules?: 'ride_intro' | 'ride'; heatId?: number } = {},
): ProofVerdict {
  if (p.game !== 'banana' || p.version !== VERSION) return { ok: false, reason: 'version', score: 0 };
  if (opts.expectSeed !== undefined && (p.seed >>> 0) !== (opts.expectSeed >>> 0)) return { ok: false, reason: 'seed', score: 0 };
  if (opts.ride && (p.mode !== 'ride' || p.assist || p.twist !== null)) return { ok: false, reason: 'mode', score: 0 };
  if (opts.expectRules && p.rules !== opts.expectRules) return { ok: false, reason: 'rules', score: 0 };
  if (opts.heatId !== undefined && (p.mode !== 'heat' || p.heat_id !== opts.heatId)) return { ok: false, reason: 'heat', score: 0 };
  if (p.logged_steps > 20000) return { ok: false, reason: 'too_long', score: 0 };
  if (p.elapsed_ms < p.logged_steps * 16.67 * 0.9) return { ok: false, reason: 'too_fast', score: 0 };
  let log: number[];
  try {
    log = decodeInput(p.input);
  } catch {
    return { ok: false, reason: 'input', score: 0 };
  }
  if (log.length !== p.logged_steps) return { ok: false, reason: 'steps', score: 0 };
  // autoRun is v2.1 live duels only.
  for (let i = 0; i < log.length; i++) if ((log[i] & 2) !== 0) return { ok: false, reason: 'auto_run', score: 0 };
  const s = replay(configFromProof(p), log);
  const score = finalScore(s);
  if (!s.done) return { ok: false, reason: 'unfinished', score, state: s };
  if (score !== p.score) return { ok: false, reason: 'score', score, state: s };
  if ((s.endReason === END_HEARTS ? 'hearts' : 'time') !== p.end) return { ok: false, reason: 'end', score, state: s };
  for (const [k, f] of STAT_KEYS) if (p[k] !== f(s)) return { ok: false, reason: `stat:${String(k)}`, score, state: s };
  return { ok: true, reason: 'ok', score, state: s };
}
