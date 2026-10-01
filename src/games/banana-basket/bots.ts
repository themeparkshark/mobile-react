/**
 * Banana Basket bots (design 5.5): regression and calibration tools, plus the
 * dev autoplay. Bots only produce inputs ({touch, targetQ4}), so the sim stays
 * the single source of truth. Their noise uses their own seeded stream,
 * separate from the game's, so every bot run is reproducible.
 *
 * Worklet-safe: the dev tester runs the Expert on the UI thread.
 */

import { BASKET_MAX, BASKET_MIN, HALF_ZONE, K_BANANA, K_BUNCH, K_COIN, K_LUCKY, K_PUFFER, LANE_Y, S_FALL, SUB, BALL_R } from './constants';
import { clampInt, mixSeed, rngBelow, rngNext, type BRng } from './fixed';
import { MAX_ITEMS, type SimState } from './state';

export const BOT_KID = 0;
export const BOT_HUMAN = 1;
export const BOT_CASUAL = 2;
export const BOT_EXPERT = 3;
export const BOT_EXPERT_NO_BALL = 4;
export const BOT_FREEZE_SPAM = 5;
export const BOT_LINE_WALKER = 6;

export interface Bot {
  kind: number;
  rng: BRng;
  react: number;
  speed: number;
  aimSd: number;
  aimUniform: number;
  lapseEvery: number;
  lapseLeft: number;
  lapseClock: number;
  ball: number;
  closeCalls: number;
  x: number;
  touch: number;
  freezeLeft: number;
  nextFreeze: number;
  walkFreezes: number[];
  focus: number;
  focusOff: number;
}

export function createBot(kind: number, seed: number): Bot {
  'worklet';
  const b: Bot = {
    kind,
    rng: { s: mixSeed(seed >>> 0, 0x626f7400 + kind) },
    react: 11,
    speed: 256,
    aimSd: 0,
    aimUniform: 0,
    lapseEvery: 0,
    lapseLeft: 0,
    lapseClock: 0,
    ball: 1,
    closeCalls: 1,
    x: 200,
    touch: 1,
    freezeLeft: 0,
    nextFreeze: 20,
    walkFreezes: [],
    focus: -1,
    focusOff: 0,
  };
  if (kind === BOT_KID) {
    b.react = 36;
    b.speed = 141;
    b.aimUniform = 40;
    b.lapseEvery = 300;
    b.ball = 1;
    b.closeCalls = 0;
  } else if (kind === BOT_HUMAN || kind === BOT_LINE_WALKER) {
    b.react = 11 + rngBelow(b.rng, 5);
    b.speed = 218;
    b.aimSd = 14;
    b.lapseEvery = 600;
    b.closeCalls = 0;
  } else if (kind === BOT_CASUAL) {
    b.react = 27;
    b.speed = 166;
    b.aimUniform = 30;
    b.lapseEvery = 600;
    b.closeCalls = 0;
  } else if (kind === BOT_EXPERT_NO_BALL) {
    b.ball = 0;
  }
  if (kind === BOT_LINE_WALKER) {
    const n = 3 + rngBelow(b.rng, 4);
    for (let i = 0; i < n; i++) b.walkFreezes.push(200 + rngBelow(b.rng, 2400));
  }
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

/**
 * Next input for this bot. Returns targetQ4 (1/16 fu); b.touch holds the
 * thumb state for the step.
 */
export function botInput(s: SimState, b: Bot): number {
  'worklet';
  // Thumb patterns (the time-freeze bots).
  b.touch = 1;
  if (b.kind === BOT_FREEZE_SPAM) {
    if (b.freezeLeft > 0) {
      b.freezeLeft--;
      b.touch = 0;
    } else if (--b.nextFreeze <= 0) {
      b.freezeLeft = 4 + rngBelow(b.rng, 7);
      b.nextFreeze = 10 + rngBelow(b.rng, 21);
    }
  }
  // Lapses: the bot looks away and holds still.
  if (b.lapseEvery > 0 && s.clock - b.lapseClock >= b.lapseEvery) {
    b.lapseClock = s.clock + rngBelow(b.rng, b.lapseEvery >> 1);
    b.lapseLeft = 10 + rngBelow(b.rng, 14);
  }
  if (b.lapseLeft > 0) {
    b.lapseLeft--;
    return b.x * 16;
  }
  const bx = s.bx >> 8;
  const airborne = s.bOn === 1 && s.bY < (LANE_Y - 120) * SUB;
  const react = b.react + (b.kind === BOT_HUMAN && airborne ? 7 : 0);
  // Most urgent visible collectible (must-catch first).
  let best = -1;
  let bestR = 1 << 30;
  for (let i = 0; i < MAX_ITEMS; i++) {
    if (s.iSt[i] !== S_FALL) continue;
    const k = s.iKind[i];
    if (k === K_PUFFER) continue;
    if ((s.iAge[i] >> 8) < react) continue;
    const r = remaining(s, i);
    if (r < -2) continue;
    const must = (k === K_BANANA || k === K_BUNCH || k === K_LUCKY) && s.iMust[i] === 1 && s.iOpt[i] === 0;
    const score = r - (must ? 0 : 12) + (k === K_COIN ? -6 : 0);
    if (score < bestR) {
      bestR = score;
      best = i;
    }
  }
  let target = bx;
  if (best >= 0) {
    const r = remaining(s, best);
    const lx = (s.iX[best] + s.iVx[best] * (r > 0 ? r : 0)) >> 8;
    if (b.focus !== s.iId[best]) {
      b.focus = s.iId[best];
      const sd = b.aimSd * (b.kind === BOT_HUMAN && airborne ? 2 : 1);
      b.focusOff = sd > 0 ? gauss(b, sd) : b.aimUniform > 0 ? (rngBelow(b.rng, b.aimUniform * 2 + 1) - b.aimUniform) : 0;
    }
    target = lx + b.focusOff;
  }
  // Juggle: go under the ball when nothing must-catch is close.
  if (b.ball && s.bOn === 1 && s.bVy > 0 && s.bPredStep >= 0) {
    const dt = s.bPredStep - s.clock;
    if (dt >= 0 && dt < 40 && (best < 0 || bestR > dt + (b.kind === BOT_EXPERT ? 4 : 16))) {
      const px = s.bPredX >> 8;
      target = px + (b.kind === BOT_EXPERT ? (px > 200 ? 18 : -18) : 0);
    }
  }
  // Dodge puffers that will cross soon near the target or the basket.
  for (let i = 0; i < MAX_ITEMS; i++) {
    if (s.iSt[i] !== S_FALL || s.iKind[i] !== K_PUFFER) continue;
    if ((s.iAge[i] >> 8) < react) continue;
    const r = remaining(s, i);
    if (r > 40 || r < -1) continue;
    const px = s.iX[i] >> 8;
    const clear = HALF_ZONE + (b.closeCalls ? 6 : 26);
    if (target > px - clear && target < px + clear) {
      target = target >= px ? px + clear + 2 : px - clear - 2;
      if (target < BASKET_MIN) target = px + clear + 2;
      if (target > BASKET_MAX) target = px - clear - 2;
    }
  }
  target = clampInt(Math.round(target), BASKET_MIN, BASKET_MAX);
  // The bot's own finger speed (fraction of the basket cap).
  const maxMove = Math.floor((24 * b.speed) / 256) + 1;
  const d = target - b.x;
  b.x += d > maxMove ? maxMove : d < -maxMove ? -maxMove : d;
  return b.x * 16;
}

/** Run a whole round with a bot and return the final state (tests, calibration). */
export function runBot(s: SimState, b: Bot, step: (s: SimState, touch: number, q4: number) => void, maxSteps = 40000): SimState {
  for (let n = 0; n < maxSteps && !s.done; n++) {
    const q4 = botInput(s, b);
    if (b.kind === BOT_LINE_WALKER && b.walkFreezes.length > 0 && s.clock >= b.walkFreezes[0]) {
      // A long freeze: the thumb lifts, holdTs ramps to 0, then no steps are logged.
      b.walkFreezes.shift();
      for (let k = 0; k < 10 && s.holdTs > 0; k++) step(s, 0, q4);
      continue;
    }
    if (!b.touch && s.holdTs === 0) continue;
    step(s, b.touch, q4);
  }
  return s;
}
export { BALL_R };
