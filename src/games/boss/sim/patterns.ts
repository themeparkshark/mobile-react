/**
 * Attack plans per boss and bout (design v7 sections 3.4, 4.6 and 7). Built
 * from the bout's mulberry32 stream at the moment the attack starts, in
 * integer ms on the step grid, so the server replay rebuilds the same plan
 * from the same seed.
 *
 * Two verbs: read the tell and tap its lane at the impact (counter), then tap
 * the lit sucker each beat on the pinned limb (POP) or hold the float (Easy Slam).
 *   Kraken: where.  Robo-Shark: what order.  Ghost Squid: which one.
 */
import { createRng, mixSeed, rngU32, type Rng } from '../../../gamekit/core/rng';
import {
  BOON_FIN, BOON_LOOK, BOON_POLISH, BOON_TIDE, GOOD_MAX, HAZARD_MS, WINDUP_Q, type BossId,
} from './constants';

export const K_SLAM = 0;
export const K_DOUBLE = 1;
export const K_BUBBLE = 2;
export const K_TRIPLE = 3;
export const K_CANNON = 4;
export const K_CIRCUIT = 5;
export const K_DRIFT = 6;
export const K_MIRROR = 7;
export const K_SHELL = 8;
/** Captain's Call: the bout-3 Skill Star cue, impact on the "and" of beat 4 (2 steps off the beat). */
export const K_CALL = 9;

/** Bout-3 variants. A0 = Fury, no fakes (until the player's first 1-star clear of this boss). */
export const VARIANT_A0 = 0;
export const VARIANT_A = 1;
export const VARIANT_B = 2;
/** Parked until after Gate K. */
export const VARIANT_C = 3;
/** Bout-3 attack index of Captain's Call (the attack before the Final Pop opening). */
export const CALL_NO = 2;

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
  /** First appearance of a new idea: cannot punish or cost Grit (Punch-Out rule). */
  safe: boolean;
  /** Captain's Call (Skill Star cue). */
  call: boolean;
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
    hazardLane: -1, hazardT0: -1, hazardT1: -1, hazardPopped: false, decoys: [], safe: false, call: false,
  };
}

/**
 * Seeded bout-3 variant for a round (the server picks it in production).
 * A0 until the player's first 1-star clear of this boss; then A, and B from
 * mastery rank 2. Never the same variant twice in a row when there is a choice.
 */
export function pickVariant(seed: number, rank: number, lastVariant: number, cleared = true): number {
  if (!cleared) return VARIANT_A0;
  if (rank < 2) return VARIANT_A;
  let v = VARIANT_A + ((seed >>> 0) % 2);
  if (v === lastVariant) v = v === VARIANT_A ? VARIANT_B : VARIANT_A;
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
  /** This attack carries the bout's one foam bubble (bout 2). */
  bubble?: boolean;
}

/** Smallest wind-up >= W whose impact (at + W) falls 2 steps after a beat (t = 0 is a downbeat). */
export function andOfBeat(at: number, W: number, q: number): number {
  const beat = 4 * q;
  const off = (((2 * q - (at + W)) % beat) + beat) % beat;
  return W + off;
}

/** Build the attack that starts at `at` (already on the step grid). */
export function planAttack(p: PlanInput): Attack {
  const { boss, bout, no, q, rng, flags } = p;
  let W = (WINDUP_Q[bout] + (p.walk ? 1 : 0)) * q;
  if (boss === 'kraken' && bout === 2 && p.variant === VARIANT_C) W = ((no % 2 === 0 ? 5 : 7) + (p.walk ? 1 : 0)) * q;
  if (boss !== 'kraken') {
    // Captain's Call is the same rule on every boss: impact 2 steps off the beat.
    const call = bout === 2 && no === CALL_NO;
    const a = boss === 'robo_shark' ? planRobo(p, call ? andOfBeat(p.at, W, q) : W) : planGhost(p, call ? andOfBeat(p.at, W, q) : W);
    a.call = call;
    return a;
  }

  // Kraken: tentacles. Bout 1 uses the L and R lanes only.
  let at = p.at;
  const lane = bout === 0 ? pick(rng, 2) * 2 : pick(rng, 3);
  const call = bout === 2 && no === CALL_NO;
  // Bout 3 fakes (A and B only): 1 in 4, never the first attack, never Captain's Call.
  const fakeRoll = bout === 2 && no > 0 && !call ? pick(rng, 4) === 0 : false;
  const feint = fakeRoll && p.variant !== VARIANT_A0;
  let kind = K_SLAM;
  if (bout === 1) kind = no % 2 === 0 ? K_DOUBLE : p.bubble ? K_BUBBLE : K_SLAM;
  else if (bout === 2 && !call) {
    if (p.variant === VARIANT_A && pick(rng, 3) === 0) kind = K_TRIPLE;
    else if (p.variant === VARIANT_B && pick(rng, 2) === 0) kind = K_CANNON;
  }
  if (call) kind = K_CALL;
  // Captain's Call lands on the "and" of a beat (2 steps off the beat, still on the step grid).
  if (call) W = andOfBeat(at, W, q);
  const a = blank(no, kind, at, W);
  a.call = call;
  if (feint) {
    a.feintLane = otherLane(rng, lane);
    a.feintT0 = at;
    a.feintT1 = at + 4 * q;
    a.feintSafe = !flags.feintSeen;
    flags.feintSeen = true;
    // The real attack after a fake waits one extra beat when the fake was the safe instance.
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
  // Bout 3 Overclock: one white decoy flash (no pitch) slipped into the show (never on A0).
  if (bout === 2 && no > 0 && pick(rng, 2) === 0 && p.variant !== VARIANT_A0) {
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
    a.swaps.push(p.at + Math.floor((W * 4) / 10 / p.q) * p.q, next);
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
    a.swaps.push(p.at + Math.floor(W / 2 / p.q) * p.q, next);
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

/**
 * Boon offer for an intermission (design 6.3): two distinct seeded cards from
 * the round seed, the same for a teammate on the same seed. Anchor Polish is
 * only offered before bout 3. `bout` is the bout the boon applies to (1 or 2).
 */
export function boonOffer(seed: number, bout: number): [number, number] {
  const pool = bout >= 2 ? [BOON_TIDE, BOON_FIN, BOON_LOOK, BOON_POLISH] : [BOON_TIDE, BOON_FIN, BOON_LOOK];
  const r = createRng(mixSeed(seed >>> 0, (0xb0 + bout) >>> 0));
  const i = rngU32(r) % pool.length;
  const j = (i + 1 + (rngU32(r) % (pool.length - 1))) % pool.length;
  return [pool[i], pool[j]];
}

/** Pop lanes for an opening's slots: seeded, never the same lane twice in a row. */
export function popLanes(r: Rng, n: number, avoid: number): number[] {
  const out: number[] = [];
  let prev = avoid;
  for (let k = 0; k < n; k++) {
    const lane = prev < 0 ? pick(r, 3) : otherLane(r, prev);
    out.push(lane);
    prev = lane;
  }
  return out;
}
