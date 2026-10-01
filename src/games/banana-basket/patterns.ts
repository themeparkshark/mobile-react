/**
 * Banana Basket director (design rev 8, section 6.2): beat grid, the 24
 * phrases, reachability, ball-aware placement, forks, hanging-prize zone
 * paths, the threat cap, queue sets (Tip-Over, Remix) and the rulesets.
 *
 * Everything is integer and deterministic from the sim state, so a replay of
 * the same seed and inputs reproduces every spawn. The director runs once per
 * clock step (clock steps only advance while time runs).
 *
 * Reachability: for any two must-catch bananas landing at steps si, sj with
 * landing x distance dx, |si - sj| >= REACT + TRAVEL[max(0, dx - 40)], where
 * TRAVEL is baked from the sim's SNAP/SWEEP basket. The ball is a preference
 * (soft), never a guarantee: a banana is always must-catch.
 */

import {
  BALL_R, BALL_WALL_Q8, BASKET_MAX, BASKET_MIN, BREATHER_START, CARD_AIM, CARD_PAIL, CARD_PUFFER, DIFF_G_Q8,
  DIFF_INTERVAL_Q8, DIFF_PUFFER_Q8, FIELD_W, FORK_FROM, GIANT_G_Q8, INTRO_BALL, INTRO_PRIZE, ITEM_G_Q8, K_BANANA, K_BUNCH,
  K_COIN, K_LUCKY, K_PUFFER, LANE_Y, LOWGRAV_Q8, LUCKY_FROM, MAX_PRIZES, PHASE_BREATHER, PHASE_BUDGET, PHASE_BUILD, PHASE_G,
  PHASE_PRESSURE, PHASE_RUSH, PHASE_SERVE, PHASE_TIPOVER, PHASE_VY0, PHASE_WARM, PRIZE_EVERY, PRIZE_LIFE, PRIZE_RUSH_Y_MIN,
  PRIZE_Y_MAX, PRIZE_Y_MIN, PUFFER_CLEAR, PUFFER_MIN_FALL_QUEUE, PUFFER_MIN_FALL_RIDE, QUEUE1_PUFFER, R_INTRO, REACH_SLACK,
  REACT_STEPS, REMIX_START, RIDE_PRIZE, RIDE_PUFFER, S_FALL, S_FREE, S_HANG, SERVE_BOUNCES, SERVE_STEP, SPAWN_Y, STEPS_BAR,
  STEPS_BEAT, STEPS_HALF, SUB, TAN_Q8, THREAT_CAP_QUEUE, THREAT_CAP_RIDE, TIPOVER_START, TWIST_GIANT, TWIST_LOWGRAV,
  TWIST_PRIZES, WIND_SUB, ZONE_MID, TWIST_CROSSWIND,
} from './constants';
import { absInt, clampInt, floorDiv, rngBelow, rngRange, rngWeighted } from './fixed';
import { G_BALL, G_BALL_LO, MAXDX, TRAVEL, TRAVEL_MAX, VY_BALL, VY_BALL_LO } from './tables';
import {
  EV_FORK, EV_PRIZE, EV_REMIX, EV_SERVE, EV_TIPOVER, MAX_ITEMS, MAX_PENDING, MAX_REMIX, MODE_HEAT, MODE_PARTY, MODE_QUEUE,
  WINDOW, emit, maybeCard, ballIsLive, tierOf, type SimState,
} from './state';

// -- phrases (6.2) ------------------------------------------------------------------------

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
export const PH_PUFFER_WALL = 10;
export const PH_WEAVE = 11;
export const PH_DOUBLE_STACK = 12;
export const PH_HANG_COIN = 13;
export const PH_HANG_PAIR = 14;
export const PH_HANG_LUCKY = 15;
export const PH_FORK = 16;
export const PH_GOLDEN_A = 17;
export const PH_GOLDEN_B = 18;
export const PH_GOLDEN_C = 19;
export const PH_BREATHER = 20;
export const PH_FINALE = 21;
export const PH_GULL_STAIRS = 22;
export const PH_TIPOVER = 23;
export const PH_COUNT = 24;

export const PHRASE_NAMES = [
  'Single', 'Pair', 'Stairs L->R', 'Stairs R->L', 'Zigzag 5', 'Arc 7', 'Rain 6', 'Bunch+Singles', 'Coin Bait',
  'Puffer Gate', 'Puffer Wall', 'Weave', 'Double Stack', 'Hang Coin', 'Hang Pair', 'Hang Lucky', 'Fork', 'Golden Rain A',
  'Golden Rain B', 'Golden Rain C', 'Breather Arc', 'Finale Item', 'Gull + Stairs', 'Tip-Over Shower',
];

/** Phrases that put a hazard on the field (threat cap, Remix filter). */
export function phraseHazards(id: number): number {
  'worklet';
  if (id === PH_PUFFER_GATE || id === PH_PUFFER_WALL) return 2;
  if (id === PH_WEAVE || id === PH_GULL_STAIRS) return 1;
  return 0;
}

// -- timeline bits -------------------------------------------------------------------------

export const TL_BALL = 1;
export const TL_PUFFER = 2;
export const TL_BREATHER = 4;
export const TL_FINALE = 8;
export const TL_TIPOVER = 16;
export const TL_REMIX = 32;
export const TL_PAILCARD = 64;

// -- reachability ---------------------------------------------------------------------------

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

/** Max landing-x distance allowed between two must-catch bananas dt steps apart. */
export function reachAllowed(dt: number): number {
  'worklet';
  const a = dt < 0 ? -dt : dt;
  if (a < REACT_STEPS) return REACH_SLACK;
  return REACH_SLACK + maxDxIn(a - REACT_STEPS);
}

function lane(s: SimState): number {
  'worklet';
  return rngRange(s.rng, BASKET_MIN + 10, BASKET_MAX - 10);
}

/** Integer free fall from the cart to the lane: steps. */
export function fallSteps(vy0: number, g: number): number {
  'worklet';
  let y = SPAWN_Y * SUB;
  let vy = vy0;
  let n = 0;
  const laneY = LANE_Y * SUB;
  while (y < laneY && n < 400) {
    vy += g;
    y += vy;
    n++;
  }
  return n;
}

/** Ball tables for the run (Low Gravity keeps the apex, slows the cycle). */
export function ballG(s: SimState, n: number): number {
  'worklet';
  const k = n < 12 ? n : 12;
  return s.twist === TWIST_LOWGRAV ? G_BALL_LO[k] : G_BALL[k];
}

export function ballVy(s: SimState, n: number): number {
  'worklet';
  const k = n < 12 ? n : 12;
  return s.twist === TWIST_LOWGRAV ? VY_BALL_LO[k] : VY_BALL[k];
}

/** Exit vx (sub-units per step) for bounce n off rim zone z: |vy| * tan / 256, no basket term. */
export function zoneVx(s: SimState, n: number, z: number): number {
  'worklet';
  return floorDiv(-ballVy(s, n) * TAN_Q8[z], 256);
}

export function windAccel(s: SimState): number {
  'worklet';
  return s.twist === TWIST_CROSSWIND ? s.wind * WIND_SUB : 0;
}

/** One integer ball step (no rim), shared by the sim, the prediction and the aim line. */
export function ballMove(st: number[], g: number, wind: number): void {
  'worklet';
  // st = [x, y, vx, vy]
  st[3] += g;
  st[1] += st[3];
  st[2] += wind;
  st[0] += st[2];
  const lo = BALL_R * SUB;
  const hi = (FIELD_W - BALL_R) * SUB;
  if (st[0] < lo) {
    st[0] = lo + (lo - st[0]);
    st[2] = floorDiv(-st[2] * BALL_WALL_Q8, 256);
  } else if (st[0] > hi) {
    st[0] = hi - (st[0] - hi);
    st[2] = floorDiv(-st[2] * BALL_WALL_Q8, 256);
  }
}

/** Forward-simulate the untouched ball to its next rim crossing (up to 120 steps). */
export function predictBall(s: SimState): void {
  'worklet';
  s.bPredStep = -1;
  if (s.bOn !== 1) return;
  const st = [s.bX, s.bY, s.bVx, s.bVy];
  const rim = (LANE_Y - BALL_R) * SUB;
  const w = windAccel(s);
  for (let n = 1; n <= 120; n++) {
    ballMove(st, s.bG, w);
    if (st[3] > 0 && st[1] >= rim) {
      s.bPredStep = s.clock + n;
      s.bPredX = st[0];
      return;
    }
  }
}

export function phaseAt(s: SimState, lt: number): number {
  'worklet';
  if (s.mode === MODE_PARTY) return lt < 224 ? PHASE_SERVE : lt < 448 ? PHASE_BUILD : lt < 896 ? PHASE_PRESSURE : PHASE_RUSH;
  if (s.mode !== MODE_QUEUE) {
    if (lt < 224) return s.rules === R_INTRO ? PHASE_WARM : PHASE_SERVE;
    if (lt < 560) return PHASE_WARM;
    if (lt < 1120) return PHASE_BUILD;
    if (lt < BREATHER_START) return PHASE_PRESSURE;
    if (lt < s.rushAt) return PHASE_BREATHER;
    return PHASE_RUSH;
  }
  if (s.set === 0) {
    if (lt < 224) return s.unlock === 1 ? PHASE_WARM : PHASE_SERVE;
    return lt < 560 ? PHASE_WARM : lt < 896 ? PHASE_BUILD : PHASE_PRESSURE;
  }
  if (s.set === 1) return lt < 224 ? PHASE_BUILD : PHASE_PRESSURE;
  const c = s.setStart + lt;
  if (c < REMIX_START) return PHASE_TIPOVER;
  return c < s.rushAt ? PHASE_PRESSURE : PHASE_RUSH;
}

/** vy0 and gravity (sub-units) for a kind in a phase at the run's difficulty and twist. */
export function fallParams(s: SimState, kind: number, phase: number, out: number[]): void {
  'worklet';
  let vy0 = PHASE_VY0[phase];
  let gq = floorDiv(floorDiv(PHASE_G[phase] * 256 * ITEM_G_Q8[kind], 256) * DIFF_G_Q8[s.diff], 256);
  if (s.twist === TWIST_LOWGRAV) gq = floorDiv(gq * LOWGRAV_Q8, 256);
  if (s.twist === TWIST_GIANT && kind === K_BANANA) gq = floorDiv(gq * GIANT_G_Q8, 256);
  if (kind === K_PUFFER) {
    vy0 = floorDiv(vy0, 2);
    const queueLead = s.mode === MODE_QUEUE || s.mode === MODE_HEAT;
    const min = queueLead ? PUFFER_MIN_FALL_QUEUE : PUFFER_MIN_FALL_RIDE;
    for (let k = 0; k < 10 && fallSteps(vy0, floorDiv(gq, 256)) < min; k++) {
      gq = floorDiv(gq * 205, 256);
      vy0 = floorDiv(vy0 * 3, 4);
    }
  }
  out[0] = vy0;
  out[1] = floorDiv(gq, 256) > 1 ? floorDiv(gq, 256) : 2;
}

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
  // Soft ball term: prefer a landing reachable while keeping the ball.
  if (s.bOn === 1 && s.bPredStep >= 0) {
    const dt = absInt(land - s.bPredStep);
    if (dt <= 24) {
      const bx = s.bPredX >> 8;
      const a = REACH_SLACK + maxDxIn(dt);
      const pref = clampInt(x, bx - a, bx + a);
      if (pref >= lo && pref <= hi) x = pref;
    }
  }
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

/** Puffer landing x (fu) that keeps every nearby must-catch banana clear, or -1. */
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

function near(s: SimState, x: number, lo: number, hi: number): number {
  'worklet';
  const d = rngRange(s.rng, lo, hi);
  const dir = rngBelow(s.rng, 2) === 0 ? -1 : 1;
  let nx = x + dir * d;
  if (nx < BASKET_MIN + 6 || nx > BASKET_MAX - 6) nx = x - dir * d;
  return clampInt(nx, BASKET_MIN + 6, BASKET_MAX - 6);
}

/** Hazards airborne or telegraphing (puffers falling or queued, a gull in play). */
export function threatCount(s: SimState): number {
  'worklet';
  let n = s.gSt > 0 ? 1 : 0;
  for (let i = 0; i < MAX_ITEMS; i++) if (s.iSt[i] === S_FALL && s.iKind[i] === K_PUFFER) n++;
  for (let r = 0; r < s.pN; r++) if (s.pKind[r] === K_PUFFER) n++;
  return n;
}

export function threatCap(s: SimState): number {
  'worklet';
  return s.mode === MODE_QUEUE ? THREAT_CAP_QUEUE : THREAT_CAP_RIDE;
}

/**
 * Schedule one item (landing x in fu). must: 1 must-catch (single bananas
 * only), 0 optional. flag: 1 finale, 2 fork bunch, 3 free placement.
 * Returns the landing x or -1.
 */
export function addItem(s: SimState, at: number, kind: number, want: number, must: number, flag: number, phase: number): number {
  'worklet';
  if (s.pN >= MAX_PENDING) return -1;
  const fp = [0, 0];
  fallParams(s, kind, phase, fp);
  const steps = fallSteps(fp[0], fp[1]);
  const land = at + steps;
  let x = want;
  const isMust = kind === K_BANANA && must ? 1 : 0;
  if (flag !== 3) {
    if (kind === K_PUFFER) {
      if (threatCount(s) >= threatCap(s)) return -1;
      x = constrainPuffer(s, land, want);
      if (x < 0) return -1;
    } else if (isMust) {
      x = constrainMust(s, land, want);
      if (x < 0) return -1;
    } else {
      x = clampInt(want, BASKET_MIN, BASKET_MAX);
    }
  } else {
    x = clampInt(want, BASKET_MIN, BASKET_MAX);
  }
  const i = s.pN;
  s.pSpawn[i] = at;
  s.pKind[i] = kind;
  s.pX[i] = x * SUB;
  s.pVx[i] = 0;
  s.pVy[i] = fp[0];
  s.pG[i] = fp[1];
  s.pLandStep[i] = land;
  s.pLand[i] = steps;
  s.pMust[i] = isMust;
  s.pFlag[i] = flag === 1 || flag === 2 ? flag : 0;
  s.pN = i + 1;
  if (kind === K_PUFFER) pushPuffer(s, land, x);
  else if (isMust) {
    pushMust(s, land, x);
    s.dLastX = x;
  }
  return x;
}

/** Spawn step for an item of this kind to land exactly at `land` (or -1 if it is in the past). */
export function spawnFor(s: SimState, kind: number, phase: number, land: number): number {
  'worklet';
  const fp = [0, 0];
  fallParams(s, kind, phase, fp);
  return land - fallSteps(fp[0], fp[1]);
}

// -- hanging prizes (4.1, 6.2) ----------------------------------------------------------------

/** Pail x on the plaza at a clock step: ping-pong 90..310, 330 steps per leg. */
export function pailX(clock: number): number {
  'worklet';
  const t = ((clock % 660) + 660) % 660;
  return t < 330 ? 90 + floorDiv(220 * t, 330) : 310 - floorDiv(220 * (t - 330), 330);
}

/**
 * Where the ball goes after its next contact at rim x `cx` off zone z: fills
 * `out` with the arc's positions (fu) at every step until it returns to the
 * rim (max 100). Returns the number of points.
 */
export function zoneArc(s: SimState, cxSub: number, n: number, z: number, outX: number[], outY: number[]): number {
  'worklet';
  const st = [cxSub, (LANE_Y - BALL_R) * SUB, zoneVx(s, n, z), ballVy(s, n)];
  const g = ballG(s, n);
  const w = windAccel(s);
  const rim = (LANE_Y - BALL_R) * SUB;
  let k = 0;
  for (let m = 1; m <= 100; m++) {
    ballMove(st, g, w);
    outX[k] = st[0] >> 8;
    outY[k] = st[1] >> 8;
    k++;
    if (st[3] > 0 && st[1] >= rim) break;
  }
  return k;
}

function freePrize(s: SimState): number {
  'worklet';
  for (let i = 0; i < MAX_PRIZES; i++) if (s.hSt[i] === S_FREE) return i;
  return -1;
}

/**
 * Drop a hanging prize on a reachable zone path: at least one of the 5 zones,
 * from a basket x the basket can reach before the ball's next contact, sends
 * the ball through it (verified by the forward sim at drop time). With no
 * ball in play it hangs over a lane and waits for the next serve.
 */
export function dropPrize(s: SimState, kind: number): number {
  'worklet';
  const h = freePrize(s);
  if (h < 0) return -1;
  const yMin = s.rushOn ? PRIZE_RUSH_Y_MIN : PRIZE_Y_MIN;
  let px = lane(s);
  let py = rngRange(s.rng, yMin, PRIZE_Y_MAX);
  if (s.bOn === 1 && s.bPredStep >= 0) {
    const dt = s.bPredStep - s.clock;
    const n = s.bN + 1;
    const ax: number[] = [];
    const ay: number[] = [];
    for (let i = 0; i < 100; i++) {
      ax.push(0);
      ay.push(0);
    }
    const start = rngBelow(s.rng, 5);
    let placed = false;
    for (let t = 0; t < 5 && !placed; t++) {
      const z = (start + t) % 5;
      const need = (s.bPredX >> 8) - ZONE_MID[z];
      if (need < BASKET_MIN || need > BASKET_MAX) continue;
      if (travelOf(absInt(need - (s.bx >> 8))) > dt) continue;
      const k = zoneArc(s, s.bPredX, n, z, ax, ay);
      let c0 = -1;
      let c1 = -1;
      for (let m = 0; m < k; m++) {
        if (ay[m] >= yMin && ay[m] <= PRIZE_Y_MAX && ax[m] >= 40 && ax[m] <= FIELD_W - 40) {
          if (c0 < 0) c0 = m;
          c1 = m;
        }
      }
      if (c0 < 0) continue;
      const m = c0 + rngBelow(s.rng, c1 - c0 + 1);
      px = ax[m];
      py = ay[m];
      placed = true;
    }
  }
  s.hSt[h] = S_HANG;
  s.hKind[h] = kind;
  s.hX[h] = px;
  s.hY[h] = py;
  s.hT[h] = 0;
  s.hEnd[h] = s.clock + PRIZE_LIFE;
  s.idc += 1;
  s.hId[h] = s.idc;
  if (kind === K_LUCKY) s.luckyN += 1;
  emit(s, EV_PRIZE, 1, h, kind | (px << 4));
  maybeCard(s, CARD_AIM);
  return h;
}

function prizeInterval(s: SimState): number {
  'worklet';
  let iv = PRIZE_EVERY;
  if (s.twist === TWIST_PRIZES) iv = iv >> 1;
  if (s.rushOn) iv = iv >> 1;
  if (s.ghQ > 0) iv = STEPS_BEAT * 4;
  return iv;
}

function prizeKind(s: SimState): number {
  'worklet';
  if (s.full !== 1 || s.ghQ > 0 || s.luckyN >= s.luckyMax || s.clock < LUCKY_FROM) return K_COIN;
  if (s.mode === MODE_QUEUE && s.unlock < 2) return K_COIN;
  // Every other prize from bar 13 is a Lucky Bunch until the cap.
  return (s.idc & 1) === 0 ? K_LUCKY : K_COIN;
}

// -- phrase selection ------------------------------------------------------------------------

/** Phrase weights for the current state (index = phrase id). */
export function phraseWeights(s: SimState, phase: number, out: number[]): void {
  'worklet';
  for (let i = 0; i < PH_COUNT; i++) out[i] = 0;
  if (s.ghQ > 0) {
    out[PH_GOLDEN_A] = 1;
    out[PH_GOLDEN_B] = 1;
    out[PH_GOLDEN_C] = 1;
    return;
  }
  const caps = threatCount(s) < threatCap(s);
  const pw = s.pufferOn && caps ? floorDiv(2 * DIFF_PUFFER_Q8[s.diff], 256) : 0;
  if (phase === PHASE_WARM || phase === PHASE_SERVE) {
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
    out[PH_COIN_BAIT] = 1;
    out[PH_WEAVE] = pw > 0 && s.set > 0 ? 1 : 0;
  } else if (phase === PHASE_PRESSURE || phase === PHASE_TIPOVER) {
    out[PH_PAIR] = 2;
    out[PH_STAIRS_L] = 2;
    out[PH_STAIRS_R] = 2;
    out[PH_ZIGZAG] = 2;
    out[PH_ARC] = 2;
    out[PH_RAIN] = 2;
    out[PH_BUNCH_SINGLES] = 2;
    out[PH_DOUBLE_STACK] = 1;
    out[PH_WEAVE] = pw;
    out[PH_PUFFER_GATE] = pw > 0 ? 1 : 0;
    out[PH_COIN_BAIT] = 1;
    out[PH_GULL_STAIRS] = s.mode === MODE_QUEUE && s.set === 1 && s.hasGulls && caps && s.gSt === 0 ? 1 : 0;
  } else if (phase === PHASE_BREATHER) {
    out[PH_SINGLE] = 1;
  } else {
    out[PH_RAIN] = 3;
    out[PH_ZIGZAG] = 2;
    out[PH_STAIRS_L] = 1;
    out[PH_STAIRS_R] = 1;
    out[PH_ARC] = 2;
    out[PH_BUNCH_SINGLES] = 2;
    out[PH_WEAVE] = pw;
    out[PH_PUFFER_WALL] = pw > 0 ? 1 : 0;
  }
}

/**
 * Expand one phrase starting at clock step `at`. Returns its duration (steps)
 * in the low 16 bits and its cost in the high bits (cost << 16).
 */
export function playPhrase(s: SimState, id: number, at: number, phase: number): number {
  'worklet';
  const H = STEPS_HALF;
  const x = s.dLastX;
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
    dur = 8 * H;
    cost = 5;
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
    addItem(s, at, K_BUNCH, a, 0, 0, phase);
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
  } else if (id === PH_PUFFER_WALL) {
    // Rush: two puffers a beat apart on one side, bananas on the other.
    const side = rngBelow(s.rng, 2) === 0 ? 1 : -1;
    const px = side > 0 ? rngRange(s.rng, 270, 330) : rngRange(s.rng, 70, 130);
    addItem(s, at, K_PUFFER, px, 0, 0, phase);
    addItem(s, at + 2 * H, K_PUFFER, px - side * 60, 0, 0, phase);
    addItem(s, at + H, K_BANANA, 400 - px, 1, 0, phase);
    addItem(s, at + 3 * H, K_BANANA, 400 - px + side * 40, 1, 0, phase);
    dur = 3 * H;
    cost = 4;
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
  } else if (id === PH_GOLDEN_A || id === PH_GOLDEN_B || id === PH_GOLDEN_C) {
    // Golden rain: A sweeps, B fans out from the middle, C stacks two lanes.
    if (id === PH_GOLDEN_A) {
      const dir = rngBelow(s.rng, 2) === 0 ? 1 : -1;
      let gx = dir > 0 ? 100 : 300;
      for (let k = 0; k < 6; k++) {
        addItem(s, at + k * H, K_BANANA, gx, 1, 0, phase);
        gx += dir * 34;
      }
    } else if (id === PH_GOLDEN_B) {
      for (let k = 0; k < 6; k++) addItem(s, at + k * H, K_BANANA, 200 + (k % 2 === 0 ? 1 : -1) * (k >> 1) * 30, 1, 0, phase);
    } else {
      const a = rngRange(s.rng, 110, 170);
      for (let k = 0; k < 6; k++) addItem(s, at + k * H, k === 3 ? K_BUNCH : K_BANANA, k < 3 ? a : a + 90, k === 3 ? 0 : 1, 0, phase);
    }
    dur = 5 * H;
    cost = 4;
  } else if (id === PH_BREATHER) {
    for (let k = 0; k < 4; k++) addItem(s, at + k * 2 * H, K_BANANA, 130 + k * 46, 1, 0, phase);
    addItem(s, at + 9 * H, K_COIN, 200, 0, 0, phase);
    dur = 9 * H;
    cost = 3;
  } else if (id === PH_GULL_STAIRS) {
    // The gull goes on the gull timer; the stairs run away from where it will dive.
    const dir = (s.bx >> 8) < 200 ? 1 : -1;
    let sx = (s.bx >> 8) + dir * 40;
    for (let k = 0; k < 3; k++) {
      addItem(s, at + 2 * H + k * 2 * H, K_BANANA, sx, 1, 0, phase);
      sx += dir * 56;
    }
    if (s.gSt === 0 && s.gNext > at) s.gNext = at;
    dur = 6 * H;
    cost = 4;
  }
  return dur | (cost << 16);
}

/** Round up to the next beat of the round (sets are bar-aligned). */
export function onBeat(at: number): number {
  'worklet';
  const r = at % STEPS_BEAT;
  return r === 0 ? at : at + STEPS_BEAT - r;
}

function oneShot(s: SimState, bit: number, lt: number, when: number): boolean {
  'worklet';
  if ((s.tl & bit) !== 0 || lt < when) return false;
  s.tl |= bit;
  return true;
}

/** True once the ball arrives in this ruleset (intro and queue run 1 serve at 280). */
function ballStep(s: SimState): number {
  'worklet';
  if (s.rules === R_INTRO) return INTRO_BALL;
  if (s.mode === MODE_QUEUE && s.unlock === 1) return INTRO_BALL;
  return 0;
}

function firstPrize(s: SimState): number {
  'worklet';
  if (s.rules === R_INTRO) return INTRO_PRIZE;
  if (s.mode === MODE_QUEUE && s.unlock === 1) return INTRO_PRIZE;
  if (s.mode === MODE_PARTY) return 336;
  return RIDE_PRIZE;
}

function firstPuffer(s: SimState): number {
  'worklet';
  if (s.mode === MODE_QUEUE) return QUEUE1_PUFFER;
  if (s.mode === MODE_PARTY) return 448;
  return RIDE_PUFFER;
}

function hasForks(s: SimState): boolean {
  'worklet';
  if (s.full !== 1 || s.mode === MODE_PARTY) return false;
  return !(s.mode === MODE_QUEUE && s.unlock < 2);
}

function remixLog(s: SimState, id: number): void {
  'worklet';
  if (s.mode !== MODE_QUEUE || s.set > 1 || s.remix.length >= MAX_REMIX * 2) return;
  if (phraseHazards(id) > 0 || id === PH_COIN_BAIT) return;
  s.remix.push(id | (s.dLastX << 8) | (s.set << 20));
}

/** Set 3 Remix: this run's Set 1 and Set 2 phrases, mirrored, at Rush tempo (2 bars). */
function playRemix(s: SimState, c: number): void {
  'worklet';
  emit(s, EV_REMIX, 0, 0, 0);
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < s.remix.length; i++) {
    if ((s.remix[i] >> 20) === 0) a.push(s.remix[i]);
    else b.push(s.remix[i]);
  }
  let at = c;
  const end = s.rushAt - STEPS_BEAT;
  for (let k = 0; k < 8 && at < end - 60; k++) {
    const src = k % 2 === 0 ? a : b;
    if (src.length === 0) continue;
    const v = src[floorDiv(k, 2) % src.length];
    s.dLastX = FIELD_W - ((v >> 8) & 4095);
    const r = playPhrase(s, v & 255, at, PHASE_RUSH);
    at = onBeat(at + (r & 0xffff) + STEPS_HALF);
  }
  s.dNext = onBeat(end);
}

function placeFork(s: SimState, c: number, phase: number): boolean {
  'worklet';
  if (!hasForks(s) || c < FORK_FROM || !ballIsLive(s) || s.bOn !== 1 || s.chain < 5) return false;
  if (s.fkOn || c - s.fkLast < 240 || s.bPredStep < 0) return false;
  if (threatCount(s) > 0 || s.ghQ > 0) return false;
  // 1-2 per 10 s window.
  if (c - s.fkWin >= 600) {
    s.fkWin = c;
    s.fkWinN = 0;
  }
  if (s.fkWinN >= 2) return false;
  const land = s.bPredStep + rngRange(s.rng, -8, 8);
  const at = spawnFor(s, K_BUNCH, phase, land);
  if (at < c || at > c + 2) return false;
  const bx = s.bPredX >> 8;
  const dir = bx < 200 ? 1 : -1;
  const fx = clampInt(bx + dir * rngRange(s.rng, 150, 200), BASKET_MIN, BASKET_MAX);
  if (absInt(fx - bx) < 150) return false;
  addItem(s, at, K_BUNCH, fx, 0, 2, phase);
  s.fkOn = 1;
  s.fkStep = land;
  s.fkBunch = -1;
  s.fkBall = -1;
  s.fkLast = c;
  s.fkWinN += 1;
  emit(s, EV_FORK, fx, bx, 0);
  return true;
}

export function directorStep(s: SimState): void {
  'worklet';
  const c = s.clock;
  const lt = c - s.setStart;
  const phase = phaseAt(s, lt);
  const queue = s.mode === MODE_QUEUE;
  const lastSet = !queue || s.set === 2;
  // The serve: the cart tosses the ball (step 0, or 280 while it is being taught).
  if ((!queue || s.set === 0) && oneShot(s, TL_BALL, lt, ballStep(s))) s.tossReq = 200 + 1;
  if (!s.served) {
    const intro = ballStep(s) > 0;
    if (!intro && s.bounces < SERVE_BOUNCES && lt < SERVE_STEP) return;
    s.served = 1;
    s.dNext = onBeat(c + 1);
    s.prizeNext = firstPrize(s);
    emit(s, EV_SERVE, 0, 0, 0);
  }
  if (s.hasPail && oneShot(s, TL_PAILCARD, c, 224)) maybeCard(s, CARD_PAIL);
  // Hanging prizes, on the beat, every ~3 bars (Rush and Prize Party 2x, Golden Hour every 4 beats).
  if (c >= s.prizeNext && c % STEPS_BEAT === 0 && !(queue && c >= TIPOVER_START && c < REMIX_START)) {
    const finaleClear = c < s.total - STEPS_BAR;
    if (finaleClear) dropPrize(s, prizeKind(s));
    s.prizeNext = c + prizeInterval(s);
  }
  // Fixed beats of the run.
  if (oneShot(s, TL_PUFFER, c, firstPuffer(s)) && !(queue && s.set === 1)) {
    // The first puffer telegraph: alone, on the downbeat, slower.
    s.pufferOn = 1;
    maybeCard(s, CARD_PUFFER);
    addItem(s, c, K_PUFFER, clampInt(s.bx >> 8, 80, 320), 0, 0, PHASE_WARM);
    if (s.dNext < c + 3 * STEPS_BEAT) s.dNext = c + 3 * STEPS_BEAT;
  }
  if (!queue && s.mode !== MODE_PARTY && oneShot(s, TL_BREATHER, lt, BREATHER_START)) {
    playPhrase(s, PH_BREATHER, c, PHASE_BREATHER);
    s.dNext = s.rushAt - STEPS_BEAT;
  }
  if (queue && s.set === 1) s.pufferOn = s.hasGulls ? 0 : 1;
  if (queue && s.set === 2) {
    if (oneShot(s, TL_TIPOVER, c, TIPOVER_START)) {
      // Cart Tip-Over: 3 bars, 24 bananas + 4 falling coins, no hazards.
      s.pufferOn = 0;
      emit(s, EV_TIPOVER, 0, 0, 0);
      let tx = 200;
      let dir = 1;
      for (let k = 0; k < 28; k++) {
        const coin = k % 7 === 3;
        addItem(s, c + STEPS_BEAT + k * 10, coin ? K_COIN : K_BANANA, tx, coin ? 0 : 1, 0, PHASE_TIPOVER);
        tx += dir * 30;
        if (tx > 300 || tx < 100) dir = -dir;
      }
      s.dNext = REMIX_START;
    }
    if (oneShot(s, TL_REMIX, c, REMIX_START)) playRemix(s, c);
    if (c >= s.rushAt) s.pufferOn = 1;
  }
  // Finale: a guaranteed bunch landing on the last beat before TIME!.
  if (lastSet && (s.tl & TL_FINALE) === 0) {
    const land = s.setStart + s.setLen - STEPS_BEAT;
    const at = spawnFor(s, K_BUNCH, phase, land);
    if (c >= at) {
      s.tl |= TL_FINALE;
      if (addItem(s, c, K_BUNCH, s.dLastX, 0, 1, phase) < 0) addItem(s, c, K_BUNCH, s.bx >> 8, 0, 3, phase);
    }
  }
  // Forks (full rules): the bunch lands far from the ball's next contact, at the same moment.
  if (placeFork(s, c, phase)) return;
  if (c < s.dNext) return;
  // Regular phrases: budget per 5 s rises with the chain tier (+1 per tier above x1).
  let budget = PHASE_BUDGET[phase] + tierOf(s.chain) - 1 + (s.ghQ > 0 ? 3 : 0);
  if (budget < 2) budget = 2;
  const w: number[] = [];
  for (let i = 0; i < PH_COUNT; i++) w.push(0);
  phraseWeights(s, phase, w);
  let id = rngWeighted(s.rng, w);
  if (w[id] === 0) id = PH_SINGLE;
  // Keep landings inside the set (a clean set break; the finale lands alone).
  const tail = lastSet ? 110 : 60;
  if (lt + 150 > s.setLen - tail) {
    s.dNext = s.setStart + s.setLen + STEPS_BEAT;
    return;
  }
  remixLog(s, id);
  const r = playPhrase(s, id, c, phase);
  const dur = r & 0xffff;
  const cost = r >> 16;
  let gap = floorDiv(cost * 300 + budget - 1, budget);
  gap = floorDiv(gap * DIFF_INTERVAL_Q8[s.diff], 256);
  if (gap < dur + STEPS_HALF) gap = dur + STEPS_HALF;
  s.dNext = onBeat(c + gap);
}

export { K_BANANA, K_BUNCH, K_COIN, K_LUCKY, K_PUFFER, PHASE_BUILD, PHASE_PRESSURE, PHASE_RUSH, STEPS_BAR, S_HANG };
