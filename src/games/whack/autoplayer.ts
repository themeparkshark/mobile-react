/**
 * autoplayer.ts: scripted players for tuning gates and the dev autoplay
 * (design 12, "Dev tooling"). Pure and seeded: the same profile + seed always
 * plays the same run, so tuning numbers are reproducible in node tests.
 *
 * Reaction times are measured from emerge (the pop), the moment a casual
 * player actually sees the target. Wall time and game time are the same here
 * except while the board is frozen by Auto Look-Up (the clock stops).
 */

import { createRng, rngFloat, rngGaussian, rngInt, type Rng } from '../../gamekit/core/rng';
import {
  E_EMERGE, E_FREEZE, E_SPLAT, P_UP, SPLAT_DOWN, createSim, simAdvance, simResult, simSwipe, simTap,
  type BurstCarry, type BurstResult, type WhackSim,
} from './sim';
import type { Timeline } from './timeline';
import { K_ANGLER, K_BRUISER, K_HELMET, K_PUFFER } from './waves';

export type ProfileName = 'novice' | 'median' | 'expert' | 'bot' | 'glance' | 'walking' | 'masher';

export interface Profile {
  median: number;
  sd: number;
  /** Chance to bonk a decoy anyway. */
  decoyMistake: number;
  /** Fraction of wall time looking away (at the line), in gaps of 1-3s. */
  lookAway: number;
  /** Stray bump taps per second (walking in line). */
  bumpsPerSec: number;
  /** Random mash taps per second (ignores the board). */
  mashPerSec: number;
  /** Chance to miss a target entirely while looking. */
  miss: number;
}

export const PROFILES: Record<ProfileName, Profile> = {
  novice: { median: 520, sd: 120, decoyMistake: 0.1, lookAway: 0, bumpsPerSec: 0, mashPerSec: 0, miss: 0.08 },
  median: { median: 420, sd: 90, decoyMistake: 0.04, lookAway: 0, bumpsPerSec: 0, mashPerSec: 0, miss: 0.03 },
  expert: { median: 300, sd: 60, decoyMistake: 0.01, lookAway: 0, bumpsPerSec: 0, mashPerSec: 0, miss: 0 },
  bot: { median: 140, sd: 8, decoyMistake: 0, lookAway: 0, bumpsPerSec: 0, mashPerSec: 0, miss: 0 },
  glance: { median: 420, sd: 90, decoyMistake: 0.04, lookAway: 0.3, bumpsPerSec: 0, mashPerSec: 0, miss: 0.03 },
  walking: { median: 540, sd: 110, decoyMistake: 0.06, lookAway: 0.15, bumpsPerSec: 1 / 20, mashPerSec: 0, miss: 0.05 },
  masher: { median: 0, sd: 0, decoyMistake: 1, lookAway: 0, bumpsPerSec: 0, mashPerSec: 12, miss: 1 },
};

interface Plan { at: number; hole: number; swipe: boolean }

export interface AutoplayStats {
  /** Targets that escaped while the last touch was more than 1200 ms old (must be 0). */
  disengagedEscapes: number;
  /** Wall time spent frozen by Auto Look-Up. */
  frozenWallMs: number;
  /** Resumes after a freeze. */
  resumes: number;
  wallMs: number;
}

function reaction(r: Rng, p: Profile): number {
  return Math.max(120, p.median + rngGaussian(r) * p.sd);
}

/**
 * Play one Burst with a profile. Returns the sim (with its tap log) and stats.
 * `maxWallMs` bounds the loop (a disengaged player never finishes otherwise).
 */
export function autoplayBurst(tl: Timeline, profile: ProfileName | Profile, seed: number, carry?: BurstCarry,
  maxWallMs = 180000): { sim: WhackSim; result: BurstResult; stats: AutoplayStats } {
  const p = typeof profile === 'string' ? PROFILES[profile] : profile;
  const r = createRng(seed ^ 0x5eed);
  const s = createSim(tl, carry, true);
  const plans: Plan[] = [];
  const stats: AutoplayStats = { disengagedEscapes: 0, frozenWallMs: 0, resumes: 0, wallMs: 0 };
  let looking = true;
  let lookSwitchAt = 0;
  let nextBump = p.bumpsPerSec > 0 ? 1000 / p.bumpsPerSec * (0.5 + rngFloat(r)) : Infinity;
  let nextMash = p.mashPerSec > 0 ? 1000 / p.mashPerSec : Infinity;
  let resumeAt = -1;
  let wall = 0;

  const scheduleLookSwitch = () => {
    if (p.lookAway <= 0) { lookSwitchAt = Infinity; return; }
    const away = 1000 + rngFloat(r) * 2000;
    // Duty cycle: away fraction p.lookAway of the time.
    const on = away * (1 - p.lookAway) / p.lookAway;
    lookSwitchAt = wall + (looking ? on * (0.6 + rngFloat(r) * 0.8) : away);
  };
  scheduleLookSwitch();

  while (!s.ended && wall < maxWallMs) {
    wall += 1;
    if (wall >= lookSwitchAt) {
      looking = !looking;
      scheduleLookSwitch();
    }
    if (s.frozen) {
      stats.frozenWallMs += 1;
      if (looking && resumeAt < 0) resumeAt = wall + reaction(r, p);
      if (looking && wall >= resumeAt) {
        // Resume by bonking a live target (it grades at the frozen time).
        let hole = -1;
        for (let h = 0; h < 9; h++) {
          if (s.hPh[h] === P_UP && s.hSplat[h] !== SPLAT_DOWN && s.evKind[s.hEv[h]] !== K_ANGLER && s.evKind[s.hEv[h]] !== K_PUFFER) { hole = h; break; }
        }
        simTap(s, hole >= 0 ? hole : 4);
        stats.resumes += 1;
        resumeAt = -1;
      }
      continue;
    }
    simAdvance(s, 1);
    // Read new events.
    for (let i = 0; i < s.ev.length; i += 5) {
      const kind = s.ev[i];
      const h = s.ev[i + 1];
      if (kind === E_EMERGE && p.mashPerSec === 0) {
        const k = s.ev[i + 2];
        if (rngFloat(r) < p.miss) continue;
        const decoy = k === K_ANGLER || k === K_PUFFER;
        if (decoy && rngFloat(r) >= p.decoyMistake) continue;
        const at = wall + reaction(r, p);
        plans.push({ at, hole: h, swipe: false });
        if (k === K_HELMET) plans.push({ at: at + 180 + rngFloat(r) * 120, hole: h, swipe: false });
        if (k === K_BRUISER) for (let j = 1; j < 5; j++) plans.push({ at: at + j * (200 + rngFloat(r) * 60), hole: h, swipe: false });
      } else if (kind === E_SPLAT && p.mashPerSec === 0) {
        plans.push({ at: wall + 500 + reaction(r, p), hole: h, swipe: true });
      } else if (kind === E_FREEZE) {
        resumeAt = -1;
      }
    }
    s.ev.length = 0;
    // Execute due plans while looking (taps planned while away are lost).
    for (let i = plans.length - 1; i >= 0; i--) {
      if (plans[i].at <= wall) {
        const pl = plans[i];
        plans.splice(i, 1);
        if (!looking) continue;
        if (pl.swipe) simSwipe(s, pl.hole);
        else simTap(s, pl.hole);
      }
    }
    if (wall >= nextBump) {
      simTap(s, rngInt(r, 0, 8));
      nextBump = wall + 1000 / p.bumpsPerSec * (0.5 + rngFloat(r));
    }
    if (wall >= nextMash) {
      simTap(s, rngInt(r, 0, 8));
      nextMash = wall + 1000 / p.mashPerSec;
    }
  }
  stats.wallMs = wall;
  return { sim: s, result: simResult(s), stats };
}

/** Count escapes that happened while the player had been idle for more than 1200 ms (walk-safe gate). */
export function disengagedEscapes(tl: Timeline, taps: number[]): number {
  const s = createSim(tl, undefined, true);
  let n = 0;
  let k = 0;
  while (!s.ended) {
    while (k < taps.length && taps[k] === s.t) {
      const hole = taps[k + 1];
      if (hole >= 0) {
        if (taps[k + 2] & 2) simSwipe(s, hole);
        else simTap(s, hole);
      } else {
        s.frozen = false;
        s.lastTap = s.t;
      }
      k += 3;
    }
    if (s.frozen) {
      if (k >= taps.length) break;
      continue;
    }
    simAdvance(s, 1);
    for (let i = 0; i < s.ev.length; i += 5) {
      if (s.ev[i] === 7 && s.t - s.lastTap > 1200) {
        const kind = s.ev[i + 2];
        if (kind !== K_ANGLER && kind !== K_PUFFER && s.hSplat[s.ev[i + 1]] !== SPLAT_DOWN) n += 1;
      }
    }
    s.ev.length = 0;
  }
  return n;
}
