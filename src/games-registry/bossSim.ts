/**
 * Boss Brawl sim entry for the server replay (design v7 12.6, 18.1).
 *
 * tools/boss/build-boss-sim-bundle.mjs bundles this exact file (and only its
 * relative, dependency-free imports) into a content-hashed CommonJS file the
 * backend's Node sim-runner loads beside the Line Party bundle and routes by
 * {game: 'boss', sim_version}. Every bundle is kept, so proofs from older app
 * builds replay with their own rules.
 *
 * The server never scores with anything else: it rebuilds the carry from bouts
 * 1..n-1 and replays bout n from its {t, k, a} input log.
 */
import { SIM_VERSION, BOSS_IDS, IN_BOON, IN_GETUP, IN_PAUSE, IN_END, IN_TARGET, IN_PAD_DOWN, OFFSET_CLAMP, type BossId } from '../games/boss/sim/constants';
import { END_TKO, scoreBout } from '../games/boss/sim/encounter';
import { replayRound, type BoutProof, type RoundLog } from '../games/boss/sim/round';
import { boonOffer } from '../games/boss/sim/patterns';
import { hashString } from '../gamekit/core/rng';

export const BOSS_GAME_KEY = 'boss';
export const BOSS_SIM_VERSION = SIM_VERSION;
/** Lane taps faster than this per second (outside a Knockdown) are not a human. */
export const MAX_INPUTS_PER_S = 7;
export const MAX_GETUP_PER_S = 14;

export interface BossBoutVerdict {
  n: number;
  ok: boolean;
  /** Reason code when rejected: offset, order, after_end, rate, getup_rate, pauses, boon, version, boss. */
  reason: string | null;
  damage: number;
  /** Events hash (zero-tolerance compare with the client's claim). */
  hash: string;
  tko: boolean;
}

/** Static checks on one bout proof before replay (design 18.1 rejects). */
export function checkBoutProof(p: BoutProof, seed: number): string | null {
  if (p.sim_version !== SIM_VERSION) return 'version';
  if (!Number.isInteger(p.input_offset_ms) || Math.abs(p.input_offset_ms) > OFFSET_CLAMP) return 'offset';
  let last = -1;
  let pauses = 0;
  let ended = false;
  const taps: number[] = [];
  const getups: number[] = [];
  for (const e of p.events) {
    if (!Number.isInteger(e.t) || e.t < 0 || e.t < last) return 'order';
    if (e.t > p.sim_ms + 1) return 'after_end';
    last = e.t;
    if (e.k === IN_PAUSE) pauses += 1;
    if (e.k === IN_END) ended = true;
    if (e.k === IN_TARGET || e.k === IN_PAD_DOWN) taps.push(e.t);
    if (e.k === IN_GETUP) getups.push(e.t);
    if (e.k === IN_BOON && (p.n < 2 || boonOffer(seed, p.n - 1).indexOf(e.a ?? -1) < 0)) return 'boon';
  }
  // A 3rd pause paintballs the bout in the sim; nothing may follow the end.
  if ((pauses >= 3 || ended) && p.events.length > 0 && p.events[p.events.length - 1].t > p.sim_ms) return 'after_end';
  for (let i = MAX_INPUTS_PER_S; i < taps.length; i++) if (taps[i] - taps[i - MAX_INPUTS_PER_S] < 1000) return 'rate';
  for (let i = MAX_GETUP_PER_S; i < getups.length; i++) if (getups[i] - getups[i - MAX_GETUP_PER_S] < 1000) return 'getup_rate';
  return null;
}

/** Replay a whole round's bout proofs; one verdict per bout (a TKO bout is accepted like a paintball). */
export function replayBossRound(log: RoundLog): BossBoutVerdict[] {
  if (BOSS_IDS.indexOf(log.boss as BossId) < 0) return log.bouts.map((p) => ({ n: p.n, ok: false, reason: 'boss', damage: 0, hash: '', tko: false }));
  const bouts = replayRound(log);
  return bouts.map((b, i) => {
    const p = log.bouts[i];
    const reason = checkBoutProof(p, log.seed);
    const hash = (hashString(JSON.stringify(b.events)) >>> 0).toString(16);
    const damage = scoreBout(b);
    return { n: p.n, ok: reason === null, reason, damage: reason === null ? damage : 0, hash, tko: b.endReason === END_TKO };
  });
}

export const BOSS_SIM = {
  key: BOSS_GAME_KEY,
  version: BOSS_SIM_VERSION,
  replayRound: replayBossRound,
  checkBoutProof,
};
