/**
 * Banana Basket proof (design section 10): the replay inputs plus the claimed
 * result. The server (WS7: TaskGameProofService + BananaReplay.php, a port of
 * sim.ts) replays `input` on `seed/difficulty/deck/mode/cards/unlock/twist`
 * and requires an exact score match. The client never computes a reward.
 *
 * input = base64 of zigzag varints, one per logged step:
 *   (zigzag(targetQ4 - prevTargetQ4) << 1) | touch
 * Frozen time logs nothing, so a 10 minute freeze adds 0 bytes.
 */

import { VERSION } from './constants';
import { base64ToBytes, bytesToBase64, readVarint, unzigzag, writeVarint, zigzag } from './fixed';
import { END_HEARTS, finalScore, MODE_QUEUE, replay, type SimConfig, type SimState } from './sim';

export function encodeInput(log: readonly number[]): string {
  const bytes: number[] = [];
  let prev = 0;
  for (let i = 0; i < log.length; i++) {
    const v = log[i];
    const touch = v & 1;
    const q4 = v >> 1;
    writeVarint(bytes, zigzag(q4 - prev) * 2 + touch);
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
    const touch = v % 2;
    const q4 = prev + unzigzag((v - touch) / 2);
    out.push(q4 * 2 + touch);
    prev = q4;
  }
  return out;
}

export interface BananaProof {
  game: 'banana';
  version: string;
  seed: number;
  difficulty: number;
  deck: string;
  mode: 'ride' | 'queue';
  unlock: number;
  twist: number;
  cards: number;
  assist: boolean;
  score: number;
  end: 'time' | 'hearts';
  logged_steps: number;
  clock_steps: number;
  elapsed_ms: number;
  input: string;
  freezes: number[][];
  gulls: number[][];
  catches: number;
  perfects: number;
  greats: number;
  saves: number;
  max_chain: number;
  hearts_left: number;
  fevers: number;
  banked: number;
  ball_bounces: number;
  gold_balls: number;
  grazes: number;
}

export function buildProof(cfg: SimConfig, s: SimState, elapsedMs: number, freezes: number[][] = []): BananaProof {
  // [receivedAt, applyAt, resolvedAt, cancelled]
  const gl: number[][] = [];
  for (let i = 0; i + 3 < s.gullLog.length; i += 4) gl.push([s.gullLog[i], s.gullLog[i + 1], s.gullLog[i + 2], s.gullLog[i + 3]]);
  return {
    game: 'banana',
    version: VERSION,
    seed: cfg.seed >>> 0,
    difficulty: cfg.difficulty,
    deck: cfg.deck,
    mode: cfg.mode === MODE_QUEUE ? 'queue' : 'ride',
    unlock: s.unlock,
    twist: s.twist,
    cards: cfg.cards,
    assist: !!cfg.assist && cfg.mode === MODE_QUEUE,
    score: finalScore(s),
    end: s.endReason === END_HEARTS ? 'hearts' : 'time',
    logged_steps: s.steps,
    clock_steps: s.clock,
    elapsed_ms: Math.round(elapsedMs),
    input: encodeInput(s.log),
    freezes,
    gulls: gl,
    catches: s.catches,
    perfects: s.perfects,
    greats: s.greats,
    saves: s.saves,
    max_chain: s.maxChain,
    hearts_left: s.hearts,
    fevers: s.fevers,
    banked: s.banked,
    ball_bounces: s.bounces,
    gold_balls: s.goldBalls,
    grazes: s.grazes,
  };
}

export function configFromProof(p: BananaProof): SimConfig {
  return {
    seed: p.seed >>> 0,
    difficulty: p.difficulty,
    mode: p.mode === 'queue' ? MODE_QUEUE : 0,
    deck: p.deck,
    unlock: p.unlock,
    cards: p.cards,
    assist: p.assist,
    twist: p.twist,
    gulls: p.gulls.flatMap((g) => [g[0], g[1]]),
  };
}

export interface ProofVerdict {
  ok: boolean;
  reason: string;
  score: number;
  state?: SimState;
}

/** What the server does (shape checks + full deterministic replay). */
export function verifyProof(p: BananaProof, opts: { expectSeed?: number; ride?: boolean } = {}): ProofVerdict {
  if (p.game !== 'banana' || p.version !== VERSION) return { ok: false, reason: 'version', score: 0 };
  if (opts.expectSeed !== undefined && (p.seed >>> 0) !== (opts.expectSeed >>> 0)) return { ok: false, reason: 'seed', score: 0 };
  if (opts.ride && (p.mode !== 'ride' || p.assist)) return { ok: false, reason: 'mode', score: 0 };
  if (p.logged_steps > 20000) return { ok: false, reason: 'too_long', score: 0 };
  if (p.elapsed_ms < p.logged_steps * 16.67 * 0.9) return { ok: false, reason: 'too_fast', score: 0 };
  let log: number[];
  try {
    log = decodeInput(p.input);
  } catch {
    return { ok: false, reason: 'input', score: 0 };
  }
  if (log.length !== p.logged_steps) return { ok: false, reason: 'steps', score: 0 };
  const s = replay(configFromProof(p), log);
  const score = finalScore(s);
  if (!s.done) return { ok: false, reason: 'unfinished', score, state: s };
  if (score !== p.score) return { ok: false, reason: 'score', score, state: s };
  if ((s.endReason === END_HEARTS ? 'hearts' : 'time') !== p.end) return { ok: false, reason: 'end', score, state: s };
  return { ok: true, reason: 'ok', score, state: s };
}
