/**
 * Banana Basket director: beat grid, spawn phrases, reachability and the
 * ball-aware check (design rev 4, section 6.2).
 *
 * Everything is integer and deterministic from the sim state, so a replay of
 * the same seed and inputs reproduces every spawn. The director runs once per
 * clock step (clock steps only advance while the thumb is down).
 *
 * Reachability: for any two must-catch items landing at steps si, sj with
 * landing x distance dx, |si - sj| >= REACT + TRAVEL[max(0, dx - 40)], where
 * TRAVEL is baked from the same speed cap the sim's basket uses. Items that
 * land within 15 steps of each other must sit inside one basket (dx <= 40).
 * The juggle ball's predicted rim crossing adds the same constraint (a ball
 * save is optional, so a conflict demotes the item instead of dropping it).
 */

import {
  BALL_R, BASKET_MAX, BASKET_MIN, BREEZE_SUB, DIFF_BUDGET_Q8, DIFF_G_Q8, DIFF_PUFFER_Q8, ITEM_G_Q8, K_BANANA,
  K_BUNCH, K_COIN, K_FINGER, K_GIFT, K_LUCKY, K_PUFFER, K_WATCH, LANE_Y, PHASE_BREATHER, PHASE_BUDGET, PHASE_BUILD,
  PHASE_G, PHASE_PRESSURE, PHASE_RUSH, PHASE_TIPOVER, PHASE_VY0, PHASE_WARM, PUFFER_CLEAR, PUFFER_MIN_FALL_QUEUE,
  PUFFER_MIN_FALL_RIDE, REACH_SLACK, REACT_STEPS, SPAWN_Y, STEPS_BEAT, STEPS_HALF, SUB, TWIST_BREEZY, WATCH_MAX,
  FIELD_W, BALL_WALL_Q8,
} from './constants';
import { absInt, clampInt, floorDiv, rngBelow, rngRange, rngWeighted } from './fixed';
import { MAXDX, TRAVEL, TRAVEL_MAX } from './tables';
import { EV_TIPOVER, MAX_PENDING, MODE_QUEUE, WINDOW, emit, tierOf, type SimState } from './state';

export function travelOf(dx: number): number {
  'worklet';
  if (dx <= 0) return 0;
  return TRAVEL[dx > TRAVEL_MAX ? TRAVEL_MAX : dx];
}

export function maxDxIn(steps: number): number {
  'worklet';
  if (steps <= 0) return 0;
  return MAXDX[steps > 120 ? 120 : steps];
}

/** Max landing-x distance allowed between two must-catch items dt steps apart. */
export function reachAllowed(dt: number): number {
  'worklet';
  const a = dt < 0 ? -dt : dt;
  if (a < REACT_STEPS) return REACH_SLACK;
  return REACH_SLACK + maxDxIn(a - REACT_STEPS);
}

/** Integer free fall from the cart to the lane: steps (and drifted x). */
export function fallSteps(vy0: number, g: number): number {
  'worklet';
  let y = SPAWN_Y * SUB;
  let vy = vy0;
  let n = 0;
  const lane = LANE_Y * SUB;
  while (y < lane && n < 400) {
    vy += g;
    y += vy;
    n++;
  }
  return n;
}

/** Forward-simulate the untouched ball to its rim crossing (up to 120 steps). */
export function predictBall(s: SimState): void {
  'worklet';
  s.bPredStep = -1;
  if (s.bOn !== 1) return;
  let x = s.bX;
  let y = s.bY;
  let vx = s.bVx;
  let vy = s.bVy;
  const rim = (LANE_Y - BALL_R) * SUB;
  const lo = BALL_R * SUB;
  const hi = (FIELD_W - BALL_R) * SUB;
  for (let n = 1; n <= 120; n++) {
    vy += s.bG;
    y += vy;
    x += vx;
    if (x < lo) {
      x = lo + (lo - x);
      vx = floorDiv(-vx * BALL_WALL_Q8, 256);
    } else if (x > hi) {
      x = hi - (x - hi);
      vx = floorDiv(-vx * BALL_WALL_Q8, 256);
    }
    if (vy > 0 && y >= rim) {
      s.bPredStep = s.clock + n;
      s.bPredX = x;
      return;
    }
  }
}

// -- phases -------------------------------------------------------------------------

export function phaseAt(s: SimState, lt: number): number {
  'worklet';
  if (s.mode !== MODE_QUEUE) {
    if (lt < 600) return PHASE_WARM;
    if (lt < 1080) return PHASE_BUILD;
    if (lt < 1920) return PHASE_PRESSURE;
    if (lt < 2100) return PHASE_BREATHER;
    return PHASE_RUSH;
  }
  if (s.set === 0) return lt < 360 ? PHASE_WARM : lt < 720 ? PHASE_BUILD : PHASE_PRESSURE;
  if (s.set === 1) return lt < 240 ? PHASE_BUILD : PHASE_PRESSURE;
  return lt < 360 ? PHASE_TIPOVER : lt < 600 ? PHASE_PRESSURE : PHASE_RUSH;
}

/** vy0 and gravity (sub-units) for a kind in a phase at the run's difficulty. */
export function fallParams(s: SimState, kind: number, phase: number, out: number[]): void {
  'worklet';
  let vy0 = PHASE_VY0[phase];
  let g = floorDiv(floorDiv(PHASE_G[phase] * 256 * ITEM_G_Q8[kind], 256) * DIFF_G_Q8[s.diff], 256);
  if (kind === K_PUFFER) {
    vy0 = floorDiv(vy0, 2);
    const min = s.mode === MODE_QUEUE ? PUFFER_MIN_FALL_QUEUE : PUFFER_MIN_FALL_RIDE;
    for (let k = 0; k < 8 && fallSteps(vy0, floorDiv(g, 256)) < min; k++) {
      g = floorDiv(g * 205, 256);
      vy0 = floorDiv(vy0 * 3, 4);
    }
  }
  out[0] = vy0;
  out[1] = floorDiv(g, 256) > 1 ? floorDiv(g, 256) : 2;
}

// -- reachability windows ----------------------------------------------------------------

function pushMust(s: SimState, step: number, x: number): void {
  'worklet';
  s.mStep[s.mHead] = step;
  s.mX[s.mHead] = x;
  s.mHead = (s.mHead + 1) % WINDOW;
}

function pushPuffer(s: SimState, step: number, x: number): void {
  'worklet';
  s.fStep[s.fHead] = step;
  s.fX[s.fHead] = x;
  s.fHead = (s.fHead + 1) % WINDOW;
}

/**
 * Constrain a must-catch landing x (fu). Returns the x, or -1 when no x in the
 * lane satisfies every neighbour (the phrase then skips the item).
 */
export function constrainMust(s: SimState, land: number, want: number): number {
  'worklet';
  let lo = BASKET_MIN;
  let hi = BASKET_MAX;
  for (let k = 0; k < WINDOW; k++) {
    const dt = land - s.mStep[k];
    if (dt > 120 || dt < -120) continue;
    const a = reachAllowed(dt);
    if (s.mX[k] - a > lo) lo = s.mX[k] - a;
    if (s.mX[k] + a < hi) hi = s.mX[k] + a;
  }
  if (lo > hi) return -1;
  let x = clampInt(want, lo, hi);
  for (let k = 0; k < WINDOW; k++) {
    const dt = land - s.fStep[k];
    if (dt > 24 || dt < -24) continue;
    const fx = s.fX[k];
    if (absInt(x - fx) >= PUFFER_CLEAR) continue;
    const left = fx - PUFFER_CLEAR;
    const right = fx + PUFFER_CLEAR;
    if (x < fx && left >= lo) x = left;
    else if (right <= hi) x = right;
    else if (left >= lo) x = left;
    else return -1;
  }
  for (let k = 0; k < WINDOW; k++) {
    const dt = land - s.fStep[k];
    if (dt > 24 || dt < -24) continue;
    if (absInt(x - s.fX[k]) < PUFFER_CLEAR) return -1;
  }
  return x;
}

/** Puffer landing x (fu) that keeps every nearby must-catch item clear, or -1. */
export function constrainPuffer(s: SimState, land: number, want: number): number {
  'worklet';
  let x = clampInt(want, 44, FIELD_W - 44);
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let k = 0; k < WINDOW; k++) {
      const dt = land - s.mStep[k];
      if (dt > 24 || dt < -24) continue;
      const mx = s.mX[k];
      if (absInt(x - mx) >= PUFFER_CLEAR) continue;
      const left = mx - PUFFER_CLEAR;
      const right = mx + PUFFER_CLEAR;
      x = x <= mx ? (left >= 44 ? left : right) : right <= FIELD_W - 44 ? right : left;
      moved = true;
    }
    if (!moved) break;
  }
  for (let k = 0; k < WINDOW; k++) {
    const dt = land - s.mStep[k];
    if (dt > 24 || dt < -24) continue;
    if (absInt(x - s.mX[k]) < PUFFER_CLEAR) return -1;
  }
  if (x < 44 || x > FIELD_W - 44) return -1;
  return x;
}

/**
 * Schedule one item (landing x in fu). must: 1 must-catch, 0 optional.
 * flag: 1 finale, 2 free placement (no reachability). Returns the landing x or -1.
 */
export function addItem(s: SimState, at: number, kind: number, want: number, must: number, flag: number, phase: number): number {
  'worklet';
  if (s.pN >= MAX_PENDING) return -1;
  const fp = [0, 0];
  fallParams(s, kind, phase, fp);
  const steps = fallSteps(fp[0], fp[1]);
  const land = at + steps;
  let x = want;
  let isMust = must;
  if (flag !== 2) {
    if (kind === K_PUFFER) {
      x = constrainPuffer(s, land, want);
      if (x < 0) return -1;
    } else if (must) {
      x = constrainMust(s, land, want);
      if (x < 0) return -1;
      // Ball term: a landing near the ball's predicted rim crossing must be reachable from it.
      if (s.bOn === 1 && s.bPredStep >= 0) {
        const dt = absInt(land - s.bPredStep);
        if (dt <= 24) {
          const bx = s.bPredX >> 8;
          const a = REACH_SLACK + maxDxIn(dt);
          if (absInt(x - bx) > a) isMust = 0;
        }
      }
    } else {
      x = clampInt(want, BASKET_MIN, BASKET_MAX);
    }
  } else {
    x = clampInt(want, BASKET_MIN, BASKET_MAX);
  }
  let vx = 0;
  let spawnX = x * SUB;
  if (s.twist === TWIST_BREEZY && s.set === 1 && kind !== K_PUFFER) {
    vx = s.wind * BREEZE_SUB;
    spawnX = clampInt(x * SUB - vx * steps, 30 * SUB, (FIELD_W - 30) * SUB);
  }
  const i = s.pN;
  s.pSpawn[i] = at;
  s.pKind[i] = kind;
  s.pX[i] = spawnX;
  s.pVx[i] = vx;
  s.pVy[i] = fp[0];
  s.pG[i] = fp[1];
  s.pLandStep[i] = land;
  s.pLand[i] = steps;
  s.pMust[i] = isMust;
  s.pFlag[i] = flag === 1 ? 1 : 0;
  s.pN = i + 1;
  if (kind === K_PUFFER) pushPuffer(s, land, x);
  else if (isMust) {
    pushMust(s, land, x);
    s.dLastX = x;
  }
  return x;
}

// -- phrases -------------------------------------------------------------------------------

export const PH_SINGLE = 0;
export const PH_PAIR = 1;
export const PH_STAIRS_L = 2;
export const PH_STAIRS_R = 3;
export const PH_ZIGZAG = 4;
export const PH_ARC = 5;
export const PH_RAIN = 6;
export const PH_BUNCH_SINGLES = 7;
export const PH_COIN_BAIT = 8;
export const PH_PUFFER_GATE = 9;
export const PH_COIN_BEHIND_PUFFER = 10;
export const PH_WEAVE = 11;
export const PH_DOUBLE_STACK = 12;
export const PH_BALL_ASSIST = 13;
export const PH_LUCKY = 14;
export const PH_GOLDEN_RAIN = 15;
export const PH_BREATHER = 16;
export const PH_PUFFER_SOLO = 17;
export const PH_POWER = 18;
export const PH_COUNT = 19;

/** Phrase weights for the current state (index = phrase id). */
export function phraseWeights(s: SimState, phase: number, out: number[]): void {
  'worklet';
  for (let i = 0; i < PH_COUNT; i++) out[i] = 0;
  const golden = s.ghQ > 0;
  if (golden) {
    out[PH_GOLDEN_RAIN] = 1;
    return;
  }
  const pw = s.pufferOn ? floorDiv(2 * DIFF_PUFFER_Q8[s.diff], 256) : 0;
  const ball = s.bOn === 1 ? 2 : 0;
  const lt = s.clock - s.setStart;
  const lucky = s.luckyN < 2 && (s.mode === MODE_QUEUE ? s.set >= 1 : lt >= 1440) ? 1 : 0;
  if (phase === PHASE_WARM) {
    out[PH_SINGLE] = 4;
    out[PH_PAIR] = 3;
    out[PH_STAIRS_L] = 1;
    out[PH_STAIRS_R] = 1;
    out[PH_DOUBLE_STACK] = 1;
  } else if (phase === PHASE_BUILD) {
    out[PH_SINGLE] = 1;
    out[PH_PAIR] = 3;
    out[PH_STAIRS_L] = 2;
    out[PH_STAIRS_R] = 2;
    out[PH_ZIGZAG] = 2;
    out[PH_ARC] = 1;
    out[PH_BUNCH_SINGLES] = 2;
    out[PH_COIN_BAIT] = 2;
    out[PH_BALL_ASSIST] = ball;
  } else if (phase === PHASE_PRESSURE || phase === PHASE_TIPOVER) {
    out[PH_PAIR] = 2;
    out[PH_STAIRS_L] = 2;
    out[PH_STAIRS_R] = 2;
    out[PH_ZIGZAG] = 2;
    out[PH_ARC] = 2;
    out[PH_RAIN] = 2;
    out[PH_BUNCH_SINGLES] = 2;
    out[PH_WEAVE] = pw;
    out[PH_PUFFER_GATE] = pw;
    out[PH_COIN_BEHIND_PUFFER] = pw > 0 ? 1 : 0;
    out[PH_PUFFER_SOLO] = pw > 0 ? 1 : 0;
    out[PH_LUCKY] = lucky;
    out[PH_BALL_ASSIST] = ball;
    out[PH_COIN_BAIT] = 2;
    if (s.mode === MODE_QUEUE && s.set < 2 && (s.hasFinger || (s.hasWatch && s.watchUsed < WATCH_MAX))) out[PH_POWER] = 1;
  } else if (phase === PHASE_BREATHER) {
    out[PH_BREATHER] = 1;
  } else {
    out[PH_RAIN] = 3;
    out[PH_ZIGZAG] = 2;
    out[PH_STAIRS_L] = 1;
    out[PH_STAIRS_R] = 1;
    out[PH_ARC] = 2;
    out[PH_BUNCH_SINGLES] = 2;
    out[PH_WEAVE] = pw;
    out[PH_PUFFER_GATE] = pw;
    out[PH_LUCKY] = lucky;
    out[PH_BALL_ASSIST] = ball > 0 ? 1 : 0;
  }
}

function lane(s: SimState): number {
  'worklet';
  return rngRange(s.rng, BASKET_MIN + 10, BASKET_MAX - 10);
}

function near(s: SimState, x: number, lo: number, hi: number): number {
  'worklet';
  const d = rngRange(s.rng, lo, hi);
  const dir = rngBelow(s.rng, 2) === 0 ? -1 : 1;
  let nx = x + dir * d;
  if (nx < BASKET_MIN + 6 || nx > BASKET_MAX - 6) nx = x - dir * d;
  return clampInt(nx, BASKET_MIN + 6, BASKET_MAX - 6);
}

/**
 * Expand one phrase starting at clock step `at`. Returns its duration (steps)
 * in the low 16 bits and its cost in the high bits (cost << 16).
 */
export function playPhrase(s: SimState, id: number, at: number, phase: number): number {
  'worklet';
  const H = STEPS_HALF;
  let x = s.dLastX;
  let cost = 1;
  let dur = 0;
  if (id === PH_SINGLE) {
    addItem(s, at, K_BANANA, near(s, x, 60, 170), 1, 0, phase);
  } else if (id === PH_PAIR) {
    const a = near(s, x, 50, 150);
    addItem(s, at, K_BANANA, a, 1, 0, phase);
    addItem(s, at + 2 * H, K_BANANA, near(s, a, 80, 170), 1, 0, phase);
    dur = 2 * H;
    cost = 2;
  } else if (id === PH_STAIRS_L || id === PH_STAIRS_R) {
    const dir = id === PH_STAIRS_L ? 1 : -1;
    const n = phase === PHASE_WARM ? 3 : 4;
    let sx = dir > 0 ? rngRange(s.rng, 80, 130) : rngRange(s.rng, 270, 320);
    for (let k = 0; k < n; k++) {
      addItem(s, at + k * 2 * H, K_BANANA, sx, 1, 0, phase);
      sx += dir * 64;
    }
    dur = (n - 1) * 2 * H;
    cost = n;
  } else if (id === PH_ZIGZAG) {
    const a = rngRange(s.rng, 72, 130);
    const b = rngRange(s.rng, 270, 328);
    for (let k = 0; k < 5; k++) addItem(s, at + k * 2 * H, K_BANANA, k % 2 === 0 ? a : b, 1, 0, phase);
    addItem(s, at + 10 * H, K_COIN, 200, 0, 0, phase);
    dur = 10 * H;
    cost = 6;
  } else if (id === PH_ARC) {
    const dir = rngBelow(s.rng, 2) === 0 ? 1 : -1;
    let sx = dir > 0 ? 90 : 310;
    for (let k = 0; k < 7; k++) {
      addItem(s, at + k * H, K_BANANA, sx, 1, 0, phase);
      sx += dir * 36;
    }
    dur = 6 * H;
    cost = 5;
  } else if (id === PH_RAIN) {
    let rx = near(s, x, 20, 90);
    for (let k = 0; k < 6; k++) {
      addItem(s, at + k * H, K_BANANA, rx, 1, 0, phase);
      rx = near(s, rx, 10, 38);
    }
    dur = 5 * H;
    cost = 5;
  } else if (id === PH_BUNCH_SINGLES) {
    const a = near(s, x, 40, 120);
    addItem(s, at, K_BUNCH, a, 1, 0, phase);
    const b = near(s, a, 50, 110);
    addItem(s, at + 2 * H, K_BANANA, b, 1, 0, phase);
    addItem(s, at + 3 * H, K_BANANA, near(s, b, 20, 36), 1, 0, phase);
    dur = 3 * H;
    cost = 4;
  } else if (id === PH_COIN_BAIT) {
    addItem(s, at, K_COIN, near(s, x, 90, 150), 0, 0, phase);
    cost = 1;
  } else if (id === PH_PUFFER_GATE) {
    const g = rngRange(s.rng, 160, 240);
    addItem(s, at, K_PUFFER, g - 116, 0, 0, phase);
    addItem(s, at, K_PUFFER, g + 116, 0, 0, phase);
    addItem(s, at + 2 * H, K_BANANA, g, 1, 0, phase);
    dur = 2 * H;
    cost = 4;
  } else if (id === PH_COIN_BEHIND_PUFFER) {
    const p = near(s, x, 0, 60);
    addItem(s, at, K_PUFFER, p, 0, 0, phase);
    addItem(s, at + 4 * H, K_COIN, p, 0, 0, phase);
    dur = 4 * H;
    cost = 3;
  } else if (id === PH_WEAVE) {
    const c = rngRange(s.rng, 150, 250);
    addItem(s, at, K_PUFFER, c, 0, 0, phase);
    addItem(s, at + 2 * H, K_BANANA, c - 120, 1, 0, phase);
    addItem(s, at + 4 * H, K_BANANA, c + 120, 1, 0, phase);
    dur = 4 * H;
    cost = 4;
  } else if (id === PH_DOUBLE_STACK) {
    const a = near(s, x, 40, 120);
    addItem(s, at, K_BANANA, a, 1, 0, phase);
    addItem(s, at + H, K_BANANA, a, 1, 0, phase);
    dur = H;
    cost = 2;
  } else if (id === PH_BALL_ASSIST) {
    // Optional bananas high in the ball's lane: trick-shot Ball Pops.
    const bx = s.bOn === 1 ? s.bX >> 8 : x;
    addItem(s, at, K_BANANA, clampInt(bx, 80, 320), 0, 0, phase);
    addItem(s, at + 2 * H, K_BANANA, near(s, x, 30, 90), 1, 0, phase);
    dur = 2 * H;
    cost = 2;
  } else if (id === PH_LUCKY) {
    addItem(s, at, K_LUCKY, near(s, x, 60, 140), 1, 0, phase);
    s.luckyN += 1;
    cost = 3;
  } else if (id === PH_GOLDEN_RAIN) {
    const dir = rngBelow(s.rng, 2) === 0 ? 1 : -1;
    let gx = dir > 0 ? 100 : 300;
    for (let k = 0; k < 6; k++) {
      addItem(s, at + k * H, k === 5 ? K_COIN : K_BANANA, gx, k === 5 ? 0 : 1, 0, phase);
      gx += dir * 34;
    }
    dur = 5 * H;
    cost = 4;
  } else if (id === PH_BREATHER) {
    for (let k = 0; k < 4; k++) addItem(s, at + k * 2 * H, K_BANANA, 130 + k * 46, 1, 0, phase);
    addItem(s, at + 9 * H, K_COIN, 200, 0, 0, phase);
    dur = 9 * H;
    cost = 3;
  } else if (id === PH_PUFFER_SOLO) {
    addItem(s, at, K_PUFFER, clampInt(s.bx >> 8, 60, 340), 0, 0, phase);
    cost = 2;
  } else if (id === PH_POWER) {
    const watch = s.hasWatch && s.watchUsed < WATCH_MAX && rngBelow(s.rng, 2) === 0;
    addItem(s, at, watch ? K_WATCH : K_FINGER, near(s, x, 50, 120), 0, 0, phase);
    cost = 1;
  }
  return dur | (cost << 16);
}

// -- the director step -----------------------------------------------------------------------

/** Round up to the next beat of the current set. */
function onBeat(s: SimState, at: number): number {
  'worklet';
  const lt = at - s.setStart;
  const r = lt % STEPS_BEAT;
  return r === 0 ? at : at + STEPS_BEAT - r;
}

function oneShot(s: SimState, bit: number, lt: number, when: number): boolean {
  'worklet';
  if ((s.tl & bit) !== 0 || lt < when) return false;
  s.tl |= bit;
  return true;
}

export const TL_COIN = 1;
export const TL_BALL = 2;
export const TL_PUFFER = 4;
export const TL_BREATHER = 8;
export const TL_FINALE = 16;
export const TL_GIFT = 32;
export const TL_TIPOVER = 64;

export function directorStep(s: SimState): void {
  'worklet';
  const c = s.clock;
  const lt = c - s.setStart;
  const phase = phaseAt(s, lt);
  const queue = s.mode === MODE_QUEUE;
  const lastSet = !queue || s.set === 2;
  // Fixed beats of the run.
  if (!queue) {
    if (oneShot(s, TL_COIN, lt, 300)) addItem(s, c, K_COIN, 200, 0, 0, phase);
    if (oneShot(s, TL_BALL, lt, 600)) s.tossReq = clampInt(s.dLastX, 90, 310) + 1;
    if (oneShot(s, TL_PUFFER, lt, 1080)) {
      s.pufferOn = 1;
      addItem(s, c, K_PUFFER, clampInt(s.bx >> 8, 70, 330), 0, 0, phase);
      if (s.dNext < c + 84) s.dNext = c + 84;
    }
    if (oneShot(s, TL_BREATHER, lt, 1920)) {
      playPhrase(s, PH_BREATHER, c, PHASE_BREATHER);
      s.dNext = s.setStart + 2100;
    }
  } else if (s.set === 0) {
    if (oneShot(s, TL_COIN, lt, 180)) addItem(s, c, K_COIN, 200, 0, 0, phase);
    if (s.hasBall && oneShot(s, TL_BALL, lt, 360)) s.tossReq = clampInt(s.dLastX, 90, 310) + 1;
    if (oneShot(s, TL_PUFFER, lt, 720)) {
      s.pufferOn = 1;
      addItem(s, c, K_PUFFER, clampInt(s.bx >> 8, 70, 330), 0, 0, phase);
      if (s.dNext < c + 84) s.dNext = c + 84;
    }
  } else if (s.set === 1) {
    s.pufferOn = 1;
    if (s.hasGift && oneShot(s, TL_GIFT, lt, 600)) addItem(s, c, K_GIFT, near(s, s.dLastX, 40, 110), 0, 0, phase);
  } else if (oneShot(s, TL_TIPOVER, lt, 0)) {
    // Cart Tip-Over: a 6 s shower in weaving lanes (24 bananas + 4 coins).
    s.pufferOn = 1;
    emit(s, EV_TIPOVER, 0, 0, 0);
    let tx = 200;
    let dir = 1;
    for (let k = 0; k < 28; k++) {
      const coin = k % 7 === 3;
      addItem(s, c + 24 + k * STEPS_HALF, coin ? K_COIN : K_BANANA, tx, coin ? 0 : 1, 0, PHASE_TIPOVER);
      tx += dir * 30;
      if (tx > 300 || tx < 100) dir = -dir;
    }
    s.dNext = c + 24 + 28 * STEPS_HALF + STEPS_BEAT;
  }
  // Finale: a guaranteed item landing 0.6 s before the end of the last set.
  if (lastSet && (s.tl & TL_FINALE) === 0) {
    const kind = s.meter === 2 ? K_COIN : K_LUCKY;
    const fp = [0, 0];
    fallParams(s, kind, phase, fp);
    const steps = fallSteps(fp[0], fp[1]);
    if (lt >= s.setLen - 36 - steps) {
      s.tl |= TL_FINALE;
      addItem(s, c, kind, s.dLastX, 1, 1, phase);
    }
  }
  if (c < s.dNext) return;
  // Regular phrases: budget per 5 s rises with the chain tier (rubber band).
  let budget = PHASE_BUDGET[phase] + tierOf(s.chain) - 1 + (s.ghQ > 0 ? 3 : 0);
  budget = floorDiv(budget * DIFF_BUDGET_Q8[s.diff], 256);
  if (budget < 2) budget = 2;
  const w: number[] = [];
  for (let i = 0; i < PH_COUNT; i++) w.push(0);
  phraseWeights(s, phase, w);
  let id = rngWeighted(s.rng, w);
  if (w[id] === 0) id = PH_SINGLE;
  // Keep landings inside the set (a clean set break, the finale lands alone).
  const tail = lastSet ? 110 : 60;
  if (lt + 150 > s.setLen - tail) {
    s.dNext = s.setStart + s.setLen + STEPS_BEAT;
    return;
  }
  const r = playPhrase(s, id, c, phase);
  const dur = r & 0xffff;
  const cost = r >> 16;
  let gap = floorDiv(cost * 300 + budget - 1, budget);
  if (gap < dur + STEPS_HALF) gap = dur + STEPS_HALF;
  s.dNext = onBeat(s, c + gap);
}

export const PHRASE_NAMES = [
  'Single', 'Pair', 'Stairs L', 'Stairs R', 'Zigzag', 'Arc', 'Rain', 'Bunch+Singles', 'Coin Bait', 'Puffer Gate',
  'Coin Behind Puffer', 'Weave', 'Double Stack', 'Ball Assist', 'Lucky Drop', 'Golden Rain', 'Breather Arc',
  'Puffer Solo', 'Power Drop',
];

export { K_BANANA, K_BUNCH, K_COIN, K_FINGER, K_GIFT, K_LUCKY, K_PUFFER, K_WATCH, PHASE_BUILD, PHASE_PRESSURE, PHASE_RUSH };
