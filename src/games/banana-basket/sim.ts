/**
 * Banana Basket v2: the deterministic sim (design rev 8, "hero first, live heats").
 *
 * Pure, integer-only and worklet-safe. The same code runs on the UI thread
 * (useGameClock onStep), in node tests, in the bots, in ghost playback and
 * (ported 1:1) in the server replay. Positions and velocities are sub-units
 * (1/256 fu), time is 60 Hz steps, timescales are q8 (256 = 1.0).
 *
 * Thumb-driven time (3.2): holdTs follows the thumb (RAMP_UP / RAMP_DOWN).
 * The round clock advances by holdTs only, so lifting the thumb freezes the
 * park and never burns time. Ranked runs add the Freeze Lock: a lift within
 * 30 full-speed steps of the last resume queues the freeze, parks the basket
 * and shields the shark until the lock expires. The caller stops calling
 * step() once holdTs is 0 with no thumb, so a 10 minute freeze adds 0 bytes.
 *
 * The ball (3.4): 5 rim zones with fixed exit angles; the contact offset
 * alone decides where it flies (no basket-velocity term).
 *
 * Gameplay uses only + - * floorDiv, abs, min, max and table lookups.
 */

import {
  ASSIST_ZONE, BALL_GOLD_AT, BALL_WALL_Q8, BALL_R, BALL_SURFACE, BASKET_MAX, BASKET_MIN, BONK_BASE, CARD_BALL, CARD_CATCH, CARD_GATE,
  CARD_GOLDEN, CARD_GULL, CARD_HEAT, CARD_SET_BASE, CLOSE_CALL_BAND, CLOSE_EASE, CLOSE_HOLD, CLOSE_PTS, CLOSE_TS,
  COIN_SET_PTS, EDGE_BAND, EVENT_GOLDEN, EVENT_RUSH, FIELD_W, FINALE_NEAR, FINALE_TS, G_CATCH, G_GOLD_POP, G_PERFECT,
  G_POP, GIANT_BASE, GIANT_SIZE, GOLDEN_MAGNET, GOLDEN_STEPS, GOLDEN_WARN, GOLDEN_ZONE_Q8, GULL_DIVE, GULL_GAP_BARS,
  GULL_REACH, GULL_TELL, GULL_TELL_FIRST, HALF_ZONE, HEART_PTS, HITSTOP_GAP, HITSTOP_GOLDEN, HITSTOP_PUFFER,
  HITSTOP_TIME, INTRO_THREE_Q8, INTRO_TWO_Q8, INVULN_STEPS, ITEM_BASE, ITEM_SIZE, K_BANANA, K_BUNCH, K_COIN, K_LUCKY,
  K_PUFFER, LANE_Y, LOCK_STEPS, METER_PIPS, MQ_CAP, PAIL_REACH, PAIL_RESERVE, PERFECT_D, PLAZA_Y, PRIZE_R,
  PUFFER_TELL_QUEUE, PUFFER_TELL_RIDE, QUEUE_SETS, QUEUE_STAR_Q8, R_INTRO, RESERVE_GRACE, RESERVE_GRACE_UNTIL,
  RESERVE_LATE, RESERVE_TELL, S_BONKED, S_DUNK, S_EDGE, S_FALL, S_FREE, S_HANG, S_MISS, S_PASS, S_POP, S_REEL,
  SET_STEPS, SNAP, SPAWN_Y, STARS_RIDE, STEPS_BAR, STEPS_BEAT, SUB, SWEEP, TIER_AT, TWIST_GIANT, WIDE_ZONE, ZONE_CENTER,
  ZONE_INNER, ZONE_OUTER, MAX_PRIZES, PRIZE_Y_MAX,
} from './constants';
import { absInt, clampInt, floorDiv, signInt } from './fixed';
import { ballIsLive, gatedTier } from './state';
import { RAMP_DOWN, RAMP_UP } from './tables';
import { ballG, ballMove, ballVy, directorStep, onBeat, pailX, predictBall, windAccel, zoneVx } from './patterns';
import {
  EV_BALL_LOST, EV_BALL_POP, EV_BALL_TOSS, EV_BONK, EV_BOUNCE, EV_BREAK, EV_CARD, EV_CATCH, EV_CLOSE, EV_COIN,
  EV_COIN_SET, EV_EDGE, EV_FINALE, EV_GATE, EV_GOLD_BALL, EV_GOLDEN, EV_GULL, EV_HEARTS_OUT, EV_HIT, EV_MISS, EV_PAIL,
  EV_PARK, EV_PRIZE, EV_PUFF, EV_RUSH, EV_SET, EV_SHIELD, EV_SPAWN, EV_SPLAT, EV_TELL, EV_TICK, EV_TIER, EV_TIME,
  EV_VICTORY, EV_ZONE, END_HEARTS, END_TIME, MAX_ITEMS, MODE_HEAT, MODE_QUEUE, createSim, emit, freeSlot, maybeCard,
  tierOf, type SimConfig, type SimState,
} from './state';

export * from './state';

// -- tiers and the ball gate ------------------------------------------------------------------

// -- the ball ------------------------------------------------------------------------------------

// -- gulls ---------------------------------------------------------------------------------------

// -- timers ---------------------------------------------------------------------------------------

// -- the clock-step timeline (sets, rush, golden hour, serve, ticks) -----------------------------

/** Ball-tagged lane x helpers shared with the render (aim line). */

/** 1 when the ball gate is holding the tier at x2 (full rules, chain 12+ without a live ball). */
export function gateHeld(s: SimState): number {
  'worklet';
  return s.full === 1 && tierOf(s.chain) > 2 && !ballIsLive(s) ? 1 : 0;
}

/**
 * Re-evaluate the ball-gated tier after a chain or ball change. A rise is a
 * tier-up (c = 1 when the ball just unlocked it); a ball loss at chain 12+
 * locks it back to x2. Chain breaks reset silently (EV_BREAK says it).
 */
function updateGate(s: SimState, why: number): void {
  'worklet';
  // why: 0 chain grew, 1 quiet (break, gull steal), 2 ball change
  const t = gatedTier(s);
  if (why !== 1 && t > s.gTier) {
    emit(s, EV_TIER, t, s.chain, why === 2 ? 1 : 0);
    if (why === 2) emit(s, EV_GATE, 2, t, 0);
  } else if (why === 2 && t < s.gTier) emit(s, EV_GATE, 1, t, 0);
  if (gateHeld(s)) maybeCard(s, CARD_GATE);
  s.gTier = t;
  s.tier = t;
}

export function eventQuarters(s: SimState): number {
  'worklet';
  if (s.ghQ > 0) return EVENT_GOLDEN;
  if (s.rushOn) return EVENT_RUSH;
  return 0;
}

/** points = floorDiv(base * min(32, T * (4 + grade + event)), 4). */
export function scorePoints(base: number, tier: number, grade: number, event: number): number {
  'worklet';
  let mq = tier * (4 + grade + event);
  if (mq > MQ_CAP) mq = MQ_CAP;
  return floorDiv(base * mq, 4);
}

export function catchHalf(s: SimState): number {
  'worklet';
  let z = (s.assist ? WIDE_ZONE : HALF_ZONE) * SUB;
  if (s.ghQ > 0) z = floorDiv(z * GOLDEN_ZONE_Q8, 256);
  return z;
}

export function itemBase(s: SimState, kind: number): number {
  'worklet';
  if (kind === K_BANANA && s.twist === TWIST_GIANT) return GIANT_BASE;
  return ITEM_BASE[kind];
}

export function itemSize(s: SimState, kind: number): number {
  'worklet';
  if (kind === K_BANANA && s.twist === TWIST_GIANT) return GIANT_SIZE;
  return ITEM_SIZE[kind];
}

function nextHoldTs(cur: number, touch: number): number {
  'worklet';
  if (touch) {
    for (let i = 0; i < RAMP_UP.length; i++) if (RAMP_UP[i] > cur) return RAMP_UP[i];
    return 256;
  }
  for (let i = 0; i < RAMP_DOWN.length; i++) if (RAMP_DOWN[i] < cur) return RAMP_DOWN[i];
  return 0;
}

function computeFxTs(s: SimState): number {
  'worklet';
  if (s.hitStopQ > 0) return 0;
  if (s.finale === 1) return FINALE_TS;
  if (s.slowQ >= 0) {
    const st = s.slowQ >> 8;
    if (st < CLOSE_HOLD) return CLOSE_TS;
    const k = st - CLOSE_HOLD;
    if (k >= CLOSE_EASE) return 256;
    // easeOutQuad back to 1.0 over 9 steps.
    const u = 256 - floorDiv((CLOSE_EASE - k) * (CLOSE_EASE - k) * 256, CLOSE_EASE * CLOSE_EASE);
    return CLOSE_TS + floorDiv((256 - CLOSE_TS) * u, 256);
  }
  return 256;
}

/**
 * Global hit-stop (puffer hit, Golden Hour entry, TIME! only). Never two
 * within 15 clock steps: a later request is downgraded to the render-only
 * local freeze (it returns false). TIME! always wins.
 */
export function hitStop(s: SimState, steps: number, force: number): boolean {
  'worklet';
  if (!force && s.clock - s.lastStop < HITSTOP_GAP) return false;
  s.lastStop = s.clock;
  const q = steps * 256;
  if (q > s.hitStopQ) s.hitStopQ = q;
  return true;
}

/** SNAP/SWEEP movement (3.1), scaled by holdTs. */
export function moveBasket(s: SimState): void {
  'worklet';
  const h = s.holdTs;
  if (h <= 0) return;
  const gap = s.btx - s.bx;
  if (gap === 0) {
    s.bv = 0;
    return;
  }
  const snap = floorDiv(SNAP * SUB * h, 256);
  if (absInt(gap) <= snap) {
    s.bv = gap;
    s.bx = s.btx;
    return;
  }
  s.bv = signInt(gap) * floorDiv(SWEEP * SUB * h, 256);
  s.bx += s.bv;
}

/** True when the basket is sweeping at the speed cap (the dust tell). */
export function sweeping(s: SimState): boolean {
  'worklet';
  return absInt(s.btx - s.bx) > 0 && absInt(s.bv) >= floorDiv(SWEEP * SUB * s.holdTs, 256) && s.holdTs > 0;
}

function addChain(s: SimState): void {
  'worklet';
  s.chain += 1;
  if (s.chain > s.maxChain) s.maxChain = s.chain;
  updateGate(s, 0);
}

function breakChain(s: SimState): void {
  'worklet';
  if (s.chain > 0) emit(s, EV_BREAK, s.chain, 0, 0);
  s.chain = 0;
  updateGate(s, 1);
}

/** Gull steal: the chain drops to the first value of the tier below. */
export function dropTier(s: SimState): void {
  'worklet';
  const t = tierOf(s.chain);
  s.chain = t >= 2 ? TIER_AT[t - 2] : 0;
  updateGate(s, 1);
}

/** The step Golden Hour must end by: Gold Rush or the set end. */
function goldenLimit(s: SimState, from: number): number {
  'worklet';
  const setEnd = s.setStart + s.setLen;
  return from < s.rushAt && s.rushAt < setEnd ? s.rushAt : setEnd;
}

/** Coin Meter pip. From Gold Rush on (full rules) the ring dims and stops filling. */
function addPip(s: SimState, x: number): void {
  'worklet';
  if (s.full === 1 && s.clock >= s.rushAt) return;
  if (s.ghQ > 0 || s.ghArmAt >= 0) {
    // During Golden Hour coins fill the next cycle (never past 2 pips).
    if (s.meter < METER_PIPS - 1) s.meter += 1;
    return;
  }
  s.meter += 1;
  if (s.meter < METER_PIPS) return;
  s.meter = 0;
  s.bPip = 0;
  if (s.full !== 1) {
    // ride_intro: a full ring pays a flat COIN SET and empties.
    s.score += COIN_SET_PTS;
    emit(s, EV_COIN_SET, x, COIN_SET_PTS, 0);
    return;
  }
  // Armed: Golden Hour starts on the next beat.
  s.ghArmAt = onBeat(s.clock + 1);
  emit(s, EV_GOLDEN, 4, x, s.ghArmAt);
}

function startGolden(s: SimState): void {
  'worklet';
  const start = s.clock;
  s.ghArmAt = -1;
  if (s.full === 1 && start >= s.rushAt - STEPS_BEAT && s.rushAt < s.setStart + s.setLen) return;
  const lim = goldenLimit(s, start);
  if (start >= lim - STEPS_BEAT) return;
  s.ghQ = 1;
  s.ghEnd = start + GOLDEN_STEPS < lim ? start + GOLDEN_STEPS : lim;
  s.fevers += 1;
  hitStop(s, HITSTOP_GOLDEN, 0);
  emit(s, EV_GOLDEN, 1, s.bx >> 8, s.ghEnd);
  maybeCard(s, CARD_GOLDEN);
}

function endGolden(s: SimState): void {
  'worklet';
  if (s.ghQ === 0) return;
  s.ghQ = 0;
  emit(s, EV_GOLDEN, 3, 0, 0);
}

function onBeatNow(s: SimState): number {
  'worklet';
  const r = s.clock % STEPS_BEAT;
  return r <= 2 || r >= STEPS_BEAT - 2 ? 1 : 0;
}

/**
 * Score a collected item (basket catch, ball POP, BONK or a hanging prize).
 * grade: G_CATCH, G_PERFECT, G_POP, G_GOLD_POP. popped: 1 when the ball took it.
 */
function collect(s: SimState, kind: number, xf: number, grade: number, popped: number, edge: number): void {
  'worklet';
  const t = gatedTier(s);
  const pts = scorePoints(itemBase(s, kind), t, grade, eventQuarters(s));
  s.score += pts;
  if (popped) {
    s.pops += 1;
    s.popPts += pts;
  } else {
    s.catches += 1;
    if (t >= 3) s.uplift += floorDiv(pts * (t - 2), t);
  }
  if (grade === G_PERFECT) s.perfects += 1;
  addChain(s);
  const held = gateHeld(s);
  emit(s, EV_CATCH, xf, kind | (grade << 4) | (gatedTier(s) << 8) | (held << 12) | (onBeatNow(s) << 13) | (edge << 14), pts + s.chain * 65536);
  if (kind === K_COIN) {
    emit(s, EV_COIN, xf, s.meter + 1 >= METER_PIPS ? METER_PIPS : s.meter + 1, pts);
    addPip(s, xf);
  }
}

function spawnPending(s: SimState): void {
  'worklet';
  let w = 0;
  for (let r = 0; r < s.pN; r++) {
    if (s.pSpawn[r] <= s.clock) {
      const i = freeSlot(s);
      if (i >= 0) {
        s.iSt[i] = S_FALL;
        s.iKind[i] = s.pKind[r];
        s.iX[i] = s.pX[r];
        s.iY[i] = SPAWN_Y * SUB;
        s.iVx[i] = s.pVx[r];
        s.iVy[i] = s.pVy[r];
        s.iG[i] = s.pG[r];
        s.iAge[i] = 0;
        s.iLand[i] = s.pLand[r];
        s.iLandStep[i] = s.pLandStep[r];
        s.iMust[i] = s.pMust[r];
        s.iPuff[i] = 0;
        s.iTold[i] = 0;
        s.iT[i] = 0;
        s.iSide[i] = 0;
        s.iClose[i] = 0;
        s.iFlag[i] = s.pFlag[r];
        s.idc += 1;
        s.iId[i] = s.idc;
        if (s.pFlag[r] === 1) s.finaleSlot = i;
        emit(s, EV_SPAWN, s.pX[r] >> 8, s.pKind[r], i);
      }
      continue;
    }
    if (w !== r) {
      s.pSpawn[w] = s.pSpawn[r];
      s.pKind[w] = s.pKind[r];
      s.pX[w] = s.pX[r];
      s.pVx[w] = s.pVx[r];
      s.pVy[w] = s.pVy[r];
      s.pG[w] = s.pG[r];
      s.pLandStep[w] = s.pLandStep[r];
      s.pLand[w] = s.pLand[r];
      s.pMust[w] = s.pMust[r];
      s.pFlag[w] = s.pFlag[r];
    }
    w++;
  }
  s.pN = w;
}

function endFinale(s: SimState, i: number): void {
  'worklet';
  if (s.finaleSlot === i) {
    s.finale = 2;
    s.finaleSlot = -1;
  }
}

/** Fork outcome tally (proof stats forks_ball / forks_bunch / forks_both). */
function forkResolve(s: SimState): void {
  'worklet';
  if (!s.fkOn || s.fkBunch < 0 || s.fkBall < 0) return;
  if (s.fkBunch === 1 && s.fkBall === 1) s.forksBoth += 1;
  else if (s.fkBall === 1) s.forksBall += 1;
  else if (s.fkBunch === 1) s.forksBunch += 1;
  s.fkOn = 0;
}

function forkBunch(s: SimState, i: number, got: number): void {
  'worklet';
  if (s.iFlag[i] !== 2 || !s.fkOn) return;
  s.fkBunch = got;
  forkResolve(s);
}

/**
 * TIME! (Sugar Crush victory lap): a live ball knocks every leftover airborne
 * item into the basket, scored as a CATCH at the current tier; each heart left
 * is worth 50. All deterministic and part of the verified score.
 */
export function endBonus(s: SimState): number {
  'worklet';
  let b = 0;
  if (s.endReason === END_HEARTS) return 0;
  b += s.hearts * HEART_PTS;
  if (ballIsLive(s)) {
    const t = gatedTier(s);
    let n = 0;
    let pts = 0;
    for (let i = 0; i < MAX_ITEMS; i++) {
      if (s.iSt[i] !== S_FALL || s.iKind[i] === K_PUFFER) continue;
      pts += scorePoints(itemBase(s, s.iKind[i]), t, G_CATCH, eventQuarters(s));
      s.iSt[i] = S_DUNK;
      s.iT[i] = 0;
      n++;
    }
    if (n > 0) emit(s, EV_VICTORY, n, pts, 0);
    b += pts;
  }
  return b;
}

export function finish(s: SimState, reason: number): void {
  'worklet';
  if (s.done) return;
  s.done = 1;
  s.endReason = reason;
  s.bonus = endBonus(s);
  if (reason === END_TIME) hitStop(s, HITSTOP_TIME, 1);
  emit(s, EV_TIME, reason, 0, 0);
}

function resolveCrossing(s: SimState, i: number, xc: number, half: number): void {
  'worklet';
  const kind = s.iKind[i];
  const d = absInt(xc - s.bx);
  if (kind === K_PUFFER) {
    s.iSt[i] = S_PASS;
    const hz = HALF_ZONE * SUB;
    if (d <= hz) {
      if (s.parked) {
        // Parked shield: the puffer bounces off a bubble; no heart, no flash.
        s.shields += 1;
        emit(s, EV_SHIELD, xc >> 8, 1, i);
      } else if (s.invulnQ <= 0) {
        s.hearts -= 1;
        s.invulnQ = INVULN_STEPS * 256;
        hitStop(s, HITSTOP_PUFFER, 0);
        emit(s, EV_HIT, xc >> 8, s.hearts, i);
        if (s.hearts <= 0) {
          emit(s, EV_HEARTS_OUT, 0, 0, 0);
          finish(s, END_HEARTS);
        }
      }
    } else if (d <= hz + CLOSE_CALL_BAND * SUB && !s.parked && s.iClose[i] === 0) {
      s.iClose[i] = 1;
      s.closeCalls += 1;
      s.score += CLOSE_PTS;
      s.slowQ = 0;
      emit(s, EV_CLOSE, xc >> 8, CLOSE_PTS, i);
    }
    return;
  }
  // Assist: 6 fu extra on the side the basket is moving toward.
  let z = half;
  if (s.bv !== 0 && signInt(xc - s.bx) === signInt(s.bv)) z += ASSIST_ZONE * SUB;
  if (d <= z + EDGE_BAND * SUB) {
    const edge = d > z ? 1 : 0;
    const grade = d <= PERFECT_D * SUB ? G_PERFECT : G_CATCH;
    s.iSt[i] = S_DUNK;
    s.iT[i] = 0;
    s.iX[i] = xc;
    s.iSide[i] = signInt(xc - s.bx);
    if (edge) emit(s, EV_EDGE, xc >> 8, kind, s.iSide[i]);
    collect(s, kind, xc >> 8, grade, 0, edge);
    forkBunch(s, i, 1);
    endFinale(s, i);
    return;
  }
  s.iSt[i] = S_MISS;
  const must = kind === K_BANANA && s.iMust[i] === 1;
  if (must) {
    s.misses += 1;
    breakChain(s);
  }
  forkBunch(s, i, 0);
  emit(s, EV_MISS, xc >> 8, kind, must ? 1 : 0);
  endFinale(s, i);
}

export function tossBall(s: SimState, xFu: number): void {
  'worklet';
  s.bOn = 1;
  s.bX = xFu * SUB;
  s.bY = 120 * SUB;
  s.bVx = signInt(s.bx - s.bX) * 256;
  s.bVy = 0;
  s.bG = ballG(s, 0);
  s.bN = 0;
  s.bGold = 0;
  s.bKeep = 0;
  s.bServeAt = -1;
  s.pailUsed = 0;
  predictBall(s);
  emit(s, EV_BALL_TOSS, xFu, 0, 0);
  emit(s, EV_PAIL, pailX(s.clock), 2, 0);
  maybeCard(s, CARD_BALL);
}

/** Pail save: the pail kicks the ball straight back up from the plaza (1.0 s later, on the beat). */
function pailLaunch(s: SimState): void {
  'worklet';
  const x = pailX(s.clock);
  s.bOn = 1;
  s.bX = x * SUB;
  s.bY = (PLAZA_Y - BALL_R) * SUB;
  s.bVx = 0;
  s.bVy = ballVy(s, 0);
  s.bG = ballG(s, 0);
  s.bN = 0;
  s.bServeAt = -1;
  predictBall(s);
  emit(s, EV_BALL_TOSS, x, 1, 0);
}

/** Rim zone of a contact offset (sub-units): 0 OUTER-L .. 4 OUTER-R. */
export function zoneOf(dSub: number): number {
  'worklet';
  const ad = absInt(dSub);
  if (ad <= ZONE_CENTER * SUB) return 2;
  if (ad <= ZONE_INNER * SUB) return dSub < 0 ? 1 : 3;
  return dSub < 0 ? 0 : 4;
}

function bounce(s: SimState, dx: number): void {
  'worklet';
  s.bN += 1;
  s.bKeep = 0;
  s.bounces += 1;
  if (s.bN > s.bestLife) s.bestLife = s.bN;
  const z = zoneOf(dx);
  s.bZone = z;
  s.bY = (LANE_Y - BALL_R) * SUB;
  s.bVy = ballVy(s, s.bN);
  s.bG = ballG(s, s.bN);
  s.bVx = zoneVx(s, s.bN, z);
  updateGate(s, 2);
  if (s.bN === BALL_GOLD_AT && !s.bGold) {
    s.bGold = 1;
    s.goldBalls += 1;
    emit(s, EV_GOLD_BALL, s.bX >> 8, 0, 0);
  }
  emit(s, EV_BOUNCE, s.bX >> 8, s.bN, s.bGold | (z << 1));
  emit(s, EV_ZONE, s.bX >> 8, z, s.bN);
  // Fork: the ball kept within the fork window.
  if (s.fkOn && s.fkBall < 0 && s.clock >= s.fkStep - 14) {
    s.fkBall = 1;
    forkResolve(s);
  }
  // Every 5th consecutive bounce fills one pip, at most once per meter cycle.
  if (s.bN % 5 === 0 && s.bPip === 0) {
    s.bPip = 1;
    addPip(s, s.bX >> 8);
  }
  predictBall(s);
}

function scheduleServe(s: SimState, delay: number): void {
  'worklet';
  s.bServeAt = onBeat(s.clock + delay);
  s.bServeTold = 0;
}

function loseBall(s: SimState): void {
  'worklet';
  const x = s.bX >> 8;
  s.bOn = 0;
  s.bN = 0;
  s.bGold = 0;
  s.bKeep = 0;
  s.bPredStep = -1;
  const grace = s.rules === R_INTRO || s.clock < RESERVE_GRACE_UNTIL;
  scheduleServe(s, grace ? RESERVE_GRACE : RESERVE_LATE);
  if (s.fkOn && s.fkBall < 0) {
    s.fkBall = 0;
    forkResolve(s);
  }
  emit(s, EV_BALL_LOST, x, 0, 0);
  updateGate(s, 2);
}

/** Diving gull position (fu): an integer parabola from the entry edge to the lane over 42 steps. */
export function gullX(s: SimState): number {
  'worklet';
  const k = clampInt(s.gQ >> 8, 0, GULL_DIVE);
  const tx = s.gX >> 8;
  return s.gEdge + floorDiv((tx - s.gEdge) * k, GULL_DIVE);
}

export function gullY(s: SimState): number {
  'worklet';
  const k = clampInt(s.gQ >> 8, 0, GULL_DIVE);
  return 150 + floorDiv((LANE_Y - 30 - 150) * k * k, GULL_DIVE * GULL_DIVE);
}

function stepBall(s: SimState, dt: number): void {
  'worklet';
  if (s.bOn !== 1) return;
  const py = s.bY;
  const st = [s.bX, s.bY, s.bVx, s.bVy];
  // dt-scaled integration (slow-mo and hit-stop scale the world).
  st[3] += floorDiv(s.bG * dt, 256);
  st[1] += floorDiv(st[3] * dt, 256);
  st[2] += floorDiv(windAccel(s) * dt, 256);
  st[0] += floorDiv(st[2] * dt, 256);
  s.bVy = st[3];
  s.bY = st[1];
  s.bVx = st[2];
  s.bX = st[0];
  const lo = BALL_R * SUB;
  const hi = (FIELD_W - BALL_R) * SUB;
  if (s.bX < lo) {
    s.bX = lo + (lo - s.bX);
    s.bVx = floorDiv(-s.bVx * BALL_WALL_Q8, 256);
  } else if (s.bX > hi) {
    s.bX = hi - (s.bX - hi);
    s.bVx = floorDiv(-s.bVx * BALL_WALL_Q8, 256);
  }
  // Bounce off the basket's top band (the ball's bottom meets the rim).
  const rim = (LANE_Y - BALL_R) * SUB;
  if (s.bVy > 0 && py <= rim + BALL_SURFACE * SUB && s.bY >= rim && s.bY <= rim + BALL_SURFACE * 2 * SUB) {
    const dx = s.bX - s.bx;
    if (absInt(dx) <= ZONE_OUTER * SUB) {
      bounce(s, dx);
      return;
    }
  }
  const t = gatedTier(s);
  // POP falling items and BONK puffers.
  for (let i = 0; i < MAX_ITEMS; i++) {
    if (s.iSt[i] !== S_FALL || s.iFlag[i] === 1) continue;
    const kind = s.iKind[i];
    // Falling items pop only in the sky band (the ball is a skill shot, not a vacuum);
    // puffers can be BONKed until they are near the rim.
    if (s.iY[i] > (kind === K_PUFFER ? LANE_Y - 30 : PRIZE_Y_MAX) * SUB) continue;
    const r = BALL_R + (itemSize(s, kind) >> 1) - (kind === K_PUFFER ? 6 : 14);
    const dx = (s.iX[i] - s.bX) >> 8;
    const dy = (s.iY[i] - s.bY) >> 8;
    if (dx * dx + dy * dy > r * r) continue;
    if (kind === K_PUFFER) {
      const pts = scorePoints(BONK_BASE, t, G_POP, eventQuarters(s));
      s.score += pts;
      s.popPts += pts;
      s.bonks += 1;
      s.iSt[i] = S_BONKED;
      s.iT[i] = 0;
      s.iVy[i] = -1620;
      s.iVx[i] = signInt(s.iX[i] - s.bX) * 1024 + (s.iX[i] >= s.bX ? 256 : -256);
      addChain(s);
      emit(s, EV_BONK, s.iX[i] >> 8, pts, 1);
      continue;
    }
    s.iSt[i] = S_POP;
    s.iT[i] = 0;
    collect(s, kind, s.iX[i] >> 8, s.bGold ? G_GOLD_POP : G_POP, 1, 0);
    forkBunch(s, i, 1);
    emit(s, EV_BALL_POP, s.iX[i] >> 8, kind, i);
    endFinale(s, i);
  }
  // Hanging prizes: squared-distance POP snaps the string.
  for (let h = 0; h < MAX_PRIZES; h++) {
    if (s.hSt[h] !== S_HANG) continue;
    const dx = s.hX[h] - (s.bX >> 8);
    const dy = s.hY[h] - (s.bY >> 8);
    const r = BALL_R + PRIZE_R;
    if (dx * dx + dy * dy > r * r) continue;
    s.hSt[h] = S_POP;
    s.hT[h] = 0;
    collect(s, s.hKind[h], s.hX[h], s.bGold ? G_GOLD_POP : G_POP, 1, 0);
    emit(s, EV_PRIZE, 2, h, s.hKind[h] | (s.hX[h] << 4));
  }
  // Gull BONK: the diving gull is sent back.
  if (s.gSt === 2) {
    const gx = gullX(s);
    const gy = gullY(s);
    const dx = gx - (s.bX >> 8);
    const dy = gy - (s.bY >> 8);
    const r = BALL_R + 28;
    if (dx * dx + dy * dy <= r * r) {
      const pts = scorePoints(BONK_BASE, t, G_POP, eventQuarters(s));
      s.score += pts;
      s.popPts += pts;
      s.bonks += 1;
      s.gSt = 0;
      addChain(s);
      emit(s, EV_BONK, gx, pts, 2);
      emit(s, EV_GULL, 6, gx, 0);
    }
  }
  // Past the lane: the pail (once per ball life) or a lost ball.
  if (s.bY > (PLAZA_Y - BALL_R) * SUB) {
    const px = pailX(s.clock);
    if (s.hasPail && !s.pailUsed && absInt((s.bX >> 8) - px) <= PAIL_REACH) {
      s.pailSaves += 1;
      s.pailUsed = 1;
      s.bOn = 0;
      s.bN = 0;
      s.bGold = 0;
      s.bKeep = 1;
      s.bPredStep = -1;
      s.bServeAt = onBeat(s.clock + PAIL_RESERVE);
      s.bServeTold = 1;
      if (s.fkOn && s.fkBall < 0) {
        s.fkBall = 1;
        forkResolve(s);
      }
      emit(s, EV_PAIL, px, 1, 0);
      return;
    }
    loseBall(s);
  }
}

export function startGull(s: SimState): void {
  'worklet';
  if (s.gSt !== 0) return;
  maybeCard(s, CARD_GULL);
  s.gSt = 1;
  s.gQ = 0;
  s.gX = s.bx;
  s.gEdge = (s.bx >> 8) < 200 ? FIELD_W + 30 : -30;
  s.gLen = s.gSeen ? GULL_TELL : GULL_TELL_FIRST;
  s.gSeen = 1;
  emit(s, EV_TELL, s.gX >> 8, 100, 0);
  emit(s, EV_GULL, 1, s.gX >> 8, s.gEdge);
}

function stepGull(s: SimState): void {
  'worklet';
  if (s.gSt === 0) return;
  s.gQ += s.holdTs;
  const t = s.gQ >> 8;
  if (s.gSt === 1 && t >= s.gLen) {
    s.gSt = 2;
    s.gQ = 0;
    emit(s, EV_GULL, 2, s.gX >> 8, s.gEdge);
  } else if (s.gSt === 2 && t >= GULL_DIVE) {
    const hit = absInt(s.bx - s.gX) <= GULL_REACH * SUB;
    if (hit && s.parked) {
      s.shields += 1;
      emit(s, EV_SHIELD, s.gX >> 8, 2, 0);
      emit(s, EV_GULL, 7, s.gX >> 8, 0);
    } else if (hit) {
      dropTier(s);
      emit(s, EV_GULL, 3, s.gX >> 8, 0);
    } else emit(s, EV_GULL, 4, s.gX >> 8, 0);
    s.gSt = 0;
  }
}

function stepTimers(s: SimState): void {
  'worklet';
  const h = s.holdTs;
  if (s.hitStopQ > 0) s.hitStopQ -= h;
  if (s.slowQ >= 0) {
    s.slowQ += h;
    if (s.slowQ >> 8 >= CLOSE_HOLD + CLOSE_EASE) s.slowQ = -1;
  }
  if (s.invulnQ > 0) s.invulnQ -= h;
}

function onClockStep(s: SimState): void {
  'worklet';
  const c = s.clock;
  const queue = s.mode === MODE_QUEUE;
  if (c === 1) {
    maybeCard(s, CARD_CATCH);
    if (s.mode === MODE_HEAT) maybeCard(s, CARD_HEAT);
  }
  if (c - s.setStart >= s.setLen) {
    if (!queue || s.set === QUEUE_SETS - 1) {
      if (s.finale !== 1) finish(s, END_TIME);
      return;
    }
    // Queue set break: clip Golden Hour (pips carry), keep the chain, forced freeze with a set card.
    endGolden(s);
    s.ghArmAt = -1;
    s.set += 1;
    s.setStart = c;
    s.setLen = SET_STEPS;
    s.gSt = 0;
    s.wind = -s.wind;
    s.cardPending = CARD_SET_BASE + s.set;
    s.holdTs = 0;
    s.fullRun = 0;
    s.parked = 0;
    s.queued = 0;
    emit(s, EV_SET, s.set, 0, 0);
    emit(s, EV_CARD, CARD_SET_BASE + s.set, 0, 0);
    s.dNext = c + STEPS_BEAT;
    if (s.set === 1 && s.hasGulls) s.gNext = c + STEPS_BAR;
    if (s.set === 2) s.gNext = 1 << 30;
  }
  const lt = c - s.setStart;
  const lastSet = !queue || s.set === QUEUE_SETS - 1;
  // Golden Hour: armed -> starts on the beat; 3-beat warning; clipped at Gold Rush / set end.
  if (s.ghArmAt >= 0 && c >= s.ghArmAt) startGolden(s);
  if (s.ghQ > 0) {
    if (c === s.ghEnd - GOLDEN_WARN) emit(s, EV_GOLDEN, 2, 0, 0);
    if (c >= s.ghEnd) endGolden(s);
  }
  if (c === s.rushAt - STEPS_BEAT) emit(s, EV_RUSH, 1, 0, 0);
  if (c === s.rushAt) {
    s.rushOn = 1;
    endGolden(s);
    s.ghArmAt = -1;
    // A live ball turns gold (full rules).
    if (s.full === 1 && s.bOn === 1 && s.bN > 0 && !s.bGold) {
      s.bGold = 1;
      s.goldBalls += 1;
      emit(s, EV_GOLD_BALL, s.bX >> 8, 1, 0);
    }
    emit(s, EV_RUSH, 2, 0, 0);
  }
  if (lastSet) {
    const left = s.setLen - lt;
    if (left <= 280 && left > 0 && left % STEPS_BEAT === 0) emit(s, EV_TICK, floorDiv(left + 59, 60), 0, 0);
  }
  // Re-serve (or the pail's kick) on the beat, with a 400 ms cart wobble tell.
  if (s.bOn === 0 && s.bServeAt >= 0) {
    if (!s.bServeTold && c >= s.bServeAt - RESERVE_TELL) {
      s.bServeTold = 1;
      s.bServeX = clampInt(s.bx >> 8, 80, 320);
      emit(s, EV_TELL, s.bServeX, 102, 0);
    }
    if (c >= s.bServeAt && !s.done) {
      if (s.bKeep) pailLaunch(s);
      else tossBall(s, s.bServeX);
    }
  }
  // Hanging prizes: reel up when they expire (on the beat).
  for (let h = 0; h < MAX_PRIZES; h++) {
    if (s.hSt[h] === S_HANG && c >= s.hEnd[h] && c % STEPS_BEAT === 0) {
      s.hSt[h] = S_REEL;
      s.hT[h] = 0;
      emit(s, EV_PRIZE, 3, h, s.hKind[h] | (s.hX[h] << 4));
    }
  }
  // Gull Set (queue set 2, unlock 2+): one gull every ~3 bars on the beat.
  if (queue && s.set === 1 && s.hasGulls && c >= s.gNext && c % STEPS_BEAT === 0 && s.gSt === 0 && s.ghQ === 0) {
    if (c < s.setStart + s.setLen - STEPS_BAR * 2) startGull(s);
    s.gNext = c + STEPS_BAR * GULL_GAP_BARS;
  }
  directorStep(s);
}

function stepItems(s: SimState, dt: number): void {
  'worklet';
  const laneSub = LANE_Y * SUB;
  const half = catchHalf(s);
  const queueLead = s.mode === MODE_QUEUE || s.mode === MODE_HEAT;
  const tellLead = queueLead ? PUFFER_TELL_QUEUE : PUFFER_TELL_RIDE;
  const magnetR = s.ghQ > 0 ? GOLDEN_MAGNET * SUB : 0;
  for (let i = 0; i < MAX_ITEMS; i++) {
    const st = s.iSt[i];
    if (st === S_FREE) continue;
    const kind = s.iKind[i];
    if (st === S_DUNK || st === S_POP || st === S_BONKED || st === S_EDGE) {
      s.iT[i] += dt;
      if (st === S_BONKED) {
        s.iVy[i] += floorDiv(90 * dt, 256);
        s.iY[i] += floorDiv(s.iVy[i] * dt, 256);
        s.iX[i] += floorDiv(s.iVx[i] * dt, 256);
      }
      const life = st === S_DUNK ? 6 : st === S_POP ? 12 : 40;
      if (s.iT[i] >= life * 256) s.iSt[i] = S_FREE;
      continue;
    }
    // Falling (S_FALL, S_MISS, S_PASS): integrate with world dt.
    const py = s.iY[i];
    const px = s.iX[i];
    s.iAge[i] += dt;
    s.iVy[i] += floorDiv(s.iG[i] * dt, 256);
    s.iY[i] += floorDiv(s.iVy[i] * dt, 256);
    let vx = s.iVx[i];
    if (st === S_FALL && magnetR > 0 && kind !== K_PUFFER && s.iY[i] > 280 * SUB) {
      const dx = s.bx - s.iX[i];
      if (absInt(dx) <= magnetR) vx += signInt(dx) * (absInt(dx) < 3 * SUB ? absInt(dx) : 3 * SUB);
    }
    s.iX[i] = clampInt(s.iX[i] + floorDiv(vx * dt, 256), 24 * SUB, (FIELD_W - 24) * SUB);
    if (st === S_FALL && kind === K_PUFFER) {
      // Two-step puff at 30% and 60% of the fall; tell at a fixed lead.
      const ageSteps = s.iAge[i] >> 8;
      const land = s.iLand[i];
      if (s.iPuff[i] === 0 && ageSteps * 10 >= land * 3) {
        s.iPuff[i] = 1;
        emit(s, EV_PUFF, s.iX[i] >> 8, 1, i);
      } else if (s.iPuff[i] === 1 && ageSteps * 10 >= land * 6) {
        s.iPuff[i] = 2;
        emit(s, EV_PUFF, s.iX[i] >> 8, 2, i);
      }
      if (!s.iTold[i] && ageSteps >= land - tellLead) {
        s.iTold[i] = 1;
        emit(s, EV_TELL, s.iX[i] >> 8, K_PUFFER, i);
      }
    }
    if (st === S_FALL && s.finale === 0 && s.iFlag[i] === 1 && laneSub - s.iY[i] <= FINALE_NEAR * SUB) {
      s.finale = 1;
      emit(s, EV_FINALE, s.iX[i] >> 8, 0, i);
    }
    if (st === S_FALL && py < laneSub && s.iY[i] >= laneSub) {
      // Swept crossing: x at the lane, interpolated (no tunnelling).
      const xc = px + floorDiv((s.iX[i] - px) * (laneSub - py), s.iY[i] - py);
      resolveCrossing(s, i, xc, half);
      continue;
    }
    if ((st === S_MISS || st === S_PASS) && s.iY[i] >= PLAZA_Y * SUB) {
      if (st === S_MISS) emit(s, EV_SPLAT, s.iX[i] >> 8, kind, 0);
      s.iSt[i] = S_FREE;
      continue;
    }
    if (s.iY[i] > (PLAZA_Y + 80) * SUB) s.iSt[i] = S_FREE;
  }
  // Popped and reeled prizes clear after their animation.
  for (let h = 0; h < MAX_PRIZES; h++) {
    if (s.hSt[h] === S_POP || s.hSt[h] === S_REEL) {
      s.hT[h] += dt;
      if (s.hT[h] >= 18 * 256) s.hSt[h] = S_FREE;
    }
  }
}

/**
 * Freeze Lock (3.2, ranked runs). A lift with fullRun >= 30 starts the
 * ramp-down at once. A lift inside the lock parks the basket, keeps the world
 * running at full speed (shielded) and queues the freeze until the lock
 * expires. A touch while parked cancels the queue and resumes control.
 * Returns the effective thumb for the time ramp.
 */
function freezeLock(s: SimState, touch: number, prev: number): number {
  'worklet';
  if (!s.ranked) return touch;
  if (touch) {
    if (s.parked) {
      s.parked = 0;
      s.queued = 0;
      emit(s, EV_PARK, 3, s.bx >> 8, 0);
    }
    return 1;
  }
  if (prev && !s.parked && s.holdTs > 0 && s.fullRun < LOCK_STEPS) {
    s.parked = 1;
    s.queued = 1;
    emit(s, EV_PARK, 1, s.bx >> 8, LOCK_STEPS - s.fullRun);
  }
  if (s.parked && s.queued) {
    if (s.fullRun >= LOCK_STEPS) {
      s.queued = 0;
      emit(s, EV_PARK, 2, s.bx >> 8, 0);
      return 0;
    }
    return 1;
  }
  return 0;
}

/**
 * Advance one logged step. `touch` is 0/1, `targetQ4` the basket target in
 * 1/16 fu (already clamped by the input layer; clamped again here). `autoRun`
 * is v2.1 live duels only and must be 0 otherwise.
 */
export function step(s: SimState, touch: number, targetQ4: number, autoRun = 0): void {
  'worklet';
  s.evN = 0;
  if (s.done) return;
  s.log.push(targetQ4 * 4 + (autoRun ? 2 : 0) + (touch ? 1 : 0));
  s.steps += 1;
  if (s.cardPending) s.cardPending = 0;
  const prev = s.touch;
  s.touch = touch ? 1 : 0;
  const eff = freezeLock(s, s.touch, prev);
  // A parked basket stays where it is (no drag input).
  if (!s.parked) s.btx = clampInt(targetQ4 * 16, BASKET_MIN * SUB, BASKET_MAX * SUB);
  else s.btx = s.bx;
  s.holdTs = nextHoldTs(s.holdTs, eff);
  s.fullRun = s.holdTs === 256 ? s.fullRun + 1 : 0;
  if (s.holdTs <= 0) {
    s.parked = 0;
    s.queued = 0;
    return;
  }
  s.fxTs = computeFxTs(s);
  const dt = floorDiv(s.holdTs * s.fxTs, 256);
  const before = s.clock;
  s.clockQ += s.finale === 1 ? dt : s.holdTs;
  s.clock = s.clockQ >> 8;
  for (let c = before + 1; c <= s.clock && !s.done && !s.cardPending; c++) {
    if (ballIsLive(s)) s.ballLive += 1;
    onClockStep(s);
    spawnPending(s);
    if (s.tossReq > 0) {
      const x = s.tossReq - 1;
      s.tossReq = 0;
      tossBall(s, x);
    }
  }
  if (s.cardPending || s.done) return;
  moveBasket(s);
  stepItems(s, dt);
  stepBall(s, dt);
  stepGull(s);
  stepTimers(s);
  if (s.finale === 2 && !s.done && s.clock - s.setStart >= s.setLen) finish(s, END_TIME);
}

export function finalScore(s: SimState): number {
  'worklet';
  return s.score + s.bonus;
}

/** BALL SHARE (5.3, results only): POP + BONK points plus the x3/x4 uplift, as a percentage. */
export function ballShare(s: SimState): number {
  'worklet';
  const total = finalScore(s);
  if (total <= 0) return 0;
  return floorDiv((s.popPts + s.uplift) * 100, total);
}

/** Run a full proof log (the replay). Log entries are q4 * 4 + autoRun * 2 + touch. */
export function replay(cfg: SimConfig, log: readonly number[]): SimState {
  const s = createSim(cfg);
  for (let i = 0; i < log.length && !s.done; i++) {
    const v = log[i];
    step(s, v & 1, v >> 2, (v >> 1) & 1);
  }
  return s;
}

/** True when the caller should stop stepping (frozen with no thumb). */
export function isFrozen(s: SimState, touch: number): boolean {
  'worklet';
  return !touch && s.holdTs === 0;
}

/** Star targets [1, 2, 3, crown] for a mode, ruleset and difficulty (crown 0 = none). */
export function starTargets(mode: number, difficulty: number, rules = 1): [number, number, number, number] {
  const d = difficulty < 1 ? 1 : difficulty > 3 ? 3 : difficulty;
  const row = STARS_RIDE[d];
  if (mode === MODE_QUEUE || mode === MODE_HEAT) {
    const q = (v: number) => floorDiv(v * QUEUE_STAR_Q8, 256);
    return [q(row[0]), q(row[1]), q(row[2]), q(row[3])];
  }
  if (rules === R_INTRO) {
    return [row[0], floorDiv(row[1] * INTRO_TWO_Q8, 256), floorDiv(row[2] * INTRO_THREE_Q8, 256), 0];
  }
  return [row[0], row[1], row[2], row[3]];
}

export function starsFor(score: number, t: readonly number[]): number {
  return score >= t[2] ? 3 : score >= t[1] ? 2 : score >= t[0] ? 1 : 0;
}

export function crownFor(score: number, t: readonly number[]): boolean {
  return t.length > 3 && t[3] > 0 && score >= t[3];
}
export { pailX, zoneVx, ballMove, ballG, ballVy, windAccel, EV_CARD };
export { BASKET_MAX, BASKET_MIN, K_BUNCH, K_LUCKY, S_EDGE, S_HANG };
