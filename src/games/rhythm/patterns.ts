/**
 * patterns.ts — deterministic 8-hit rhythm pattern generation.
 *
 * A round is fully described by a numeric seed + difficulty, so the same seed
 * always yields the same target timeline. This is what lets the shell report
 * {score, maxCombo, seed} and the server replay/verify the run
 * (server-authoritative rewards, master-plan quality bar #6).
 *
 * Pure, framework-free. No React, no worklets.
 */

import {
  APPROACH_MS,
  BEAT_MS,
  DIFFICULTY,
  LEAD_IN_BEATS,
  SLOTS_PER_PATTERN,
  SLOT_MS,
} from './constants';

/** One scheduled tap target on the metronome timeline. */
export interface Target {
  /** Stable id (index in the timeline). */
  id: number;
  /** Absolute time on the game clock (ms) when the ring meets the target. */
  hitTimeMs: number;
  /** When the approaching ring first appears (hitTimeMs - APPROACH_MS). */
  spawnMs: number;
}

/** A generated round timeline. */
export interface RoundPlan {
  seed: number;
  difficulty: 1 | 2 | 3;
  targets: Target[];
  /** Time (ms) the last target resolves — used to end the round. */
  endMs: number;
  /** Total beats in the round (for the metronome tick schedule). */
  totalBeats: number;
}

// -- Mulberry32: tiny, fast, deterministic PRNG. ------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fresh random seed for a new round. */
export function makeSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}

/**
 * Build the full target timeline for a round.
 *
 * Structure: a lead-in of LEAD_IN_BEATS silent metronome beats, then
 * `patternCount` patterns of SLOTS_PER_PATTERN eighth-note slots each. Every
 * downbeat (slot 0 and 4 of a pattern) is guaranteed a target so the groove
 * never drops out; the remaining offbeat slots are gated by difficulty density.
 * At least one target always lands per pattern.
 */
export function buildRound(seed: number, difficulty: 1 | 2 | 3): RoundPlan {
  const rng = mulberry32(seed);
  const spec = DIFFICULTY[difficulty];
  const targets: Target[] = [];

  // First playable slot begins after the count-in.
  const startMs = LEAD_IN_BEATS * BEAT_MS;

  let id = 0;
  for (let p = 0; p < spec.patternCount; p++) {
    const patternStart = startMs + p * SLOTS_PER_PATTERN * SLOT_MS;
    let placedInPattern = 0;
    for (let s = 0; s < SLOTS_PER_PATTERN; s++) {
      const isDownbeat = s === 0 || s === 4;
      const place = isDownbeat || rng() < spec.density;
      if (!place) continue;
      const hitTimeMs = patternStart + s * SLOT_MS;
      targets.push({ id: id++, hitTimeMs, spawnMs: hitTimeMs - APPROACH_MS });
      placedInPattern++;
    }
    // Safety: guarantee at least one hit per pattern (density can't strand it
    // because downbeats are forced, but keep this defensive).
    if (placedInPattern === 0) {
      const hitTimeMs = patternStart;
      targets.push({ id: id++, hitTimeMs, spawnMs: hitTimeMs - APPROACH_MS });
    }
  }

  const last = targets[targets.length - 1];
  const endMs = (last ? last.hitTimeMs : startMs) + BEAT_MS * 2;
  const totalBeats = Math.ceil(endMs / BEAT_MS);

  return { seed, difficulty, targets, endMs, totalBeats };
}

/** Theoretical maximum score (every target a Perfect, full combo scaling). */
export function maxScoreFor(plan: RoundPlan): number {
  // Import kept local to avoid a cycle with constants' color block.
  const perfect = 300;
  // Combo multiplier climbs 1→5; approximate the ceiling as perfect * avgMult.
  // Average multiplier over a long full-combo run trends toward 5, but early
  // hits are lower. Use a conservative 3.2x so 3 stars is earnable but hard.
  const avgMult = 3.2;
  return Math.round(plan.targets.length * perfect * avgMult);
}
