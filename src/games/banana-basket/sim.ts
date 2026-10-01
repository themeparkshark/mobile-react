/**
 * Banana Basket v2: the deterministic sim (design rev 5, "the ball is the key").
 *
 * Pure, integer-only and worklet-safe. The same code runs on the UI thread
 * (useGameClock onStep), in node tests, in the bots, in ghost playback and
 * (ported 1:1) in the server replay. Positions and velocities are sub-units
 * (1/256 fu), time is 60 Hz steps, timescales are q8 (256 = 1.0).
 *
 * Thumb-driven time: holdTs follows the thumb (RAMP_UP / RAMP_DOWN). The round
 * clock advances by holdTs only, so lifting the thumb freezes the park and
 * never burns time. The caller stops calling step() once holdTs is 0 with no
 * touch, so a 10 minute freeze adds 0 bytes to the input log.
 *
 * Gameplay uses only + - * floorDiv, abs, min, max and table lookups.
 */

import {
  ACC_SUB, ASSIST_ZONE, BALL_GOLD_AT, BALL_R, BALL_GRACE_UNTIL, BALL_RESPAWN, BALL_RESPAWN_GRACE, BALL_SURFACE, BALL_WALL_Q8, BASKET_MAX,
  BASKET_MIN, BONK_BASE, CAP_SUB, CARD_BALL, CARD_BEACH, CARD_BREEZY, CARD_FINGER, CARD_GOLDEN, CARD_GULLS, CARD_PUFFER,
  CARD_RIM, CARD_SET_BASE, CARD_SPLASH, CHAIN_FREEZE_STEPS, CLEAN_SWEEP, CLOSE_CALL_BAND, CLOSE_EASE, CLOSE_HOLD,
  CLOSE_PTS, CLOSE_TS, EVENT_GOLDEN, EVENT_RUSH, FIELD_W, FINALE_NEAR, FINALE_TS, FINGER_RANGE, FINGER_STEPS, FREE_SUB,
  G_GOLD_POP, G_GOOD, G_GREAT, G_PERFECT, G_POP, GOLD_BOUNCE_PTS, GOLDEN_BANK, GOLDEN_COIN_EXT, GOLDEN_EXT_MAX,
  GOLDEN_STEPS, GOLDEN_WARN, GOLDEN_ZONE_Q8, GRAZE_PTS, GRAZE_WINDOW, GREAT_D, GULL_REACH, GULL_TELL,
  GULL_TELL_FIRST, HALF_ZONE, HEART_PTS, HITSTOP_GOLDEN, HITSTOP_PUFFER, HITSTOP_TIME, INVULN_STEPS, ITEM_BASE,
  ITEM_SIZE, K_BANANA, K_BUNCH, K_COIN, K_FINGER, K_GIFT, K_LUCKY, K_PUFFER, K_WATCH, LANE_Y, METER_PIPS, MQ_CAP, MULTI_PTS, MULTI_WINDOW,
  PERFECT_D, PERFECT_STREAK_PTS, PLAZA_Y, PUFFER_TELL_QUEUE, PUFFER_TELL_RIDE, QUEUE_SETS, QUEUE_STAR_Q8,
  RIM_ROLL_BAND, RIM_ROLL_STEPS, S_BONKED, S_DUNK, S_FALL, S_FREE, S_MISS, S_PASS, S_POP, S_RIM, SAVE_PTS, SET_STEPS,
  SPARE_POWER_PTS, SPAWN_Y, SPLASH_HALF, SPLASH_TELL, STARS_RIDE, STEPS_BAR, STEPS_BEAT, SUB, TIER_AT, TWIST_BEACH,
  TWIST_BREEZY, TWIST_GULLS, TWIST_NONE, TWIST_SPLASH, WATCH_MAX, WATCH_STEPS,
} from './constants';
import { absInt, clampInt, floorDiv, rngRange, signInt } from './fixed';
import { ballIsLive, gatedTier } from './state';
import { G_BALL, RAMP_DOWN, RAMP_UP, VX_GAIN, VY_BALL } from './tables';
import { directorStep, predictBall, travelOf } from './patterns';
import {
  EV_BALL_LOST, EV_BALL_POP, EV_BALL_TOSS, EV_BANK, EV_BONK, EV_BOUNCE, EV_BREAK, EV_CARD, EV_CATCH, EV_CLOSE, EV_COIN,
  EV_DOWNWELL, EV_FINALE, EV_GOLD_BALL, EV_GOLDEN, EV_GRAZE, EV_GULL, EV_GATE, EV_HEARTS_OUT, EV_HIT, EV_MULTI, EV_MISS, EV_POWER, EV_PUFF,
  EV_RIM, EV_RUSH, EV_SAVE, EV_SET, EV_SPAWN, EV_SPLASH, EV_SPLAT, EV_TELL, EV_TICK, EV_TIER, EV_TIME, END_HEARTS,
  END_TIME, MAX_ITEMS, MODE_QUEUE, MODE_RIDE, createSim, emit, freeSlot, maybeCard, queueRaw, tierOf,
  type SimConfig, type SimState,
} from './state';

export * from './state';

// -- time ---------------------------------------------------------------------

// -- basket ---------------------------------------------------------------------

// -- chain, meter, golden hour ---------------------------------------------------------

// -- items ------------------------------------------------------------------------------

// -- juggle ball -------------------------------------------------------------------------


// -- gull and splash ----------------------------------------------------------------------

// -- timers and end ----------------------------------------------------------------------

// -- the clock-step timeline (sets, rush, ticks) -------------------------------------------

// -- the step ------------------------------------------------------------------------------

/** 1 when the ball gate is holding the tier at x2 (chain 12+ without a live ball). */
export function gateHeld(s: SimState): number {
  'worklet';
  return tierOf(s.chain) > 2 && !ballIsLive(s) ? 1 : 0;
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

export function catchZone(s: SimState): number {
  'worklet';
  let z = HALF_ZONE * SUB;
  if (s.ghQ > 0) z = floorDiv(z * GOLDEN_ZONE_Q8, 256);
  if (s.assist) z = floorDiv(z * 5, 4);
  return z;
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
    return CLOSE_TS + floorDiv((256 - CLOSE_TS) * k, CLOSE_EASE);
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
  if (!force && s.clock - s.lastStop < 15) return false;
  s.lastStop = s.clock;
  const q = steps * 256;
  if (q > s.hitStopQ) s.hitStopQ = q;
  return true;
}

export function moveBasket(s: SimState): void {
  'worklet';
  const h = s.holdTs;
  if (h <= 0) return;
  const cap = floorDiv(CAP_SUB * h, 256);
  const acc = floorDiv(ACC_SUB * h, 256);
  const free = floorDiv(FREE_SUB * h, 256);
  const d = s.btx - s.bx;
  if (d === 0) {
    s.bv = 0;
    return;
  }
  const dir = signInt(d);
  const carried = signInt(s.bv) === dir ? absInt(s.bv) : 0;
  let allowed = carried + acc;
  if (allowed < free) allowed = free;
  if (allowed > cap) allowed = cap;
  if (absInt(d) <= allowed) {
    s.bv = d;
    s.bx = s.btx;
  } else {
    s.bv = dir * allowed;
    s.bx += s.bv;
  }
}

function addChain(s: SimState): void {
  'worklet';
  if (s.chainFreezeQ > 0) return;
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

/** The step Golden Hour (and its extensions) must end by: Final Rush or the set end. */
function goldenLimit(s: SimState): number {
  'worklet';
  const setEnd = s.setStart + s.setLen;
  return s.rushAt < setEnd ? s.rushAt : setEnd;
}

function addPip(s: SimState, x: number): void {
  'worklet';
  if (s.ghQ > 0) return;
  s.meter += 1;
  if (s.meter < METER_PIPS) return;
  s.meter = 0;
  s.bPip = 0;
  if (s.clock + GOLDEN_STEPS <= goldenLimit(s) && !s.rushOn) {
    s.ghQ = GOLDEN_STEPS * 256;
    s.ghExt = 0;
    s.fevers += 1;
    hitStop(s, HITSTOP_GOLDEN, 0);
    emit(s, EV_GOLDEN, 1, x, 0);
    maybeCard(s, CARD_GOLDEN);
  } else {
    s.banked += 1;
    emit(s, EV_BANK, s.banked, x, 0);
  }
}

function perfectBreak(s: SimState): void {
  'worklet';
  s.perfStreak = 0;
}

function collectPower(s: SimState, kind: number, xf: number): void {
  'worklet';
  if (kind === K_GIFT) {
    // Deterministic by chain tier: x1-x2 a coin shower, x3+ a Foam Finger.
    if (tierOf(s.chain) <= 2) {
      emit(s, EV_POWER, K_GIFT, 0, xf);
      for (let k = 0; k < 8; k++) {
        const x = clampInt(xf - 140 + k * 40, BASKET_MIN + 10, BASKET_MAX - 10);
        queueRaw(s, s.clock + 4 + k * 7, K_COIN, x * SUB, 0, 0, 22, 0, 0);
      }
      return;
    }
    kind = K_FINGER;
  }
  if (s.fingerQ > 0) {
    s.score += SPARE_POWER_PTS;
    emit(s, EV_POWER, kind, 2, xf);
    return;
  }
  if (kind === K_FINGER) {
    s.fingerQ = FINGER_STEPS * 256;
    emit(s, EV_POWER, K_FINGER, 1, xf);
    maybeCard(s, CARD_FINGER);
  } else if (kind === K_WATCH) {
    if (s.watchUsed >= WATCH_MAX) {
      s.score += SPARE_POWER_PTS;
      emit(s, EV_POWER, K_WATCH, 2, xf);
      return;
    }
    s.watchUsed += 1;
    s.setLen += WATCH_STEPS;
    s.total += WATCH_STEPS;
    emit(s, EV_POWER, K_WATCH, 1, xf);
  }
}

/**
 * The ball term: a must-catch item whose landing the ball's next landing makes
 * unreachable (both within 24 steps and too far apart to take both) becomes
 * optional, so juggling never forces a chain break.
 */
function demoteIfBallConflict(s: SimState, i: number): void {
  'worklet';
  if (s.bPredStep < 0 || s.iOpt[i] === 1) return;
  const dtS = absInt(s.iLandStep[i] - s.bPredStep);
  if (dtS > 24) return;
  const need = absInt((s.iX[i] - s.bPredX) >> 8) - 40;
  if (need > 0 && dtS < travelOf(need)) s.iOpt[i] = 1;
}

/** Fruit Ninja combo: catches within 18 steps: DOUBLE +25, TRIPLE +75, QUAD +150 (flat totals). */
function multiCatch(s: SimState, xf: number): void {
  'worklet';
  if (s.clock - s.mcLast <= MULTI_WINDOW) s.mcN += 1;
  else s.mcN = 1;
  s.mcLast = s.clock;
  if (s.mcN < 2) return;
  const n = s.mcN < 4 ? s.mcN : 4;
  const prev = s.mcN - 1 < 4 ? MULTI_PTS[s.mcN - 1] : MULTI_PTS[4];
  const pts = MULTI_PTS[n] - (s.mcN > 4 ? MULTI_PTS[4] : prev);
  if (s.mcN === 2) s.multi += 1;
  if (pts <= 0) return;
  s.score += pts;
  emit(s, EV_MULTI, xf, n, pts);
}

function collect(s: SimState, i: number, xc: number, grade: number, popped: number): void {
  'worklet';
  const kind = s.iKind[i];
  const xf = xc >> 8;
  if (kind === K_FINGER || kind === K_WATCH || kind === K_GIFT) {
    collectPower(s, kind, xf);
    addChain(s);
    s.catches += 1;
    return;
  }
  let base = ITEM_BASE[kind];
  if (kind === K_LUCKY && grade >= G_PERFECT) base = base * 5;
  const t = gatedTier(s);
  const pts = scorePoints(base, t, grade, eventQuarters(s));
  s.score += pts;
  s.catches += 1;
  if (!popped) multiCatch(s, xf);
  if (grade === G_PERFECT) {
    s.perfects += 1;
    s.perfStreak += 1;
    if (s.perfStreak > s.bestPerfStreak) s.bestPerfStreak = s.perfStreak;
  } else if (grade < G_PERFECT) {
    perfectBreak(s);
    if (grade === G_GREAT) s.greats += 1;
  }
  if (popped) s.pops += 1;
  addChain(s);
  emit(s, EV_CATCH, xf, kind | (grade << 4) | (gatedTier(s) << 8) | (gateHeld(s) << 12), pts + s.chain * 65536);
  if (kind === K_COIN) {
    if (s.ghQ > 0) {
      const room = goldenLimit(s) - s.clock - (s.ghQ >> 8);
      let ext = GOLDEN_COIN_EXT;
      if (s.ghExt + ext > GOLDEN_EXT_MAX) ext = GOLDEN_EXT_MAX - s.ghExt;
      if (ext > room) ext = room;
      if (ext > 0) {
        s.ghExt += ext;
        s.ghQ += ext * 256;
      }
    }
    // A coin while gulls are queued cancels one (BLOCKED!).
    if (s.gSt === 0 && s.gullIn.length >= 2 && s.gullIn[0] <= s.clock) {
      const recv = s.gullIn.shift() as number;
      const apply = s.gullIn.shift() as number;
      s.gullLog.push(recv, apply, s.clock, 1);
      emit(s, EV_GULL, 5, xf, recv);
    }
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
        s.iOpt[i] = 0;
        s.iPuff[i] = 0;
        s.iTold[i] = 0;
        s.iT[i] = 0;
        s.iSide[i] = 0;
        s.iFlag[i] = s.pFlag[r];
        s.idc += 1;
        s.iId[i] = s.idc;
        if (s.pFlag[r] === 1) s.finaleSlot = i;
        else if (s.iMust[i] === 1 && s.bOn === 1) demoteIfBallConflict(s, i);
        emit(s, EV_SPAWN, s.pX[r] >> 8, s.pKind[r], i);
        if (s.pKind[r] === K_PUFFER) maybeCard(s, CARD_PUFFER);
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

/** Tally bonuses (deterministic; part of the verified score). */
export function endBonus(s: SimState): number {
  'worklet';
  let b = 0;
  if (s.misses === 0 && s.catches > 0) b += CLEAN_SWEEP;
  b += s.bestPerfStreak * PERFECT_STREAK_PTS;
  if (s.endReason !== END_HEARTS) b += s.hearts * HEART_PTS;
  b += s.banked * GOLDEN_BANK;
  // Sugar Crush: a live ball does one victory bounce at its current value.
  if (s.endReason !== END_HEARTS && ballIsLive(s)) b += s.bGold ? GOLD_BOUNCE_PTS : s.bN * 5 < 40 ? s.bN * 5 : 40;
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

function resolveCrossing(s: SimState, i: number, xc: number, zone: number): void {
  'worklet';
  const kind = s.iKind[i];
  const d = absInt(xc - s.bx);
  if (kind === K_PUFFER) {
    s.iSt[i] = S_PASS;
    const hz = HALF_ZONE * SUB;
    if (d <= hz && s.invulnQ <= 0) {
      s.hearts -= 1;
      s.invulnQ = INVULN_STEPS * 256;
      hitStop(s, HITSTOP_PUFFER, 0);
      perfectBreak(s);
      emit(s, EV_HIT, xc >> 8, s.hearts, i);
      if (s.hearts <= 0) {
        emit(s, EV_HEARTS_OUT, 0, 0, 0);
        finish(s, END_HEARTS);
      }
    } else if (d > hz && d <= hz + CLOSE_CALL_BAND * SUB) {
      s.score += CLOSE_PTS;
      s.slowQ = 0;
      emit(s, EV_CLOSE, xc >> 8, CLOSE_PTS, 0);
      if (s.clock - s.closeA <= GRAZE_WINDOW) {
        s.score += GRAZE_PTS;
        s.grazes += 1;
        s.closeA = -100000;
        s.closeB = -100000;
        emit(s, EV_GRAZE, xc >> 8, GRAZE_PTS, 0);
      } else {
        s.closeA = s.closeB;
        s.closeB = s.clock;
      }
    }
    return;
  }
  // Assist: 6 fu extra on the side the basket is moving toward.
  let z = zone;
  if (s.bv !== 0 && signInt(xc - s.bx) === signInt(s.bv)) z += ASSIST_ZONE * SUB;
  if (d <= z) {
    const grade = d <= PERFECT_D * SUB ? G_PERFECT : d <= GREAT_D * SUB ? G_GREAT : G_GOOD;
    s.iSt[i] = S_DUNK;
    s.iT[i] = 0;
    s.iX[i] = xc;
    collect(s, i, xc, grade, 0);
    endFinale(s, i);
    return;
  }
  if (d <= z + RIM_ROLL_BAND * SUB) {
    s.iSt[i] = S_RIM;
    s.iT[i] = 0;
    s.iX[i] = xc;
    s.iY[i] = LANE_Y * SUB;
    s.iSide[i] = signInt(xc - s.bx);
    emit(s, EV_RIM, xc >> 8, kind, s.iSide[i]);
    maybeCard(s, CARD_RIM);
    endFinale(s, i);
    return;
  }
  s.iSt[i] = S_MISS;
  const must = s.iMust[i] === 1 && s.iOpt[i] === 0 && (kind === K_BANANA || kind === K_BUNCH || kind === K_LUCKY);
  if (must) {
    s.misses += 1;
    perfectBreak(s);
    breakChain(s);
  }
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
  s.bG = G_BALL[0];
  s.bN = 0;
  s.bGold = 0;
  s.bRespawnQ = -1;
  predictBall(s);
  emit(s, EV_BALL_TOSS, xFu, 0, 0);
  maybeCard(s, CARD_BALL);
}

function bounce(s: SimState, dx: number): void {
  'worklet';
  s.bN += 1;
  s.bRun += 1;
  s.bounces += 1;
  const n = s.bN < 12 ? s.bN : 12;
  s.bY = (LANE_Y - BALL_R) * SUB;
  s.bVy = VY_BALL[n];
  s.bG = G_BALL[n];
  s.bVx = floorDiv(dx * VX_GAIN[n], HALF_ZONE * SUB) + floorDiv(s.bv, 4);
  updateGate(s, 2);
  if (s.bN === BALL_GOLD_AT) {
    s.bGold = 1;
    s.goldBalls += 1;
    emit(s, EV_GOLD_BALL, s.bX >> 8, 0, 0);
  }
  let pts = s.bN * 5 < 40 ? s.bN * 5 : 40;
  if (s.bGold) pts = GOLD_BOUNCE_PTS;
  if (s.twist === TWIST_BEACH && s.set === 1) pts = pts * 2;
  s.score += pts;
  emit(s, EV_BOUNCE, s.bX >> 8, s.bN, s.bGold | (pts << 1));
  // Downwell: every 5th consecutive bounce fills one pip, once per meter cycle.
  if (s.bN % 5 === 0 && s.bPip === 0 && s.ghQ <= 0) {
    s.bPip = 1;
    emit(s, EV_DOWNWELL, s.bX >> 8, s.meter + 1, 0);
    addPip(s, s.bX >> 8);
  }
  predictBall(s);
  // Demote in-flight must-catch items the new arc makes unreachable.
  for (let i = 0; i < MAX_ITEMS; i++) {
    if (s.iSt[i] === S_FALL && s.iMust[i] === 1) demoteIfBallConflict(s, i);
  }
}

function stepBall(s: SimState, dt: number): void {
  'worklet';
  if (s.bOn !== 1) {
    if (s.bRespawnQ >= 0) {
      s.bRespawnQ -= s.holdTs;
      if (s.bRespawnQ <= 0 && !s.done) {
        s.bRespawnQ = -1;
        tossBall(s, clampInt(s.dLastX, 80, 320));
      }
    }
    return;
  }
  const py = s.bY;
  s.bVy += floorDiv(s.bG * dt, 256);
  s.bY += floorDiv(s.bVy * dt, 256);
  s.bX += floorDiv(s.bVx * dt, 256);
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
    if (absInt(dx) <= (HALF_ZONE + 14) * SUB) {
      bounce(s, dx);
      return;
    }
  }
  // Ball Pop and BONK against falling items.
  for (let i = 0; i < MAX_ITEMS; i++) {
    if (s.iSt[i] !== S_FALL || s.iFlag[i] === 1) continue;
    const kind = s.iKind[i];
    const r = BALL_R + (ITEM_SIZE[kind] >> 1) - 6;
    const dx = (s.iX[i] - s.bX) >> 8;
    const dy = (s.iY[i] - s.bY) >> 8;
    if (dx * dx + dy * dy > r * r) continue;
    if (s.iY[i] > (LANE_Y - 30) * SUB) continue;
    const t = gatedTier(s);
    if (kind === K_PUFFER) {
      const pts = scorePoints(BONK_BASE, t, G_POP, eventQuarters(s));
      s.score += pts;
      s.bonks += 1;
      s.iSt[i] = S_BONKED;
      s.iT[i] = 0;
      s.iVy[i] = -1620;
      s.iVx[i] = signInt(s.iX[i] - s.bX) * 1024 + (s.iX[i] >= s.bX ? 256 : -256);
      emit(s, EV_BONK, s.iX[i] >> 8, pts, i);
      continue;
    }
    s.iSt[i] = S_POP;
    s.iT[i] = 0;
    collect(s, i, s.iX[i], s.bGold ? G_GOLD_POP : G_POP, 1);
    emit(s, EV_BALL_POP, s.iX[i] >> 8, kind, i);
    endFinale(s, i);
  }
  if (s.bY > (LANE_Y + 70) * SUB) {
    s.bOn = 0;
    s.bN = 0;
    s.bGold = 0;
    s.bPredStep = -1;
    // Tutorial grace: a ball lost before clock 10 s comes back in 2 s.
    s.bRespawnQ = (s.clock < BALL_GRACE_UNTIL ? BALL_RESPAWN_GRACE : BALL_RESPAWN) * 256;
    emit(s, EV_BALL_LOST, s.bX >> 8, 0, 0);
    updateGate(s, 2);
  }
}

function stepHazards(s: SimState): void {
  'worklet';
  if (s.gSt > 0) {
    s.gQ += s.holdTs;
    const t = s.gQ >> 8;
    if (s.gSt === 1 && t >= s.gLen) {
      s.gSt = 2;
      s.gQ = 0;
      emit(s, EV_GULL, 2, s.gX >> 8, s.gSent);
    } else if (s.gSt === 2 && t >= 8) {
      const hit = absInt(s.bx - s.gX) <= GULL_REACH * SUB;
      if (hit) {
        dropTier(s);
        perfectBreak(s);
      }
      emit(s, EV_GULL, hit ? 3 : 4, s.gX >> 8, s.gSent);
      s.gSt = 0;
    }
  }
  if (s.sSt > 0) {
    s.sQ += s.holdTs;
    if (s.sSt === 1 && s.sQ >> 8 >= SPLASH_TELL) {
      const hit = absInt(s.bx - s.sX) <= (SPLASH_HALF + 20) * SUB;
      if (hit) s.chainFreezeQ = CHAIN_FREEZE_STEPS * 256;
      emit(s, EV_SPLASH, hit ? 2 : 3, s.sX >> 8, 0);
      s.sSt = 0;
    }
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
  if (s.chainFreezeQ > 0) s.chainFreezeQ -= h;
  if (s.fingerQ > 0) s.fingerQ -= h;
  if (s.ghQ > 0) {
    const before = s.ghQ >> 8;
    s.ghQ -= h;
    const after = s.ghQ > 0 ? s.ghQ >> 8 : 0;
    if (before > GOLDEN_WARN && after <= GOLDEN_WARN) emit(s, EV_GOLDEN, 2, 0, 0);
    if (s.ghQ <= 0) {
      s.ghQ = 0;
      emit(s, EV_GOLDEN, 3, 0, 0);
    }
  }
}

export function startGull(s: SimState, sent: number): void {
  'worklet';
  if (s.gSt !== 0) return;
  s.gSt = 1;
  s.gQ = 0;
  s.gX = s.bx;
  s.gLen = s.gSeen ? GULL_TELL : GULL_TELL_FIRST;
  s.gSeen = 1;
  s.gSent = sent;
  emit(s, EV_TELL, s.gX >> 8, 100, 0);
  emit(s, EV_GULL, 1, s.gX >> 8, sent);
}

export function startSplash(s: SimState, xFu: number): void {
  'worklet';
  if (s.sSt !== 0) return;
  s.sSt = 1;
  s.sQ = 0;
  s.sX = xFu * SUB;
  emit(s, EV_TELL, xFu, 101, 0);
  emit(s, EV_SPLASH, 1, xFu, 0);
}

/** Twist cards show at the start of set 2 (right after the set card). */
function maybeCardLater(s: SimState, card: number): void {
  'worklet';
  if ((s.cardsSeen & card) !== 0) return;
  s.cardsSeen |= card;
  emit(s, EV_CARD, card, 0, 0);
}

function onClockStep(s: SimState): void {
  'worklet';
  const c = s.clock;
  const lt = c - s.setStart;
  const lastSet = s.mode === MODE_RIDE || s.set === QUEUE_SETS - 1;
  if (lt >= s.setLen) {
    if (lastSet) {
      if (s.finale !== 1) finish(s, END_TIME);
      return;
    }
    // Queue set break: bank the set, keep the chain, forced freeze with a set card.
    s.set += 1;
    s.setStart = c;
    s.setLen = SET_STEPS;
    s.rushOn = 0;
    s.gSt = 0;
    s.sSt = 0;
    if (s.set === QUEUE_SETS - 1) s.rushAt = c + 600;
    s.cardPending = CARD_SET_BASE + s.set;
    s.holdTs = 0;
    emit(s, EV_SET, s.set, 0, 0);
    emit(s, EV_CARD, CARD_SET_BASE + s.set, 0, 0);
    s.dNext = c + STEPS_BEAT;
    if (s.set === 1 && s.twist !== TWIST_NONE) {
      if (s.twist === TWIST_GULLS) {
        s.gNext = c + STEPS_BAR;
        s.pufferOn = 0;
        maybeCardLater(s, CARD_GULLS);
      } else if (s.twist === TWIST_SPLASH) {
        s.sNext = c + STEPS_BAR;
        maybeCardLater(s, CARD_SPLASH);
      } else if (s.twist === TWIST_BREEZY) maybeCardLater(s, CARD_BREEZY);
      else if (s.twist === TWIST_BEACH) maybeCardLater(s, CARD_BEACH);
    }
    if (s.set === 2) {
      s.pufferOn = 1;
      s.gNext = 1 << 30;
      s.sNext = 1 << 30;
    }
    return;
  }
  if (c === s.rushAt - STEPS_BEAT) emit(s, EV_RUSH, 1, 0, 0);
  if (c === s.rushAt) {
    s.rushOn = 1;
    emit(s, EV_RUSH, 2, 0, 0);
  }
  if (lastSet) {
    const left = s.setLen - lt;
    if (left <= 300 && left > 0 && left % STEPS_BEAT === 0) emit(s, EV_TICK, floorDiv(left + 59, 60), 0, 0);
  }
  // Twists (set 2 in the queue).
  if (s.mode === MODE_QUEUE && s.set === 1) {
    if (c >= s.gNext && s.twist === TWIST_GULLS) {
      startGull(s, -1);
      s.gNext = c + STEPS_BAR * 3 + (rngRange(s.rng, 0, 1) * STEPS_BAR);
    }
    if (c >= s.sNext && s.twist === TWIST_SPLASH) {
      startSplash(s, rngRange(s.rng, 90, 310));
      s.sNext = c + STEPS_BAR * 2 + (rngRange(s.rng, 0, 1) * STEPS_BAR);
    }
    if (s.twist === TWIST_BREEZY && lt % (STEPS_BAR * 4) === 0) s.wind = -s.wind;
  }
  // Gull Send: pairs [receivedAt, applyAt] (applyAt >= sender step + 90); lands on a beat.
  if (s.gullIn.length >= 2 && s.gSt === 0 && lt % STEPS_BEAT === 0 && c >= s.gullIn[0] && c >= s.gullIn[1]) {
    const recv = s.gullIn.shift() as number;
    const apply = s.gullIn.shift() as number;
    s.gullLog.push(recv, apply, c, 0);
    startGull(s, recv);
  }
  directorStep(s);
}

function stepItems(s: SimState, dt: number): void {
  'worklet';
  const laneSub = LANE_Y * SUB;
  const zone = catchZone(s);
  const tellLead = s.mode === MODE_QUEUE ? PUFFER_TELL_QUEUE : PUFFER_TELL_RIDE;
  const magnetR = s.fingerQ > 0 ? FINGER_RANGE * SUB : s.ghQ > 0 ? 60 * SUB : 0;
  for (let i = 0; i < MAX_ITEMS; i++) {
    const st = s.iSt[i];
    if (st === S_FREE) continue;
    const kind = s.iKind[i];
    if (st === S_DUNK || st === S_POP || st === S_BONKED) {
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
    if (st === S_RIM) {
      // Rim Roll: holdTs-driven 8 step roll, a nudge toward it is a SAVE.
      s.iT[i] += s.holdTs;
      const d = absInt(s.iX[i] - s.bx);
      if (d <= zone - 8 * SUB) {
        s.iSt[i] = S_DUNK;
        s.iT[i] = 0;
        s.saves += 1;
        s.score += SAVE_PTS;
        collect(s, i, s.iX[i], G_GREAT, 0);
        emit(s, EV_SAVE, s.iX[i] >> 8, kind, SAVE_PTS);
      } else if (s.iT[i] >= RIM_ROLL_STEPS * 256) {
        s.iSt[i] = S_DUNK;
        s.iT[i] = 0;
        collect(s, i, s.bx, G_GOOD, 0);
      }
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
      resolveCrossing(s, i, xc, zone);
      continue;
    }
    if ((st === S_MISS || st === S_PASS) && s.iY[i] >= PLAZA_Y * SUB) {
      if (st === S_MISS) emit(s, EV_SPLAT, s.iX[i] >> 8, kind, 0);
      s.iSt[i] = S_FREE;
      continue;
    }
    if (s.iY[i] > (PLAZA_Y + 80) * SUB) s.iSt[i] = S_FREE;
  }
}

/**
 * Advance one logged step. `touch` is 0/1, `targetQ4` the basket target in
 * 1/16 fu (already clamped by the input layer; clamped again here).
 */
export function step(s: SimState, touch: number, targetQ4: number): void {
  'worklet';
  s.evN = 0;
  if (s.done) return;
  s.log.push(targetQ4 * 2 + (touch ? 1 : 0));
  s.steps += 1;
  if (s.cardPending) s.cardPending = 0;
  s.touch = touch ? 1 : 0;
  s.btx = clampInt(targetQ4 * 16, BASKET_MIN * SUB, BASKET_MAX * SUB);
  s.holdTs = nextHoldTs(s.holdTs, s.touch);
  if (s.holdTs <= 0) return;
  s.fxTs = computeFxTs(s);
  const dt = floorDiv(s.holdTs * s.fxTs, 256);
  const before = s.clock;
  s.clockQ += s.finale === 1 ? dt : s.holdTs;
  s.clock = s.clockQ >> 8;
  for (let c = before + 1; c <= s.clock && !s.done && !s.cardPending; c++) {
    if (ballIsLive(s)) s.ballLive += 1;
    spawnPending(s);
    onClockStep(s);
    if (s.tossReq > 0) {
      const x = s.tossReq - 1;
      s.tossReq = 0;
      tossBall(s, x);
    }
  }
  if (s.cardPending) return;
  moveBasket(s);
  stepItems(s, dt);
  stepBall(s, dt);
  stepHazards(s);
  stepTimers(s);
  if (s.finale === 2 && !s.done && s.clock - s.setStart >= s.setLen) finish(s, END_TIME);
}

export function finalScore(s: SimState): number {
  'worklet';
  return s.score + s.bonus;
}

/** Run a full proof log (the replay). Returns the final state. */
export function replay(cfg: SimConfig, log: readonly number[]): SimState {
  const s = createSim(cfg);
  for (let i = 0; i < log.length && !s.done; i++) {
    const v = log[i];
    step(s, v & 1, v >> 1);
  }
  return s;
}

/** True when the caller should stop stepping (frozen with no thumb). */
export function isFrozen(s: SimState, touch: number): boolean {
  'worklet';
  return !touch && s.holdTs === 0;
}

export function starTargets(mode: number, difficulty: number): [number, number, number] {
  const d = difficulty < 1 ? 1 : difficulty > 3 ? 3 : difficulty;
  const row = STARS_RIDE[d];
  if (mode === MODE_QUEUE) {
    return [floorDiv(row[0] * QUEUE_STAR_Q8, 256), floorDiv(row[1] * QUEUE_STAR_Q8, 256), floorDiv(row[2] * QUEUE_STAR_Q8, 256)];
  }
  return [row[0], row[1], row[2]];
}

export function starsFor(score: number, t: readonly number[]): number {
  return score >= t[2] ? 3 : score >= t[1] ? 2 : score >= t[0] ? 1 : 0;
}
