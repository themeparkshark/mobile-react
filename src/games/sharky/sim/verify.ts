/**
 * Swim proof: build (client) and verify (server Node verifier, tests).
 * The payload is the single source of truth in design section 11.2.
 * tools/sharky/build-verifier.cjs bundles this file plus core.ts into
 * verifiers/swim/verify.cjs for WS7 (stdin JSON -> stdout JSON).
 */

import {
  MODE_NAMES, MODE_RIDE, END_GATE, END_FINISH,
  decodeInputs, encodeInputs, finalHash, plausibility, replay,
  type InputEntry, type Plausibility, type SimConfig, type SimState,
} from './core';
import { SIM_VERSION } from './version.generated';

export interface SwimProof {
  game: 'swim';
  sim_version: string;
  attempt_id: string | null;
  course_id: string | null;
  descriptor_sigs: string[];
  offline_segments: number[];
  mode: string;
  seed: number;
  difficulty: number;
  unlock_tier: number;
  runs: number;
  inputs: string;
  steps_total: number;
  score: number;
  distance: number;
  hearts_left: number;
  tokens: number;
  reached_gate: boolean;
  frenzy_banked: number;
  state_hash: number;
  elapsed_ms: number;
  finish_step: number;
}

export function buildSwimProof(cfg: SimConfig, entries: InputEntry[], s: SimState, elapsedMs: number,
  extra: { attemptId?: string | null; courseId?: string | null; sigs?: string[]; offline?: number[] } = {}): SwimProof {
  return {
    game: 'swim',
    sim_version: SIM_VERSION,
    attempt_id: extra.attemptId ?? null,
    course_id: extra.courseId ?? null,
    descriptor_sigs: extra.sigs ?? [],
    // Descriptors are generated locally until WS7 streams signed ones.
    offline_segments: extra.offline ?? Array.from({ length: Math.max(1, s.sprint + 1) }, (_, i) => i),
    mode: MODE_NAMES[cfg.mode] ?? 'queue',
    seed: cfg.seed,
    difficulty: cfg.difficulty,
    unlock_tier: cfg.tier,
    runs: cfg.runs,
    inputs: encodeInputs(entries),
    steps_total: s.step,
    score: s.score,
    distance: s.dist >> 8,
    hearts_left: s.hearts,
    tokens: s.tokens,
    reached_gate: s.endReason === END_GATE || s.endReason === END_FINISH,
    frenzy_banked: s.banked,
    state_hash: finalHash(s),
    elapsed_ms: Math.round(elapsedMs),
    finish_step: s.finishStep,
  };
}

export interface SwimVerdict {
  ok: boolean;
  reason: string;
  score: number;
  win: boolean;
  plausibility: Plausibility;
  sim_version: string;
}

/** Max input events in any 2s (120-step) window: 30/s (design 11.3). */
export const INPUT_RATE_MAX_PER_2S = 60;

export function inputRateOk(entries: InputEntry[]): boolean {
  for (let i = 0, j = 0; i < entries.length; i++) {
    while (entries[i].step - entries[j].step >= 120) j++;
    if (i - j + 1 > INPUT_RATE_MAX_PER_2S) return false;
  }
  return true;
}

const MODES: Record<string, number> = { queue: 0, ride: 1, race: 2, ghost: 3, practice: 4 };

/** Replay a proof and compare every claimed field. Never trusts the client. */
export function verifySwimProof(p: SwimProof): SwimVerdict {
  const fail = (reason: string, score = 0): SwimVerdict => ({
    ok: false, reason, score, win: false, sim_version: SIM_VERSION,
    plausibility: { reactN: 0, reactMeanSteps: 0, reactFast: 0, holdEntropyBits: 0, perfectTightRatio: 0, flagged: false, reasons: [] },
  });
  if (!p || p.game !== 'swim') return fail('bad_game');
  if (p.sim_version !== SIM_VERSION) return fail('unknown_sim_version');
  const mode = MODES[p.mode];
  if (mode === undefined) return fail('bad_mode');
  if (!Number.isInteger(p.steps_total) || p.steps_total < 1 || p.steps_total > 60 * 60 * 20) return fail('bad_steps');
  if (!(p.elapsed_ms >= (p.steps_total * 1000) / 60 - 500)) return fail('too_fast');
  let entries: InputEntry[];
  try {
    entries = decodeInputs(String(p.inputs || ''));
  } catch {
    return fail('bad_inputs');
  }
  // Design v5 (11.3): at most 30 input events per second over any 2s window.
  // Expert feathering at 7-8 taps/s is 14-16 events/s plus Dashes; the replay
  // proves physical plausibility and 11.4 catches bots.
  if (!inputRateOk(entries)) return fail('input_rate');
  if (entries.length && entries[entries.length - 1].step > p.steps_total) return fail('input_after_end');
  const cfg: SimConfig = { seed: p.seed | 0, mode, difficulty: p.difficulty | 0, tier: p.unlock_tier | 0, runs: p.runs | 0 };
  const s = replay(cfg, entries, p.steps_total);
  if (s.step !== p.steps_total) return fail('step_mismatch', s.score);
  const checks: [string, boolean][] = [
    ['score', s.score === p.score],
    ['distance', (s.dist >> 8) === p.distance],
    ['hearts', s.hearts === p.hearts_left],
    ['tokens', s.tokens === p.tokens],
    ['frenzy_banked', s.banked === p.frenzy_banked],
    ['state_hash', finalHash(s) === p.state_hash],
    ['reached_gate', (s.endReason === END_GATE || s.endReason === END_FINISH) === p.reached_gate],
  ];
  for (const [name, ok] of checks) if (!ok) return fail(`mismatch_${name}`, s.score);
  const win = mode === MODE_RIDE ? s.endReason === END_GATE && s.hearts >= 1 : s.score > 0;
  return { ok: true, reason: 'ok', score: s.score, win, plausibility: plausibility(s), sim_version: SIM_VERSION };
}
