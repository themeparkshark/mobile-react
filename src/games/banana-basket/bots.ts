/**
 * Banana Basket bots (design rev 8, 5.5): calibration and regression tools,
 * plus the dev autoplay. Bots only produce inputs ({touch, targetQ4}), so the
 * sim stays the single source of truth. Their noise uses their own seeded
 * stream, separate from the game's, so every bot run is reproducible. Bots set
 * starting values only; P2 human telemetry locks the targets (G19).
 *
 * Worklet-safe: the dev tester runs the Expert on the UI thread.
 */

import {
  BALL_R, BASKET_MAX, BASKET_MIN, FIELD_W, GULL_REACH, HALF_ZONE, K_BANANA, K_BUNCH, K_COIN, K_PUFFER, LANE_Y,
  LOCK_STEPS, MAX_PRIZES, PRIZE_R, S_FALL, S_HANG, SUB, ZONE_MID,
} from './constants';
import { clampInt, mixSeed, rngBelow, rngNext, type BRng } from './fixed';
import { MAX_ITEMS, type SimState } from './state';
import { travelOf, zoneArc } from './patterns';

export const BOT_KID = 0;
export const BOT_HUMAN = 1;
export const BOT_CASUAL = 2;
export const BOT_EXPERT = 3;
export const BOT_EXPERT_NO_BALL = 4;
export const BOT_PULSE = 5;
export const BOT_LINE_WALKER = 6;
export const BOT_HUMAN_NO_BALL = 7;
export const BOT_SUPER = 8;
export const BOT_EXPERT_NO_AIM = 9;
export const BOT_STARE = 10;
export const BOT_SHIELD = 11;
/** Rev 5 name kept for old callers. */
export const BOT_FREEZE_SPAM = BOT_PULSE;

export const BOT_NAMES = [
  'Kid', 'Human', 'Casual', 'Expert', 'Expert-no-ball', 'Pulse', 'Line-walker', 'Human-no-ball', 'Super Expert',
  'Expert-no-aim', 'Stare', 'Shield',
];

// Ball policies.
const BALL_NONE = 0;
const BALL_CHASE = 1;
const BALL_FALLING = 2;
const BALL_JUGGLE = 3;

export interface Bot {
  kind: number;
  rng: BRng;
  react: number;
  /** Finger speed: max target move per step (fu); 0 = unlimited. */
  finger: number;
  aimSd: number;
  aimUniform: number;
  lapseEvery: number;
  lapseLeft: number;
  lapseClock: number;
  ball: number;
  /** Zone aiming: 0 none, 1 human (25% zone error), 2 expert, 3 super (2 prizes ahead), 4 random zone. */
  aim: number;
  forkBall: number;
  airPenalty: number;
  x: number;
  touch: number;
  /** Frames left frozen (no steps logged). */
  freezeLeft: number;
  nextFreeze: number;
  liftLeft: number;
  shieldPhase: number;
  focus: number;
  focusOff: number;
  zonePick: number;
  zoneFor: number;
  zoneJitter: number;
  forkPick: number;
  forkFor: number;
  seenAfter: number;
  lastHazard: number;
  /** Ball reaction: the clock when the bot last saw the ball change course. */
  ballSeenN: number;
  ballSeenAt: number;
}

export function createBot(kind: number, seed: number): Bot {
  'worklet';
  const b: Bot = {
    kind,
    rng: { s: mixSeed(seed >>> 0, 0x626f7400 + kind) },
    react: 11,
    finger: 0,
    aimSd: 0,
    aimUniform: 0,
    lapseEvery: 0,
    lapseLeft: 0,
    lapseClock: 0,
    ball: BALL_JUGGLE,
    aim: 2,
    forkBall: 100,
    airPenalty: 0,
    x: 200,
    touch: 1,
    freezeLeft: 0,
    nextFreeze: 0,
    liftLeft: 0,
    shieldPhase: 0,
    focus: -1,
    focusOff: 0,
    zonePick: 2,
    zoneFor: -1,
    zoneJitter: 0,
    forkPick: 1,
    forkFor: -1,
    seenAfter: 0,
    lastHazard: 0,
    ballSeenN: -1,
    ballSeenAt: 0,
  };
  if (kind === BOT_KID) {
    b.react = 36;
    b.finger = 22;
    b.aimUniform = 40;
    b.lapseEvery = 300;
    b.ball = BALL_CHASE;
    b.airPenalty = 12;
    b.aim = 0;
  } else if (kind === BOT_CASUAL) {
    b.react = 27;
    b.finger = 20;
    b.aimUniform = 30;
    b.lapseEvery = 360;
    b.ball = BALL_FALLING;
    b.aim = 0;
  } else if (kind === BOT_HUMAN || kind === BOT_LINE_WALKER || kind === BOT_HUMAN_NO_BALL) {
    // Engaged human, about 5 runs in (5.5): 180-250 ms, 85% speed, sd 14 fu,
    // +120 ms and sd x2 while the ball is airborne, divided attention (lapses).
    b.react = 11 + rngBelow(b.rng, 5);
    b.finger = 26;
    b.aimSd = 16;
    b.airPenalty = 7;
    b.lapseEvery = 360;
    b.ball = kind === BOT_HUMAN_NO_BALL ? BALL_NONE : BALL_JUGGLE;
    b.aim = 1;
    b.forkBall = 60;
  } else if (kind === BOT_SUPER) {
    b.react = 7;
    b.aim = 3;
  } else if (kind === BOT_EXPERT_NO_BALL) {
    b.ball = BALL_NONE;
  } else if (kind === BOT_EXPERT_NO_AIM) {
    b.aim = 4;
  }
  if (kind === BOT_LINE_WALKER) b.nextFreeze = 300 + rngBelow(b.rng, 900);
  return b;
}

/** Approximate Gaussian from the bot's own stream (Irwin-Hall, 4 draws). */
function gauss(b: Bot, sd: number): number {
  'worklet';
  let t = 0;
  for (let i = 0; i < 4; i++) t += rngNext(b.rng) / 4294967296;
  return (t - 2) * sd * 1.732;
}

function remaining(s: SimState, i: number): number {
  'worklet';
  return s.iLand[i] - (s.iAge[i] >> 8);
}

function isMust(s: SimState, i: number): boolean {
  'worklet';
  return s.iKind[i] === K_BANANA && s.iMust[i] === 1;
}

/** Steps for the basket (and the bot's finger) to cover dx fu. */
function reach(b: Bot, dx: number): number {
  'worklet';
  const a = dx < 0 ? -dx : dx;
  const t = travelOf(a > 40 ? a - 40 : 0);
  if (b.finger <= 0) return t;
  const f = Math.ceil(Math.max(0, a - 40) / b.finger);
  return f > t ? f : t;
}

/** Zone that sends the ball through a hanging prize (or -1). */
function zoneForPrize(s: SimState, plan: number): number {
  'worklet';
  const ax: number[] = [];
  const ay: number[] = [];
  for (let i = 0; i < 100; i++) {
    ax.push(0);
    ay.push(0);
  }
  let best = -1;
  let bestScore = 1 << 30;
  const bx = s.bx >> 8;
  const dt = s.bPredStep - s.clock;
  for (let z = 0; z < 5; z++) {
    const need = (s.bPredX >> 8) - ZONE_MID[z];
    if (need < BASKET_MIN || need > BASKET_MAX) continue;
    if (travelOf(Math.abs(need - bx)) > dt) continue;
    const k = zoneArc(s, s.bPredX, s.bN + 1, z, ax, ay);
    for (let h = 0; h < MAX_PRIZES; h++) {
      if (s.hSt[h] !== S_HANG) continue;
      const r = BALL_R + PRIZE_R - 6;
      for (let m = 0; m < k; m++) {
        const dx = ax[m] - s.hX[h];
        const dy = ay[m] - s.hY[h];
        if (dx * dx + dy * dy <= r * r) {
          // Lucky first, then the prize that expires soonest; super also prefers a landing near the middle.
          let sc = s.hEnd[h] - s.clock - (s.hKind[h] === 3 ? 400 : 0);
          if (plan) sc += Math.abs(ax[k - 1] - 200);
          if (sc < bestScore) {
            bestScore = sc;
            best = z;
          }
          break;
        }
      }
    }
  }
  return best;
}

/** Zone whose next landing is closest to x (keeps the ball near the action). */
function zoneToward(s: SimState, x: number): number {
  'worklet';
  const ax: number[] = [];
  const ay: number[] = [];
  for (let i = 0; i < 100; i++) {
    ax.push(0);
    ay.push(0);
  }
  let best = 2;
  let bestD = 1 << 30;
  for (let z = 0; z < 5; z++) {
    const k = zoneArc(s, s.bPredX, s.bN + 1, z, ax, ay);
    const d = Math.abs(ax[k - 1] - x);
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

function chooseZone(s: SimState, b: Bot, focusX: number): number {
  'worklet';
  if (b.aim === 0) return 2;
  if (b.aim === 4) return rngBelow(b.rng, 5);
  const pz = zoneForPrize(s, b.aim === 3 ? 1 : 0);
  let z = pz >= 0 ? pz : zoneToward(s, focusX);
  if (b.aim === 1 && rngBelow(b.rng, 100) < 25) z = clampInt(z + (rngBelow(b.rng, 2) === 0 ? -1 : 1), 0, 4);
  return z;
}

/** Thumb pattern for this step (freeze bots). Returns 1 to step with touch, 0 lift. */
function thumb(s: SimState, b: Bot): number {
  'worklet';
  if (b.kind === BOT_PULSE) {
    if (b.liftLeft > 0) {
      b.liftLeft--;
      return 0;
    }
    for (let i = 0; i < MAX_ITEMS; i++) {
      if (s.iSt[i] !== S_FALL) continue;
      const r = remaining(s, i);
      if (r >= 0 && r <= 30 && rngBelow(b.rng, 6) === 0) {
        b.liftLeft = 1 + rngBelow(b.rng, 20);
        return 0;
      }
    }
  } else if (b.kind === BOT_STARE) {
    for (let i = 0; i < MAX_ITEMS; i++) {
      if (s.iSt[i] === S_FALL && s.iKind[i] === K_PUFFER && s.iId[i] > b.lastHazard) {
        b.lastHazard = s.iId[i];
        b.freezeLeft = 120;
        b.seenAfter = s.clock;
        return 0;
      }
    }
  } else if (b.kind === BOT_SHIELD) {
    let danger = false;
    for (let i = 0; i < MAX_ITEMS; i++) {
      if (s.iSt[i] !== S_FALL || s.iKind[i] !== K_PUFFER) continue;
      const r = remaining(s, i);
      if (r >= 0 && r <= 30 && Math.abs(s.iX[i] - s.bx) <= (HALF_ZONE + 4) * SUB) danger = true;
    }
    if (s.gSt > 0 && Math.abs(s.gX - s.bx) <= (GULL_REACH + 4) * SUB) danger = true;
    if (danger) {
      if (s.parked) return 0;
      if (s.fullRun < LOCK_STEPS && s.holdTs > 0) return 0;
      // Out of the lock: blip the thumb so the next lift lands inside it.
      b.shieldPhase = b.shieldPhase === 0 ? 1 : 0;
      return b.shieldPhase === 1 ? 0 : 1;
    }
    b.shieldPhase = 0;
  } else if (b.kind === BOT_LINE_WALKER) {
    if (s.clock >= b.nextFreeze && b.freezeLeft === 0) {
      b.freezeLeft = 60 + rngBelow(b.rng, 1740);
      b.nextFreeze = s.clock + 300 + rngBelow(b.rng, 900);
      b.seenAfter = s.clock;
      return 0;
    }
  }
  return 1;
}

/**
 * Next input for this bot. Returns targetQ4 (1/16 fu); b.touch holds the
 * thumb state for the step.
 */
export function botInput(s: SimState, b: Bot): number {
  'worklet';
  b.touch = thumb(s, b);
  // Lapses: the bot looks away and holds still.
  if (b.lapseEvery > 0 && s.clock - b.lapseClock >= b.lapseEvery) {
    b.lapseClock = s.clock + rngBelow(b.rng, b.lapseEvery >> 1);
    b.lapseLeft = 10 + rngBelow(b.rng, 14);
  }
  if (b.lapseLeft > 0) {
    b.lapseLeft--;
    b.touch = b.touch && 1;
    return b.x * 16;
  }
  const bx = s.bx >> 8;
  const airborne = s.bOn === 1 && s.bY < (LANE_Y - 120) * SUB;
  const react = b.react + (airborne ? b.airPenalty : 0);
  // After a long freeze (veil): items need a fresh look.
  const veilSeen = b.seenAfter;
  // Most urgent visible collectible (must-catch first).
  let best = -1;
  let bestR = 1 << 30;
  for (let i = 0; i < MAX_ITEMS; i++) {
    if (s.iSt[i] !== S_FALL) continue;
    const k = s.iKind[i];
    if (k === K_PUFFER) continue;
    if ((s.iAge[i] >> 8) < react) continue;
    if (veilSeen > 0 && s.clock - veilSeen < react) continue;
    const r = remaining(s, i);
    if (r < -2) continue;
    const score = r - (isMust(s, i) ? 0 : 12) + (k === K_COIN ? -6 : 0);
    if (score < bestR) {
      bestR = score;
      best = i;
    }
  }
  let target = bx;
  if (best >= 0) {
    if (b.focus !== s.iId[best]) {
      b.focus = s.iId[best];
      const sd = b.aimSd * (airborne && b.airPenalty > 0 ? 2 : 1);
      b.focusOff = sd > 0 ? gauss(b, sd) : b.aimUniform > 0 ? rngBelow(b.rng, b.aimUniform * 2 + 1) - b.aimUniform : 0;
    }
    target = (s.iX[best] >> 8) + b.focusOff;
  }
  // The ball: plan the order of the next contact and the most urgent catch.
  // The bot reacts to each new ball arc after its own reaction time.
  if (s.bounces + s.bOn * 1000 + s.pailSaves * 100000 !== b.ballSeenN) {
    b.ballSeenN = s.bounces + s.bOn * 1000 + s.pailSaves * 100000;
    b.ballSeenAt = s.clock;
  }
  const ballSeen = s.clock - b.ballSeenAt >= react;
  if (ballSeen && b.ball !== BALL_NONE && s.bOn === 1 && s.bVy > 0 && s.bPredStep >= 0) {
    const dt = s.bPredStep - s.clock;
    const px = s.bPredX >> 8;
    if (b.zoneFor !== s.bounces) {
      b.zoneFor = s.bounces;
      b.zonePick = chooseZone(s, b, best >= 0 ? target : 200);
      // Contact error: uniform for kids and casuals, Gaussian for humans (x2 while airborne).
      b.zoneJitter = b.aimUniform > 0 ? rngBelow(b.rng, b.aimUniform * 2 + 1) - b.aimUniform : b.aimSd > 0 ? gauss(b, b.aimSd) : 0;
    }
    const strike = clampInt(px - (b.aim === 0 ? b.zoneJitter : ZONE_MID[b.zonePick]) + (b.aimSd > 0 ? b.zoneJitter : 0), BASKET_MIN, BASKET_MAX);
    const want = b.ball === BALL_CHASE || (b.ball === BALL_FALLING && dt < 40) || b.ball === BALL_JUGGLE;
    if (want && dt >= 0 && dt < 60) {
      let goBall = best < 0;
      if (!goBall) {
        const r = remaining(s, best);
        const lx = target;
        const slack = b.kind === BOT_EXPERT || b.kind === BOT_SUPER ? 1 : 4;
        const ballFirst = reach(b, strike - bx) + slack <= dt && reach(b, lx - strike) + slack <= r - dt;
        const itemFirst = r <= dt && reach(b, lx - bx) + slack <= r && reach(b, strike - lx) + slack <= dt - r;
        if (ballFirst && !(itemFirst && r < dt)) goBall = true;
        else if (itemFirst) goBall = false;
        else if (b.ball === BALL_CHASE) goBall = true;
        else {
          // Can't have both.
          if (s.iFlag[best] === 2) {
            if (b.forkFor !== s.iId[best]) {
              b.forkFor = s.iId[best];
              b.forkPick = rngBelow(b.rng, 100) < b.forkBall ? 1 : 0;
              if (b.kind === BOT_EXPERT || b.kind === BOT_SUPER || b.kind === BOT_EXPERT_NO_AIM) b.forkPick = s.chain >= 12 || s.bN >= 3 ? 1 : 0;
            }
            goBall = b.forkPick === 1;
          } else goBall = !isMust(s, best) || ((b.kind === BOT_EXPERT || b.kind === BOT_SUPER) && s.chain < 3);
        }
      }
      if (goBall) target = strike;
    }
  }
  // Dodge puffers that will cross soon near the target or the basket.
  for (let i = 0; i < MAX_ITEMS; i++) {
    if (s.iSt[i] !== S_FALL || s.iKind[i] !== K_PUFFER) continue;
    if ((s.iAge[i] >> 8) < react) continue;
    const r = remaining(s, i);
    if (r > 40 || r < -1) continue;
    const px = s.iX[i] >> 8;
    const clear = HALF_ZONE + (b.kind === BOT_EXPERT || b.kind === BOT_SUPER ? 6 : 26);
    if (target > px - clear && target < px + clear) {
      target = target >= px ? px + clear + 2 : px - clear - 2;
      if (target < BASKET_MIN) target = px + clear + 2;
      if (target > BASKET_MAX) target = px - clear - 2;
    }
  }
  // Leave a gull's shadow.
  if (s.gSt > 0) {
    const gx = s.gX >> 8;
    const clear = GULL_REACH + 12;
    if (target > gx - clear && target < gx + clear) target = gx < FIELD_W / 2 ? gx + clear + 4 : gx - clear - 4;
  }
  target = clampInt(Math.round(target), BASKET_MIN, BASKET_MAX);
  const d = target - b.x;
  if (b.finger > 0) b.x += d > b.finger ? b.finger : d < -b.finger ? -b.finger : d;
  else b.x = target;
  return b.x * 16;
}

/** Run a whole round with a bot and return the final state (tests, calibration). */
export function runBot(s: SimState, b: Bot, step: (s: SimState, touch: number, q4: number) => void, maxSteps = 60000): SimState {
  for (let n = 0; n < maxSteps && !s.done; n++) {
    if (s.cardPending === 0 && b.freezeLeft > 0 && s.holdTs === 0) {
      // Frozen: time stands still and nothing is logged.
      b.freezeLeft--;
      continue;
    }
    const q4 = botInput(s, b);
    const touch = b.freezeLeft > 0 ? 0 : b.touch;
    if (!touch && s.holdTs === 0 && s.steps > 0 && !s.cardPending) {
      // A pulse lift at rest: nothing to log.
      continue;
    }
    step(s, touch, q4);
  }
  return s;
}

export { BALL_R, K_BUNCH };
