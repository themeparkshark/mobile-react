/**
 * Attack plans per boss and bout (design sections 2.3 and 5). Everything is
 * built from the bout's mulberry32 stream at the moment the attack starts, in
 * integer ms on the quarter-beat grid, so the server replay rebuilds the same
 * plan from the same seed.
 *
 * One shared verb: read the tell, counter at the impact on the in-world
 * target (lane 0 / 1 / 2), then punish the opening on the STRIKE float.
 *   Kraken: where.  Robo-Shark: what order.  Ghost Squid: which one.
 */
import { rngU32, type Rng } from '../../../gamekit/core/rng';
import { GOOD_MAX, HAZARD_MS, WINDUP_Q, type BossId } from './constants';

export const K_SLAM = 0;
export const K_DOUBLE = 1;
export const K_BUBBLE = 2;
export const K_TRIPLE = 3;
export const K_CANNON = 4;
export const K_CIRCUIT = 5;
export const K_DRIFT = 6;
export const K_MIRROR = 7;
export const K_SHELL = 8;

export const VARIANT_A = 0;
export const VARIANT_B = 1;
export const VARIANT_C = 2;

export interface AttackStep {
  lane: number;
  /** Impact frame (bout simT). */
  I: number;
  /** Graded against I (PERFECT/GOOD). Robo's earlier presses are untimed. */
  graded: boolean;
}

export interface Attack {
  no: number;
  kind: number;
  /** First thing the player sees for this attack (feint, show phase or tell). */
  start: number;
  /** Real wind-up onset: pitched tell, lane haptic count, orange shape. */
  T: number;
  W: number;
  G: number;
  steps: AttackStep[];
  /** Lane of step 0 before any ghost swap. */
  lane0: number;
  /** Ghost: flat [t, lane, t, lane...] lane changes of the real squid. */
  swaps: number[];
  /** Robo: icon ids in show order (3..5 = decoy flash of icon-3). */
  show: number[];
  showStart: number;
  /** Robo: lane of icon i after the shuffle (identity when none). */
  perm: number[];
  shuffleAt: number;
  feintLane: number;
  feintT0: number;
  feintT1: number;
  feintSafe: boolean;
  hazardLane: number;
  hazardT0: number;
  hazardT1: number;
  hazardPopped: boolean;
  /** Ghost decoy lanes (visual only; tapping one is a wrong target). */
  decoys: number[];
  /** First appearance of a new idea: cannot punish (Punch-Out rule). */
  safe: boolean;
}

export interface RoundFlags {
  feintSeen: boolean;
  doubleSeen: boolean;
  bubbleSeen: boolean;
  shuffleSeen: boolean;
  decoySeen: boolean;
}

export function freshRoundFlags(): RoundFlags {
  return { feintSeen: false, doubleSeen: false, bubbleSeen: false, shuffleSeen: false, decoySeen: false };
}

function pick(r: Rng, n: number): number {
  return rngU32(r) % n;
}

function otherLane(r: Rng, lane: number): number {
  return (lane + 1 + pick(r, 2)) % 3;
}

/** Counter window lead G = min(600, 0.7 x wind-up), integer. */
export function goodLead(W: number): number {
  return Math.min(GOOD_MAX, Math.floor((W * 7) / 10));
}

function blank(no: number, kind: number, start: number, W: number): Attack {
  return {
    no, kind, start, T: start, W, G: goodLead(W), steps: [], lane0: -1, swaps: [], show: [], showStart: -1,
    perm: [0, 1, 2], shuffleAt: -1, feintLane: -1, feintT0: -1, feintT1: -1, feintSafe: false,
    hazardLane: -1, hazardT0: -1, hazardT1: -1, hazardPopped: false, decoys: [], safe: false,
  };
}

/** Seeded bout-3 variant for a round; rank gates B (rank 2+) and C (rank 4+). */
export function pickVariant(seed: number, rank: number, lastVariant: number): number {
  const pool = rank >= 4 ? 3 : rank >= 2 ? 2 : 1;
  if (pool === 1) return VARIANT_A;
  let v = (seed >>> 0) % pool;
  if (v === lastVariant) v = (v + 1) % pool; // never the same bout-3 variant twice in a row
  return v;
}

export interface PlanInput {
  boss: BossId;
  bout: number;
  no: number;
  at: number;
  q: number;
  walk: boolean;
  variant: number;
  rng: Rng;
  flags: RoundFlags;
}

/** Build the attack that starts at `at` (already on the quarter grid). */
export function planAttack(p: PlanInput): Attack {
  const { boss, bout, no, q, rng, flags } = p;
  let W = (WINDUP_Q[bout] + (p.walk ? 1 : 0)) * q;
  if (boss === 'kraken' && bout === 2 && p.variant === VARIANT_C) W = ((no % 2 === 0 ? 5 : 7) + (p.walk ? 1 : 0)) * q;
  if (boss === 'robo_shark') return planRobo(p, W);
  if (boss === 'ghost_squid') return planGhost(p, W);

  // Kraken: tentacles. Bout 1 uses the L and R lanes only.
  let at = p.at;
  const lane = bout === 0 ? pick(rng, 2) * 2 : pick(rng, 3);
  // Bout 3 feints: 1 in 4 tentacles, never the first attack. Real = pitch + orange; fake = tremble, no pitch.
  const feint = bout === 2 && no > 0 && pick(rng, 4) === 0;
  let kind = K_SLAM;
  if (bout === 1) kind = no % 2 === 0 ? K_DOUBLE : K_BUBBLE;
  else if (bout === 2) {
    if (p.variant === VARIANT_A && pick(rng, 3) === 0) kind = K_TRIPLE;
    else if (p.variant === VARIANT_B && pick(rng, 2) === 0) kind = K_CANNON;
  }
  const a = blank(no, kind, at, W);
  if (feint) {
    a.feintLane = otherLane(rng, lane);
    a.feintT0 = at;
    a.feintT1 = at + 4 * q;
    a.feintSafe = !flags.feintSeen;
    flags.feintSeen = true;
    // The real attack after a feint waits one extra beat when the feint was the safe instance.
    at += (a.feintSafe ? 8 : 4) * q;
  }
  a.T = at;
  const I = at + W;
  a.steps.push({ lane, I, graded: true });
  if (kind === K_DOUBLE || kind === K_TRIPLE) {
    let prev = lane;
    const n = kind === K_DOUBLE ? 2 : 3;
    for (let k = 1; k < n; k++) {
      const next = otherLane(rng, prev);
      a.steps.push({ lane: next, I: I + k * 4 * q, graded: true });
      prev = next;
    }
    if (kind === K_DOUBLE && !flags.doubleSeen) {
      a.safe = true;
      flags.doubleSeen = true;
    }
  }
  if (kind === K_BUBBLE) {
    a.hazardLane = otherLane(rng, lane);
    a.hazardT0 = at;
    a.hazardT1 = at + HAZARD_MS;
    if (!flags.bubbleSeen) {
      a.safe = true;
      flags.bubbleSeen = true;
    }
  }
  a.G = goodLead(W);
  return a;
}

function planRobo(p: PlanInput, W0: number): Attack {
  const { bout, no, q, rng, flags } = p;
  const n = bout === 0 ? 2 : 3;
  const icons = [0, 1, 2];
  // Distinct icons in a seeded order (the sequence never exceeds 3 real icons).
  for (let i = 2; i > 0; i--) {
    const j = pick(rng, i + 1);
    const t = icons[i];
    icons[i] = icons[j];
    icons[j] = t;
  }
  const seq = icons.slice(0, n);
  const a = blank(no, K_CIRCUIT, p.at, W0);
  a.showStart = p.at;
  const show: number[] = [];
  seq.forEach((icon) => show.push(icon));
  // Bout 3 Overclock: one white decoy flash (no pitch) slipped into the show.
  if (bout === 2 && no > 0 && pick(rng, 2) === 0) {
    const pos = 1 + pick(rng, show.length);
    show.splice(pos, 0, 3 + pick(rng, 3));
    if (!flags.feintSeen) {
      a.feintSafe = true;
      flags.feintSeen = true;
    }
  }
  a.show = show;
  let t = p.at + show.length * 4 * q;
  const shuffle = bout === 2 || (bout === 1 && no % 2 === 0);
  if (shuffle) {
    const firstShuffle = !flags.shuffleSeen;
    flags.shuffleSeen = true;
    const perm = [0, 1, 2];
    // A real shuffle always moves something: rotate left or right.
    const dir = 1 + pick(rng, 2);
    for (let i = 0; i < 3; i++) perm[i] = (i + dir) % 3;
    a.perm = perm;
    a.shuffleAt = t;
    t += (firstShuffle ? 8 : 4) * q;
    if (firstShuffle) a.safe = true;
  }
  // Charge ring stretches by half a beat per extra icon.
  const W = W0 + 2 * q * (n - 1);
  a.T = t;
  a.W = W;
  a.G = goodLead(W);
  const I = t + W;
  seq.forEach((icon, k) => a.steps.push({ lane: a.perm[icon], I, graded: k === n - 1 }));
  if (no === 0 && bout === 0) a.safe = false;
  return a;
}

function planGhost(p: PlanInput, W: number): Attack {
  const { bout, no, rng, flags } = p;
  const kind = bout === 0 ? K_DRIFT : bout === 1 ? K_MIRROR : K_SHELL;
  const a = blank(no, kind, p.at, W);
  let lane = pick(rng, 3);
  a.lane0 = lane;
  a.T = p.at;
  const I = p.at + W;
  if (kind === K_DRIFT) {
    // Drifts to a new lane at 40% of the wind-up (the tell replays there).
    const next = otherLane(rng, lane);
    a.swaps.push(p.at + Math.floor((W * 4) / 10), next);
    lane = next;
  } else if (kind === K_MIRROR) {
    a.decoys.push(otherLane(rng, lane));
    if (!flags.decoySeen) {
      a.safe = true;
      flags.decoySeen = true;
    }
  } else {
    const d1 = otherLane(rng, lane);
    a.decoys.push(d1, 3 - lane - d1);
    // Shell game: one swap at half the wind-up; the real one keeps its rim and pitch.
    const next = otherLane(rng, lane);
    a.swaps.push(p.at + Math.floor(W / 2), next);
    lane = next;
  }
  a.steps.push({ lane, I, graded: true });
  a.G = goodLead(W);
  return a;
}

/** Correct lane of step `k` at bout time t (the ghost squid can move lanes). */
export function laneAt(a: Attack, k: number, t: number): number {
  if (k > 0 || a.swaps.length === 0) return a.steps[k].lane;
  let lane = a.lane0;
  for (let i = 0; i < a.swaps.length; i += 2) if (t >= a.swaps[i]) lane = a.swaps[i + 1];
  return lane;
}
