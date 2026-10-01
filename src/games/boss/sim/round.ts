/**
 * A Boss Brawl round = 3 bouts with free intermissions. This module turns a
 * round's bout logs into:
 *   - the v7 bout proofs WS6's replay endpoint will verify (design 18.1),
 *   - the legacy raid proof the live endpoint verifies today
 *     ({hits, weak_hits, duration_ms}: damage = 10 x hits + 20 x weak_hits,
 *     weak_hits <= hits / 3, hits <= 7 per second), encoded so the server's
 *     own formula gives exactly the replayed damage (rounded down to 10),
 *   - stars, NEXT STAR in actions and the results readout.
 */
import { SIM_VERSION, STAR_POINTS, type BossId } from './constants';
import {
  END_TKO, carryOut, freshCarry, medianError, replayBout, scoreBout, type Bout, type BoutConfig, type Carry, type InputEvent,
} from './encounter';

export const LEGACY_MIN_MS = 12000;
export const LEGACY_MAX_MS = 26000;
export const LEGACY_MAX_HPS = 7;

export interface BoutProof {
  n: number;
  events: InputEvent[];
  sim_ms: number;
  walk: boolean;
  input_offset_ms: number;
  pauses: number;
  team: boolean;
  /** First 3 rounds vs this boss (Grit floor in bout 1); the server checks it against history. */
  novice: boolean;
  sim_version: number;
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
  popPerfect: number;
  pops: number;
  hits: number;
  slams: number;
  breaks: number;
  punishes: number;
  knockdowns: number;
  getups: number;
  tko: boolean;
  /** TKO'd before bout 3 (the Ride Challenge win rule needs bout 3). */
  tkoEarly: boolean;
  fakes: number;
  dizzy: number;
  maxChain: number;
  /** Final Pop grade: 3 perfect pop, 2 pop, 1 hit, 0 miss, -1 never reached. */
  final: number;
  anchorStars: number;
  skillStar: boolean;
  medianErr: number;
  popErr: number;
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
  const popPerfect = sum((b) => b.stats.popPerfect);
  const pops = sum((b) => b.stats.pop);
  const hits = sum((b) => b.stats.hit);
  const slams = sum((b) => b.stats.slam);
  const converted = perfect + good > 0 && popPerfect + pops + hits + slams > 0;
  const stars = starsFor(damage, converted);
  const last = bouts[bouts.length - 1];
  const tkoAt = bouts.findIndex((b) => b.endReason === END_TKO);
  const s: RoundSummary = {
    damage, perBout, stars, perfect, good, popPerfect, pops, hits, slams,
    breaks: last ? last.carry.breaks : 0,
    punishes: sum((b) => b.stats.punish),
    knockdowns: last ? last.carry.knockdowns : 0,
    getups: sum((b) => b.stats.getup),
    tko: tkoAt >= 0,
    tkoEarly: tkoAt >= 0 && tkoAt < 2,
    fakes: sum((b) => b.stats.fakes),
    dizzy: sum((b) => b.stats.guard),
    maxChain: last ? last.carry.maxChain : 0,
    final: bouts.length >= 3 ? bouts[2].stats.final : -1,
    anchorStars: last ? last.carry.stars : 0,
    skillStar: last ? last.carry.skillStar : false,
    medianErr: medianError(errs),
    popErr: medianError(bouts.flatMap((b) => b.stats.popErr)),
    simMs: sum((b) => Math.max(0, b.endT)),
    converted,
    nextStar: null,
  };
  s.nextStar = nextStarHint(s);
  return s;
}

/** Ride Challenge rule (design 9.5): 2 stars under replay and not TKO'd before bout 3. */
export function rideChallengeWin(s: RoundSummary): boolean {
  return s.stars >= 2 && !s.tkoEarly;
}

/** NEXT STAR in actions, computed from the player's own round (design 5.3, 8.2). */
export function nextStarHint(s: RoundSummary): string | null {
  if (s.stars === 3) return null;
  if (!s.converted) return 'Tap the buoy under the shadow as it lands';
  if (s.tkoEarly) return 'Watch the shadow, tap its buoy';
  const target = s.stars === 0 ? STAR_POINTS.one : s.stars === 1 ? STAR_POINTS.two : STAR_POINTS.three;
  const need = target - s.damage;
  if (need <= 0) return null;
  if (s.slams > 0 && s.slams >= s.popPerfect + s.pops) return 'Pop instead of slam: about +20%';
  if (s.breaks < 3 && need <= 200) return '+1 Break';
  if (need <= 16 * 6) return `+${Math.max(1, Math.ceil(need / 16))} PERFECTs`;
  return `Land ${Math.ceil(need / 34)} more POPs`;
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
      boss: log.boss, seed: log.seed, bout: n, carry, walk: p.walk, offset: p.input_offset_ms,
      variant: log.variant, team: p.team, novice: !!p.novice,
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
    input_offset_ms: b.cfg.offset, pauses: b.pauses, team: b.cfg.team, novice: b.cfg.novice, sim_version: SIM_VERSION,
    damage: scoreBout(b),
  };
}
