/**
 * A Boss Brawl round = 3 bouts with free intermissions. This module turns a
 * round's bout logs into:
 *   - the v4 bout proofs WS6's replay endpoint will verify (design 16.1),
 *   - the legacy raid proof the live endpoint verifies today
 *     ({hits, weak_hits, duration_ms}: damage = 10 x hits + 20 x weak_hits,
 *     weak_hits <= hits / 3, hits <= 7 per second), encoded so the server's
 *     own formula gives exactly the replayed damage (rounded down to 10),
 *   - stars, NEXT STAR in actions and the results readout.
 */
import { STAR_POINTS, type BossId } from './constants';
import {
  carryOut, freshCarry, medianError, replayBout, scoreBout, type Bout, type BoutConfig, type Carry, type InputEvent,
} from './encounter';

export const LEGACY_MIN_MS = 12000;
export const LEGACY_MAX_MS = 26000;
export const LEGACY_MAX_HPS = 7;

export interface BoutProof {
  n: number;
  events: InputEvent[];
  sim_ms: number;
  walk: boolean;
  tide: boolean;
  input_offset_ms: number;
  pauses: number;
  team: boolean;
  damage: number;
}

export interface LegacyProof { hits: number; weak_hits: number; duration_ms: number }

/** Server formula (BossRaidService::attack), including the remote rate floor. */
export function legacyDamage(p: LegacyProof, rate = 1): number {
  const full = p.hits * 10 + p.weak_hits * 20;
  return rate === 1 ? full : Math.floor(full * rate);
}

/**
 * Encode replayed damage as a legacy proof the live endpoint accepts. Every
 * 5 units of 10 points = 3 hits + 1 weak hit (50 points), the remainder as
 * plain hits. Capped by the endpoint's 7 hits/s over duration_ms.
 */
export function toLegacyProof(damage: number, simMs: number): LegacyProof {
  const duration = Math.max(LEGACY_MIN_MS, Math.min(LEGACY_MAX_MS, Math.trunc(simMs)));
  const maxHits = Math.floor((duration / 1000) * LEGACY_MAX_HPS);
  let units = Math.max(0, Math.floor(damage / 10));
  // Largest representable: hits = maxHits, weak = floor(maxHits / 3).
  const maxUnits = maxHits + 2 * Math.floor(maxHits / 3);
  if (units > maxUnits) units = maxUnits;
  for (; units > 0; units--) {
    // hits = units - 2 x weak; need hits <= maxHits and weak <= floor(hits / 3).
    const weak = Math.max(Math.floor(units / 5), Math.ceil((units - maxHits) / 2));
    const hits = units - 2 * weak;
    if (weak >= 0 && hits >= 0 && hits <= maxHits && weak <= Math.floor(hits / 3)) {
      return { hits, weak_hits: weak, duration_ms: duration };
    }
  }
  return { hits: 0, weak_hits: 0, duration_ms: duration };
}

export function starsFor(points: number, convertedOpening: boolean): 0 | 1 | 2 | 3 {
  if (!convertedOpening || points < STAR_POINTS.one) return 0;
  if (points >= STAR_POINTS.three) return 3;
  if (points >= STAR_POINTS.two) return 2;
  return 1;
}

export interface RoundSummary {
  damage: number;
  perBout: number[];
  stars: 0 | 1 | 2 | 3;
  perfect: number;
  good: number;
  crits: number;
  hits: number;
  heavies: number;
  breaks: number;
  punishes: number;
  maxChain: number;
  finisher: number;
  medianErr: number;
  simMs: number;
  converted: boolean;
  nextStar: string | null;
}

export function summarize(bouts: readonly Bout[]): RoundSummary {
  const perBout = bouts.map((b) => scoreBout(b));
  const damage = perBout.reduce((s, x) => s + x, 0);
  const sum = (f: (b: Bout) => number) => bouts.reduce((s, b) => s + f(b), 0);
  const errs = bouts.flatMap((b) => b.stats.counterErr);
  const perfect = sum((b) => b.stats.perfect);
  const good = sum((b) => b.stats.good);
  const crits = sum((b) => b.stats.crit);
  const hits = sum((b) => b.stats.hit);
  const heavies = sum((b) => b.stats.heavy);
  const converted = perfect + good > 0 && crits + hits + heavies > 0;
  const stars = starsFor(damage, converted);
  const last = bouts[bouts.length - 1];
  const s: RoundSummary = {
    damage, perBout, stars, perfect, good, crits, hits, heavies,
    breaks: last ? last.carry.breaks : 0,
    punishes: sum((b) => b.stats.punish),
    maxChain: last ? last.carry.maxChain : 0,
    finisher: last ? last.stats.finisher : -1,
    medianErr: medianError(errs),
    simMs: sum((b) => Math.max(0, b.endT)),
    converted,
    nextStar: null,
  };
  s.nextStar = nextStarHint(s);
  return s;
}

/** NEXT STAR in actions, computed from the player's own round (design 7.2). */
export function nextStarHint(s: RoundSummary): string | null {
  if (s.stars === 3) return null;
  if (!s.converted) return 'Tap the buoy as the tentacle lands';
  const target = s.stars === 0 ? STAR_POINTS.one : s.stars === 1 ? STAR_POINTS.two : STAR_POINTS.three;
  const need = target - s.damage;
  if (need <= 0) return null;
  if (s.breaks < 3 && need <= 200) return '+1 Break';
  if (need <= 25 * 4) return `+${Math.max(1, Math.ceil(need / 25))} PERFECTs`;
  const crits = Math.ceil(need / 42);
  return `Land ${crits} more ring crits`;
}

export function timingReadout(medianErr: number): string {
  if (Math.abs(medianErr) <= 15) return 'Right on the beat';
  return medianErr < 0 ? `You were ${-medianErr} ms early` : `You were ${medianErr} ms late`;
}

export interface RoundLog {
  boss: BossId;
  seed: number;
  variant: number;
  bouts: BoutProof[];
}

/** Rebuild a whole round from its bout proofs (server replay and ghosts). */
export function replayRound(log: RoundLog): Bout[] {
  let carry: Carry = freshCarry();
  const out: Bout[] = [];
  log.bouts.forEach((p, n) => {
    const cfg: BoutConfig = {
      boss: log.boss, seed: log.seed, bout: n, carry, walk: p.walk, tide: p.tide, offset: p.input_offset_ms,
      variant: log.variant, team: p.team,
    };
    const b = replayBout(cfg, p.events, p.sim_ms);
    out.push(b);
    carry = carryOut(b);
  });
  return out;
}

export function boutProof(b: Bout): BoutProof {
  return {
    n: b.cfg.bout + 1, events: b.log.map((e) => ({ ...e })), sim_ms: Math.max(0, b.endT), walk: b.cfg.walk,
    tide: b.cfg.tide, input_offset_ms: b.cfg.offset, pauses: b.pauses, team: b.cfg.team, damage: scoreBout(b),
  };
}
