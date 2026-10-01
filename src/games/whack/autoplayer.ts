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
  E_EMERGE, E_ESCAPE, E_FREEZE, E_SPLAT, P_UP, SPLAT_DOWN, TAP_SWIPE, createSim, simAdvance, simResult, simSwipe, simTap,
  type BurstCarry, type BurstResult, type WhackSim,
} from './sim';
import type { Timeline } from './timeline';
import { K_ANGLER, K_BRUISER, K_HELMET, K_PUFFER, SIXTEENTH_MS } from './waves';

export type ProfileName = 'novice' | 'median' | 'expert' | 'onbeat' | 'bot' | 'jitterbot' | 'glance' | 'walking' | 'masher';

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
  /**
   * How a tap lands (anti-cheat features, 13.3): 'human' = Fitts-coupled
   * reaction, thumb scatter with a bias, uniform sub-frame stamps; 'onbeat' =
   * taps locked to the 16th grid (12 ms SD) with human scatter; 'bot' = exact
   * centre, constant delay, sub-frame 0; 'jitter' = +-30 ms uniform jitter
   * around a fixed delay, +-0.1 cell uniform position, no Fitts coupling.
   */
  style?: 'human' | 'onbeat' | 'bot' | 'jitter';
  /** Fitts slope (ms per cell of thumb travel) for 'human'. */
  fitts?: number;
}

export const PROFILES: Record<ProfileName, Profile> = {
  novice: { median: 520, sd: 120, decoyMistake: 0.1, lookAway: 0, bumpsPerSec: 0, mashPerSec: 0, miss: 0.08, fitts: 32 },
  median: { median: 420, sd: 90, decoyMistake: 0.03, lookAway: 0, bumpsPerSec: 0, mashPerSec: 0, miss: 0.06, fitts: 25 },
  expert: { median: 265, sd: 50, decoyMistake: 0.005, lookAway: 0, bumpsPerSec: 0, mashPerSec: 0, miss: 0, fitts: 18 },
  onbeat: { median: 300, sd: 12, decoyMistake: 0.01, lookAway: 0, bumpsPerSec: 0, mashPerSec: 0, miss: 0, style: 'onbeat' },
  bot: { median: 140, sd: 0, decoyMistake: 0, lookAway: 0, bumpsPerSec: 0, mashPerSec: 0, miss: 0, style: 'bot' },
  jitterbot: { median: 330, sd: 0, decoyMistake: 0, lookAway: 0, bumpsPerSec: 0, mashPerSec: 0, miss: 0, style: 'jitter' },
  glance: { median: 420, sd: 90, decoyMistake: 0.04, lookAway: 0.3, bumpsPerSec: 0, mashPerSec: 0, miss: 0.03, fitts: 25 },
  walking: { median: 540, sd: 110, decoyMistake: 0.06, lookAway: 0.15, bumpsPerSec: 1 / 20, mashPerSec: 0, miss: 0.05, fitts: 30 },
  masher: { median: 0, sd: 0, decoyMistake: 1, lookAway: 0, bumpsPerSec: 0, mashPerSec: 12, miss: 1 },
};

interface Plan { at: number; hole: number; swipe: boolean; dx: number; dy: number; sub: number }

function cellDist(a: number, b: number): number {
  if (a < 0 || b < 0) return 0;
  const dr = Math.floor(a / 3) - Math.floor(b / 3);
  const dc = (a % 3) - (b % 3);
  return Math.sqrt(dr * dr + dc * dc);
}

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
  const style = p.style ?? 'human';
  // Per-run thumb bias (1/32 cell) and the jitterbot's fixed delay.
  const biasX = style === 'bot' ? 0 : (rngFloat(r) - 0.5) * 4;
  const biasY = style === 'bot' ? 0 : 1 + rngFloat(r) * 3;
  const botDelay = style === 'jitter' ? 250 + rngFloat(r) * 200 : p.median;
  let lastPlanHole = -1;
  const landing = (): { dx: number; dy: number; sub: number } => {
    if (style === 'bot') return { dx: 0, dy: 0, sub: 0 };
    if (style === 'jitter') return { dx: (rngFloat(r) * 2 - 1) * 3.2, dy: (rngFloat(r) * 2 - 1) * 3.2, sub: Math.floor(rngFloat(r) * 17) };
    return { dx: biasX + rngGaussian(r) * 3.8, dy: biasY + rngGaussian(r) * 3.8, sub: Math.floor(rngFloat(r) * 17) };
  };
  /** Reaction (ms after emerge) for a target on hole h. */
  const reactFor = (h: number): number => {
    if (style === 'bot') return p.median;
    if (style === 'jitter') return botDelay + (rngFloat(r) * 2 - 1) * 30;
    if (style === 'onbeat') {
      // Tap on a 16th after the pop (2 to 4 sixteenths), 12 ms SD.
      const n = 2 + Math.floor(rngFloat(r) * 3);
      return Math.max(0, n * SIXTEENTH_MS + rngGaussian(r) * p.sd);
    }
    return reaction(r, p) + (p.fitts ?? 0) * cellDist(lastPlanHole, h);
  };

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
        const l = landing();
        simTap(s, hole >= 0 ? hole : 4, l.dx, l.dy, l.sub);
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
        const at = wall + reactFor(h);
        lastPlanHole = h;
        plans.push({ at, hole: h, swipe: false, ...landing() });
        if (k === K_HELMET) plans.push({ at: at + 180 + rngFloat(r) * 120, hole: h, swipe: false, ...landing() });
        if (k === K_BRUISER) for (let j = 1; j < 5; j++) plans.push({ at: at + j * (200 + rngFloat(r) * 60), hole: h, swipe: false, ...landing() });
      } else if (kind === E_SPLAT && p.mashPerSec === 0) {
        plans.push({ at: wall + 500 + reaction(r, p), hole: h, swipe: true, dx: 0, dy: 0, sub: 0 });
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
        else simTap(s, pl.hole, pl.dx, pl.dy, pl.sub);
      }
    }
    if (wall >= nextBump) {
      const l = landing();
      simTap(s, rngInt(r, 0, 8), l.dx * 3, l.dy * 3, l.sub);
      nextBump = wall + 1000 / p.bumpsPerSec * (0.5 + rngFloat(r));
    }
    if (wall >= nextMash) {
      const l = landing();
      simTap(s, rngInt(r, 0, 8), l.dx * 3, l.dy * 3, l.sub);
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
        if (taps[k + 2] & TAP_SWIPE) simSwipe(s, hole);
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
      if (s.ev[i] === E_ESCAPE && s.t - s.lastTap > 1200) {
        const kind = s.ev[i + 2];
        if (kind !== K_ANGLER && kind !== K_PUFFER && s.hSplat[s.ev[i + 1]] !== SPLAT_DOWN) n += 1;
      }
    }
    s.ev.length = 0;
  }
  return n;
}

/**
 * Play a whole Run (every Burst of the format) with a profile, carrying the
 * streak, meter and banked fever across breathers. Fever policy: 'now' fires a
 * banked fever at the next breather (most players), 'finale' saves it for the
 * last Burst (experts, 6.5). Returns per-Burst results and the Run total.
 */
export function autoplayRun(base: Omit<import('./timeline').BurstInput, 'burstIndex' | 'feverFired'>, bursts: number,
  profile: ProfileName | Profile, seed: number, feverPolicy: 'now' | 'finale' = 'now',
  build: (input: import('./timeline').BurstInput) => Timeline): { total: number; results: BurstResult[]; feverFired: number[] } {
  let carry: BurstCarry | undefined;
  let total = 0;
  const results: BurstResult[] = [];
  const feverFired: number[] = [];
  for (let b = 0; b < bursts; b++) {
    const ready = !!carry?.feverReady;
    const fire = ready && (feverPolicy === 'now' || b === bursts - 1);
    const tl = build({ ...base, burstIndex: b, feverFired: fire });
    if (fire) {
      feverFired.push(b);
      carry = { ...(carry as BurstCarry), feverReady: false, meter: 0 };
    }
    const r = autoplayBurst(tl, profile, seed * 31 + b * 7 + 1, carry);
    carry = r.result.carry;
    total += r.result.score;
    results.push(r.result);
  }
  return { total, results, feverFired };
}
