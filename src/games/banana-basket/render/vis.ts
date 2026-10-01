/**
 * Render-only animation state (UI thread, design rev 8 section 7). The sim's
 * events feed it on the same step they happen, so squash, key holds, stamps
 * and the head chip land on the exact frame of the catch with no JS round
 * trip. Nothing here touches the score or the proof.
 *
 * Rev 8 rules kept here:
 *  - Ride stamps (7.0): PERFECT (3+ streak), POP!, BONK!, tier stamp, GOLDEN
 *    HOUR!, TIME!. CLOSE CALL is audio, slow-mo and speed lines only.
 *  - Screen-event cap: at most 2 screen-space events per 250 ms, by priority.
 *  - Lean: clamp(vx / 1440 fu/s) * 18 deg with a reversal overshoot; the rim
 *    counter-rotates so it stays within +/- 4 deg (B-6).
 */

import { G_GOLD_POP, G_PERFECT, G_POP, HALF_ZONE, K_BANANA, K_BUNCH, K_COIN, K_LUCKY, K_PUFFER, LANE_Y, MAX_PRIZES, PERFECT_D, S_FALL, SUB } from '../constants';
import {
  EV_BALL_LOST, EV_BALL_POP, EV_BALL_TOSS, EV_BONK, EV_BOUNCE, EV_BREAK, EV_CATCH, EV_CLOSE, EV_COIN_SET, EV_EDGE,
  EV_FINALE, EV_GATE, EV_GOLD_BALL, EV_GOLDEN, EV_GULL, EV_HIT, EV_MISS, EV_PAIL, EV_PARK, EV_PRIZE, EV_RUSH, EV_SET,
  EV_SHIELD, EV_SPAWN, EV_SPLAT, EV_TELL, EV_TIER, EV_TIME, EV_TIPOVER, EV_VICTORY, EV_ZONE, EV_REMIX, MAX_ITEMS,
  type SimState,
} from '../state';

export const POSE_IDLE = 0;
export const POSE_CHEER = 1;
export const POSE_BONKED = 2;
export const POSE_DIZZY = 3;
export const POSE_FIST = 4;
export const POSE_HOP = 5;
export const POSE_GRIN = 6;
export const POSE_CHOMP = 7;
export const POSE_STRAIN = 8;
export const POSE_SLUMP = 9;

// Stamp texts (index into STAMP_TEXT). Ride uses only the first six kinds.
export const ST_NONE = 0;
export const ST_PERFECT = 1;
export const ST_POP = 2;
export const ST_BONK = 3;
export const ST_TIER2 = 4;
export const ST_TIER3 = 5;
export const ST_TIER4 = 6;
export const ST_GOLDEN = 7;
export const ST_TIME = 8;
export const ST_OUT = 9;
export const ST_UNLOCK = 10;
export const ST_TIPOVER = 11;
export const ST_REMIX = 12;

export const STAMP_TEXT = [
  '', 'PERFECT', 'POP!', 'BONK!', 'x2', 'x3', 'x4', 'GOLDEN HOUR!', 'TIME!', 'OUT OF HEARTS', 'x3 UNLOCKED!',
  'CART TIP-OVER!', 'REMIX!',
];
/** Screen-event priority (7.0): puffer hit > Golden Hour > TIME! > tier-up > BONK > POP > PERFECT > coin > notch. */
export const SE_NOTCH = 1;
export const SE_COIN = 2;
export const SE_PERFECT = 3;
export const SE_POP = 4;
export const SE_BONK = 5;
export const SE_TIER = 6;
export const SE_TIME = 7;
export const SE_GOLDEN = 8;
export const SE_HIT = 9;

export const MAX_SPLATS = 12;
export const TRAIL_N = 10;

export interface Vis {
  /** Presentation ms (freezes with the world). */
  t: number;
  /** Cloud clock (10% speed while frozen). */
  cloudT: number;
  frozenMs: number;
  lean: number;
  leanV: number;
  squashT: number;
  squashAmt: number;
  pose: number;
  poseUntil: number;
  poseT: number;
  flashT: number;
  silhouetteT: number;
  chipT: number;
  chipGain: number;
  badgeT: number;
  badgeShakeT: number;
  heartT: number;
  heartIdx: number;
  stamp: number;
  stampT: number;
  stampSuffix: number;
  stampX: number;
  perfStreak: number;
  ghStartT: number;
  ghEndT: number;
  ghArmT: number;
  rushT: number;
  finaleT: number;
  timeT: number;
  splatX: number[];
  splatY: number[];
  splatT: number[];
  splatHead: number;
  ballSquashT: number;
  catchX: number;
  resumeT: number;
  tipT: number;
  show: number;
  face: number;
  hopPhase: number;
  hopLand: number;
  plopT: number;
  plopX: number;
  powT: number;
  powX: number;
  powY: number;
  notch: number;
  lockT: number;
  unlockT: number;
  ringT: number;
  cartT: number;
  cartX: number;
  cartPos: number;
  gullT: number;
  gullPhase: number;
  gullX: number;
  gullEdge: number;
  stealT: number;
  shieldT: number;
  zoneT: number;
  zoneIdx: number;
  /** Ribbon trail: last positions (fu) of the ball. */
  trailX: number[];
  trailY: number[];
  trailN: number;
  trailHead: number;
  prizeT: number[];
  prizeKind: number[];
  prizeX: number[];
  pailT: number;
  pailUsedT: number;
  dustT: number;
  sweepStartT: number;
  wasSweeping: number;
  parkT: number;
  parkSteps: number;
  closeT: number;
  closeX: number;
  victoryT: number;
  /** Screen-event cap window. */
  seT0: number;
  seT1: number;
  seDropped: number;
  /** Star-meter notch passed: index and time. */
  notchIdx: number;
  notchT: number;
  notchPassed: number;
  blinkAt: number;
  blinkT: number;
  serveTellT: number;
  setT: number;
}

export function stampIsBig(id: number): boolean {
  'worklet';
  return id === ST_TIME || id === ST_OUT || id === ST_GOLDEN || id === ST_TIPOVER || id === ST_REMIX;
}

/** Screen-event cap: at most 2 per 250 ms (a dropped one keeps its in-place FX). */
export function screenOk(v: Vis, pri: number): boolean {
  'worklet';
  if (pri >= SE_HIT) {
    v.seT0 = v.seT1;
    v.seT1 = v.t;
    return true;
  }
  if (v.t - v.seT0 < 250) {
    v.seDropped += 1;
    return false;
  }
  v.seT0 = v.seT1;
  v.seT1 = v.t;
  return true;
}

function stamp(v: Vis, id: number, suffix: number, x: number): void {
  'worklet';
  v.stamp = id;
  v.stampT = v.t;
  v.stampSuffix = suffix;
  v.stampX = x;
}

export function createVis(): Vis {
  'worklet';
  const z = (n: number, val: number) => {
    const a: number[] = [];
    for (let i = 0; i < n; i++) a.push(val);
    return a;
  };
  return {
    t: 0,
    cloudT: 0,
    frozenMs: 0,
    lean: 0,
    leanV: 0,
    squashT: -1e6,
    squashAmt: 0,
    pose: POSE_IDLE,
    poseUntil: 0,
    poseT: -1e6,
    flashT: -1e6,
    silhouetteT: -1e6,
    chipT: -1e6,
    chipGain: 0,
    badgeT: -1e6,
    badgeShakeT: -1e6,
    heartT: -1e6,
    heartIdx: -1,
    stamp: ST_NONE,
    stampT: -1e6,
    stampSuffix: 0,
    stampX: 200,
    perfStreak: 0,
    ghStartT: -1e6,
    ghEndT: -1e6,
    ghArmT: -1e6,
    rushT: -1e6,
    finaleT: -1e6,
    timeT: -1e6,
    splatX: z(MAX_SPLATS, 0),
    splatY: z(MAX_SPLATS, 0),
    splatT: z(MAX_SPLATS, -1e6),
    splatHead: 0,
    ballSquashT: -1e6,
    catchX: 200,
    resumeT: -1e6,
    tipT: -1e6,
    show: POSE_IDLE,
    face: 1,
    hopPhase: 0,
    hopLand: -1e6,
    plopT: -1e6,
    plopX: 200,
    powT: -1e6,
    powX: 200,
    powY: LANE_Y,
    notch: 0,
    lockT: -1e6,
    unlockT: -1e6,
    ringT: -1e6,
    cartT: -1e6,
    cartX: 200,
    cartPos: 200,
    gullT: -1e6,
    gullPhase: 0,
    gullX: 200,
    gullEdge: 430,
    stealT: -1e6,
    shieldT: -1e6,
    zoneT: -1e6,
    zoneIdx: 2,
    trailX: z(TRAIL_N, 0),
    trailY: z(TRAIL_N, 0),
    trailN: 0,
    trailHead: 0,
    prizeT: z(MAX_PRIZES, -1e6),
    prizeKind: z(MAX_PRIZES, 0),
    prizeX: z(MAX_PRIZES, 200),
    pailT: -1e6,
    pailUsedT: -1e6,
    dustT: -1e6,
    sweepStartT: -1e6,
    wasSweeping: 0,
    parkT: -1e6,
    parkSteps: 30,
    closeT: -1e6,
    closeX: 200,
    victoryT: -1e6,
    seT0: -1e6,
    seT1: -1e6,
    seDropped: 0,
    notchIdx: -1,
    notchT: -1e6,
    notchPassed: 0,
    blinkAt: 3000,
    blinkT: -1e6,
    serveTellT: -1e6,
    setT: -1e6,
  };
}

function setPose(v: Vis, pose: number, ms: number): void {
  'worklet';
  v.pose = pose;
  v.poseUntil = v.t + ms;
  v.poseT = v.t;
}

/** Feed one step's sim events (call right after step()). */
export function visEvents(v: Vis, s: SimState, reducedMotion: boolean): void {
  'worklet';
  for (let e = 0; e < s.evN; e++) {
    const k = s.evK[e];
    const a = s.evA[e];
    const b = s.evB[e];
    const c = s.evC[e];
    if (k === EV_CATCH) {
      const kind = b & 15;
      const grade = (b >> 4) & 15;
      v.squashT = v.t;
      v.squashAmt = kind === K_BUNCH || kind === K_LUCKY ? 1.45 : grade >= G_PERFECT ? 1.15 : 1;
      v.chipT = v.t;
      v.chipGain = c & 0xffff;
      v.catchX = a;
      if (grade < G_POP) {
        v.plopT = v.t;
        v.plopX = a;
      }
      if (kind === K_BUNCH) setPose(v, POSE_STRAIN, 150);
      if (kind === K_LUCKY) setPose(v, POSE_CHOMP, 200);
      if (grade === G_PERFECT) {
        v.perfStreak += 1;
        if (v.pose === POSE_IDLE || v.pose === POSE_GRIN) setPose(v, POSE_GRIN, 180);
        if (!reducedMotion) {
          v.silhouetteT = v.t;
          v.powT = v.t;
          v.powX = a;
          v.powY = LANE_Y - 18;
        }
        if (v.perfStreak >= 3 && screenOk(v, SE_PERFECT)) stamp(v, ST_PERFECT, v.perfStreak, a);
      } else if (grade < G_POP) v.perfStreak = 0;
      if (grade === G_POP || grade === G_GOLD_POP) {
        v.flashT = v.t;
        if (screenOk(v, SE_POP)) stamp(v, ST_POP, kind === K_LUCKY ? 1 : 0, a);
      }
    } else if (k === EV_EDGE) {
      v.squashT = v.t;
      v.squashAmt = 0.6;
    } else if (k === EV_MISS) {
      if (c === 1) {
        v.badgeShakeT = v.t;
        v.perfStreak = 0;
      }
    } else if (k === EV_SPLAT) {
      const i = v.splatHead;
      v.splatX[i] = a;
      v.splatY[i] = LANE_Y + 110 + ((a * 7) % 14);
      v.splatT[i] = v.t;
      v.splatHead = (i + 1) % MAX_SPLATS;
    } else if (k === EV_HIT) {
      v.powT = v.t;
      v.powX = a;
      v.powY = LANE_Y - 30;
      setPose(v, POSE_BONKED, 120);
      v.silhouetteT = v.t;
      v.heartT = v.t;
      v.heartIdx = b;
      screenOk(v, SE_HIT);
    } else if (k === EV_SHIELD) {
      v.shieldT = v.t;
    } else if (k === EV_CLOSE) {
      v.closeT = v.t;
      v.closeX = a;
    } else if (k === EV_BOUNCE) {
      v.ballSquashT = v.t;
      v.ringT = v.t;
    } else if (k === EV_ZONE) {
      v.zoneT = v.t;
      v.zoneIdx = b;
    } else if (k === EV_GOLD_BALL) {
      v.flashT = v.t;
    } else if (k === EV_BALL_POP) {
      v.flashT = v.t;
    } else if (k === EV_BONK) {
      v.flashT = v.t;
      v.powT = v.t;
      v.powX = a;
      v.powY = c === 2 ? LANE_Y - 60 : LANE_Y - 150;
      setPose(v, POSE_GRIN, 200);
      if (screenOk(v, SE_BONK)) stamp(v, ST_BONK, 0, a);
    } else if (k === EV_BALL_LOST) {
      v.trailN = 0;
      v.lockT = v.t;
    } else if (k === EV_TIER) {
      v.badgeT = v.t;
      if (a >= 3) setPose(v, POSE_CHEER, 250);
      if (screenOk(v, SE_TIER)) {
        if (c === 1 && a === 3) {
          v.unlockT = v.t;
          stamp(v, ST_UNLOCK, 0, s.bx >> 8);
        } else stamp(v, a === 2 ? ST_TIER2 : a === 3 ? ST_TIER3 : ST_TIER4, 0, s.bx >> 8);
      }
    } else if (k === EV_GATE) {
      if (a === 1) v.lockT = v.t;
      else v.unlockT = v.t;
    } else if (k === EV_SPAWN) {
      if (b !== K_PUFFER) v.cartX = a;
    } else if (k === EV_BALL_TOSS) {
      v.cartT = v.t;
      if (b === 0) v.cartX = a;
      v.trailN = 0;
    } else if (k === EV_TELL) {
      if (b === 102) {
        v.serveTellT = v.t;
        v.cartX = a;
      }
    } else if (k === EV_PAIL) {
      if (b === 1) {
        v.pailT = v.t;
        v.pailUsedT = v.t;
        v.trailN = 0;
      } else v.pailUsedT = -1e6;
    } else if (k === EV_PRIZE) {
      v.prizeT[b] = v.t;
      v.prizeKind[b] = (c & 15) + a * 16;
      v.prizeX[b] = c >> 4;
      if (a === 1) v.cartX = c >> 4;
    } else if (k === EV_GULL) {
      v.gullPhase = a;
      v.gullT = v.t;
      v.gullX = b;
      if (a === 1 || a === 2) v.gullEdge = c;
      if (a === 3) v.stealT = v.t;
    } else if (k === EV_BREAK) {
      v.badgeShakeT = v.t;
      v.perfStreak = 0;
    } else if (k === EV_GOLDEN) {
      if (a === 4) v.ghArmT = v.t;
      else if (a === 1) {
        v.ghStartT = v.t;
        setPose(v, POSE_CHEER, 250);
        if (screenOk(v, SE_GOLDEN)) stamp(v, ST_GOLDEN, 0, 200);
      } else if (a === 3) v.ghEndT = v.t;
    } else if (k === EV_COIN_SET) {
      v.chipT = v.t;
      v.chipGain = b;
    } else if (k === EV_RUSH) {
      if (a === 2) v.rushT = v.t;
    } else if (k === EV_FINALE) {
      v.finaleT = v.t;
    } else if (k === EV_VICTORY) {
      v.victoryT = v.t;
    } else if (k === EV_TIME) {
      v.timeT = v.t;
      screenOk(v, SE_TIME);
      stamp(v, a === 2 ? ST_OUT : ST_TIME, 0, 200);
      setPose(v, a === 2 ? POSE_SLUMP : POSE_FIST, 100000);
    } else if (k === EV_TIPOVER) {
      v.tipT = v.t;
      stamp(v, ST_TIPOVER, 0, 200);
    } else if (k === EV_REMIX) {
      stamp(v, ST_REMIX, 0, 200);
    } else if (k === EV_SET) {
      v.setT = v.t;
      v.perfStreak = 0;
    } else if (k === EV_PARK) {
      if (a === 1) {
        v.parkT = v.t;
        v.parkSteps = c;
      } else v.parkT = -1e6;
    }
  }
  if (reducedMotion) v.silhouetteT = -1e6;
}

/** Star meter notch pass (render + audio): returns the notch index passed this frame, or -1. */
export function notchPass(v: Vis, score: number, targets: readonly number[]): number {
  'worklet';
  for (let i = v.notchPassed; i < targets.length; i++) {
    if (targets[i] > 0 && score >= targets[i]) {
      v.notchPassed = i + 1;
      v.notchIdx = i;
      v.notchT = v.t;
      return i;
    }
  }
  return -1;
}

/** Per-frame update: clocks, lean spring, pose timeouts, trail, notch glow. */
export function visFrame(v: Vis, s: SimState, frameMs: number, running: boolean): void {
  'worklet';
  const frozen = s.holdTs === 0 && !s.done;
  const scale = s.done ? 1 : (s.holdTs * s.fxTs) / 65536;
  const dt = frameMs * scale;
  v.t += dt;
  v.cloudT += frameMs * (frozen ? 0.1 : 1);
  if (frozen && running) v.frozenMs += frameMs;
  else {
    if (v.frozenMs > 150) v.resumeT = v.t;
    v.frozenMs = 0;
  }
  // Lean (7.1): clamp(vx / 1440) * 18 deg with a spring (reversal overshoot ~3 deg).
  const vxFu = (s.bv / SUB) * 60;
  const target = Math.max(-1, Math.min(1, vxFu / 1440)) * 18;
  if (dt > 0) {
    const h = Math.min(0.033, dt / 1000);
    const kk = 420;
    const damp = 30;
    v.leanV += ((target - v.lean) * kk - v.leanV * damp) * h;
    v.lean += v.leanV * h;
  }
  if (v.pose !== POSE_IDLE && v.t > v.poseUntil) {
    if (v.pose === POSE_BONKED) setPose(v, POSE_DIZZY, 700);
    else v.pose = POSE_IDLE;
  }
  const ax = vxFu < 0 ? -vxFu : vxFu;
  if (vxFu > 30) v.face = -1;
  else if (vxFu < -30) v.face = 1;
  // Speed-cap tell: dust every 3 steps (~50 ms) while sweeping.
  const sweepNow = ax >= 2300 ? 1 : 0;
  if (sweepNow && !v.wasSweeping) v.sweepStartT = v.t;
  v.wasSweeping = sweepNow;
  let show = v.pose;
  if (show === POSE_IDLE && !s.done) {
    if (ax > 60) {
      // Tail-hop shuffle at 4-12 Hz by speed.
      const fps = 4 + (8 * Math.min(840, ax - 60)) / 840;
      const before = Math.floor(v.hopPhase);
      v.hopPhase += (dt / 1000) * fps;
      const now = Math.floor(v.hopPhase);
      if (now !== before && now % 2 === 0) v.hopLand = v.t;
      show = now % 2 === 1 ? POSE_HOP : POSE_IDLE;
    }
    // Focus: an item within 120 fu above the rim inside the zone: chomp anticipation.
    const bx = s.bx;
    for (let i = 0; i < MAX_ITEMS; i++) {
      if (s.iSt[i] !== S_FALL || s.iKind[i] === K_PUFFER) continue;
      const above = LANE_Y * SUB - s.iY[i];
      const dx = s.iX[i] - bx;
      if (above > 0 && above < 70 * SUB && dx < HALF_ZONE * SUB && dx > -HALF_ZONE * SUB) {
        show = POSE_CHOMP;
        break;
      }
    }
  }
  v.show = show;
  // Blink every 2.5-4.5 s (render seed from the clock).
  if (v.t > v.blinkAt) {
    v.blinkT = v.t;
    v.blinkAt = v.t + 2500 + ((Math.floor(v.t) * 7919) % 2000);
  }
  // Ribbon trail (render-only): one sample per frame while the ball is up.
  if (s.bOn === 1 && dt > 0) {
    const i = v.trailHead;
    v.trailX[i] = s.bX / SUB;
    v.trailY[i] = s.bY / SUB;
    v.trailHead = (i + 1) % v.trailX.length;
    if (v.trailN < v.trailX.length) v.trailN += 1;
  } else if (s.bOn !== 1) v.trailN = 0;
  // The snack cart heads for the next pending drop.
  let nextAt = 1 << 30;
  for (let r = 0; r < s.pN; r++) {
    if (s.pKind[r] === K_PUFFER || s.pSpawn[r] >= nextAt) continue;
    nextAt = s.pSpawn[r];
    v.cartX = s.pX[r] / SUB;
  }
  const kc = 1 - Math.exp(-dt / 160);
  v.cartPos += (v.cartX - v.cartPos) * kc;
  // Rim notch glow: the next must-catch banana's landing x inside +-12 fu.
  let soonest = 1 << 30;
  let glow = 0;
  for (let i = 0; i < MAX_ITEMS; i++) {
    if (s.iSt[i] !== S_FALL || s.iKind[i] !== K_BANANA || s.iMust[i] !== 1) continue;
    const left = s.iLand[i] - (s.iAge[i] >> 8);
    if (left < 0 || left >= soonest) continue;
    soonest = left;
    const d = s.iX[i] - s.bx;
    glow = d <= PERFECT_D * SUB && d >= -PERFECT_D * SUB ? 1 : 0;
  }
  const kg = 1 - Math.exp(-frameMs / 50);
  v.notch += (glow - v.notch) * kg;
  void K_COIN;
}

/** Design 7.0 FX budget rows (doc-sync checks the event list against the design). */
export const FX_BUDGET_EVENTS = [
  'CATCH x1-x2', 'CATCH x3-x4', 'PERFECT', 'Bunch', 'POP / gold POP', 'Lucky Bunch POP', 'BONK', 'Coin pip', 'Tier-up',
  'CLOSE CALL', 'Star notch passed', 'Puffer hit', 'Golden Hour entry',
];
