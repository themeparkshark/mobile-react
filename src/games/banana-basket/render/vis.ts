/**
 * Render-only animation state (UI thread). The sim's events feed it on the
 * same step they happen, so squash, poses, stamps and the score chip land on
 * the exact frame of the catch with no JS round trip. Nothing here touches
 * the score or the proof.
 */

import {
  G_GREAT, G_PERFECT, G_POP, K_BUNCH, K_COIN, K_LUCKY, LANE_Y,
} from '../constants';
import {
  EV_BALL_LOST, EV_BALL_POP, EV_BONK, EV_BOUNCE, EV_BREAK, EV_CATCH, EV_CLOSE, EV_FINALE, EV_GOLD_BALL, EV_GOLDEN,
  EV_GRAZE, EV_HIT, EV_MISS, EV_POWER, EV_RIM, EV_RUSH, EV_SAVE, EV_SPLAT, EV_SPLASH, EV_TIER, EV_TIME, EV_TIPOVER,
  EV_BANK, EV_SET, type SimState,
} from '../state';

export const POSE_IDLE = 0;
export const POSE_CHEER = 1;
export const POSE_BONKED = 2;
export const POSE_DIZZY = 3;
export const POSE_FIST = 4;

// Stamp texts (index into STAMP_TEXT).
export const ST_NONE = 0;
export const ST_PERFECT = 1;
export const ST_GREAT = 2;
export const ST_GOOD = 3;
export const ST_SAVE = 4;
export const ST_CLOSE = 5;
export const ST_GRAZE = 6;
export const ST_GOLDEN = 7;
export const ST_RUSH = 8;
export const ST_TIME = 9;
export const ST_BONK = 10;
export const ST_BOOST = 11;
export const ST_TIER2 = 12;
export const ST_TIER3 = 13;
export const ST_TIER4 = 14;
export const ST_TIPOVER = 15;
export const ST_BANKED = 16;
export const ST_CHAIN_FREEZE = 17;
export const ST_OUT = 18;
export const ST_DODGE = 19;
export const ST_GOLD_BALL = 20;
export const ST_POP = 21;
export const ST_FINGER = 22;
export const ST_WATCH = 23;

export const STAMP_TEXT = [
  '', 'PERFECT', 'GREAT', 'GOOD', 'SAVE!', 'CLOSE CALL', 'GRAZE +100', 'GOLDEN HOUR!', 'FINAL RUSH! FASTER!', 'TIME!',
  'BONK!', 'BOOST x2!', 'CHAIN x2', 'CHAIN x3', 'CHAIN x4', 'CART TIP-OVER!', 'GOLDEN BANK +250', 'CHAIN FREEZE',
  'OUT OF HEARTS', 'DODGE!', 'GOLD BALL!', 'BALL POP!', 'FOAM FINGER!', '+3 SECONDS',
];

export const MAX_SPLATS = 12;

export interface Vis {
  /** Presentation ms (freezes with the world). */
  t: number;
  /** Cloud clock (10% speed while frozen). */
  cloudT: number;
  frozenMs: number;
  lean: number;
  squashT: number;
  squashAmt: number;
  pose: number;
  poseUntil: number;
  flashT: number;
  silhouetteT: number;
  chipT: number;
  chipGain: number;
  chipTier: number;
  scoreShown: number;
  badgeT: number;
  badgeShakeT: number;
  heartT: number;
  heartIdx: number;
  stamp: number;
  stampT: number;
  stampSuffix: number;
  earlyStamps: number;
  ghStartT: number;
  ghEndT: number;
  rushT: number;
  finaleT: number;
  timeT: number;
  splatX: number[];
  splatY: number[];
  splatK: number[];
  splatT: number[];
  splatHead: number;
  lastBounceT: number;
  ballSquashT: number;
  boostT: number;
  catchX: number;
  tierFlashT: number;
  resumeT: number;
  tipT: number;
}

function stamp(v: Vis, id: number, suffix: number): void {
  'worklet';
  v.stamp = id;
  v.stampT = v.t;
  v.stampSuffix = suffix;
}

export function createVis(): Vis {
  'worklet';
  const z = (n: number, v: number) => {
    const a: number[] = [];
    for (let i = 0; i < n; i++) a.push(v);
    return a;
  };
  return {
    t: 0,
    cloudT: 0,
    frozenMs: 0,
    lean: 0,
    squashT: -1e6,
    squashAmt: 0,
    pose: POSE_IDLE,
    poseUntil: 0,
    flashT: -1e6,
    silhouetteT: -1e6,
    chipT: -1e6,
    chipGain: 0,
    chipTier: 1,
    scoreShown: 0,
    badgeT: -1e6,
    badgeShakeT: -1e6,
    heartT: -1e6,
    heartIdx: -1,
    stamp: ST_NONE,
    stampT: -1e6,
    stampSuffix: 0,
    earlyStamps: 0,
    ghStartT: -1e6,
    ghEndT: -1e6,
    rushT: -1e6,
    finaleT: -1e6,
    timeT: -1e6,
    splatX: z(MAX_SPLATS, 0),
    splatY: z(MAX_SPLATS, 0),
    splatK: z(MAX_SPLATS, 0),
    splatT: z(MAX_SPLATS, -1e6),
    splatHead: 0,
    lastBounceT: -1e6,
    ballSquashT: -1e6,
    boostT: -1e6,
    catchX: 200,
    tierFlashT: -1e6,
    resumeT: -1e6,
    tipT: -1e6,
  };
}

function setPose(v: Vis, pose: number, ms: number): void {
  'worklet';
  v.pose = pose;
  v.poseUntil = v.t + ms;
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
      const tier = (b >> 8) & 15;
      v.squashT = v.t;
      v.squashAmt = kind === K_BUNCH || kind === K_LUCKY ? 1.4 : grade >= G_PERFECT ? 1.15 : 1;
      v.chipT = v.t;
      v.chipGain = c & 0xffff;
      v.chipTier = tier;
      v.catchX = a;
      if (grade === G_PERFECT) {
        setPose(v, POSE_CHEER, 180);
        v.flashT = v.t;
        if (s.perfStreak >= 3) stamp(v, ST_PERFECT, s.perfStreak);
      }
      if (v.earlyStamps < 3 && kind !== K_COIN && grade < G_POP) {
        v.earlyStamps += 1;
        stamp(v, grade === G_PERFECT ? ST_PERFECT : grade === G_GREAT ? ST_GREAT : ST_GOOD, 0);
      }
    } else if (k === EV_SAVE) {
      stamp(v, ST_SAVE, 0);
    } else if (k === EV_MISS) {
      if (c === 1) v.badgeShakeT = v.t;
    } else if (k === EV_SPLAT) {
      const i = v.splatHead;
      v.splatX[i] = a;
      v.splatY[i] = LANE_Y + 110 + ((a * 7) % 14);
      v.splatK[i] = b;
      v.splatT[i] = v.t;
      v.splatHead = (i + 1) % MAX_SPLATS;
    } else if (k === EV_HIT) {
      setPose(v, POSE_BONKED, 120);
      v.poseUntil = v.t + 120;
      v.silhouetteT = v.t;
      v.heartT = v.t;
      v.heartIdx = b;
    } else if (k === EV_CLOSE) {
      stamp(v, ST_CLOSE, 0);
    } else if (k === EV_GRAZE) {
      stamp(v, ST_GRAZE, 0);
    } else if (k === EV_BOUNCE) {
      v.ballSquashT = v.t;
      v.lastBounceT = v.t;
      if (b === 1) {
        v.boostT = v.t;
        stamp(v, ST_BOOST, 0);
      }
    } else if (k === EV_GOLD_BALL) {
      stamp(v, ST_GOLD_BALL, 0);
      v.flashT = v.t;
    } else if (k === EV_BALL_POP) {
      v.flashT = v.t;
    } else if (k === EV_BONK) {
      stamp(v, ST_BONK, 0);
      v.flashT = v.t;
    } else if (k === EV_BALL_LOST) {
      v.boostT = -1e6;
    } else if (k === EV_TIER) {
      v.badgeT = v.t;
      v.tierFlashT = v.t;
      stamp(v, a === 2 ? ST_TIER2 : a === 3 ? ST_TIER3 : ST_TIER4, 0);
    } else if (k === EV_BREAK) {
      v.badgeShakeT = v.t;
    } else if (k === EV_GOLDEN) {
      if (a === 1) {
        v.ghStartT = v.t;
        stamp(v, ST_GOLDEN, 0);
      } else if (a === 3) v.ghEndT = v.t;
    } else if (k === EV_BANK) {
      stamp(v, ST_BANKED, 0);
    } else if (k === EV_RUSH) {
      if (a === 2) {
        v.rushT = v.t;
        stamp(v, ST_RUSH, 0);
      }
    } else if (k === EV_FINALE) {
      v.finaleT = v.t;
    } else if (k === EV_TIME) {
      v.timeT = v.t;
      stamp(v, a === 2 ? ST_OUT : ST_TIME, 0);
      setPose(v, a === 2 ? POSE_DIZZY : POSE_FIST, 100000);
    } else if (k === EV_TIPOVER) {
      v.tipT = v.t;
      stamp(v, ST_TIPOVER, 0);
    } else if (k === EV_SPLASH) {
      if (a === 2) stamp(v, ST_CHAIN_FREEZE, 0);
    } else if (k === EV_POWER) {
      if (a === 7 && b === 1) stamp(v, ST_FINGER, 0);
      if (a === 8 && b === 1) stamp(v, ST_WATCH, 0);
    } else if (k === EV_SET) {
      v.earlyStamps = 3;
    } else if (k === EV_RIM) {
      // the rolling item is drawn from the sim; nothing extra
    }
  }
  if (reducedMotion) v.silhouetteT = -1e6;
}

/** Per-frame update: clocks, lean spring, pose timeouts, rolling score. */
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
  // Lean: clamp(vx / cap) * 12 deg, smoothed ~60 ms.
  const target = Math.max(-1, Math.min(1, s.bv / 6144)) * 12;
  const k = 1 - Math.exp(-frameMs / 60);
  v.lean += (target - v.lean) * k;
  if (v.pose !== POSE_IDLE && v.t > v.poseUntil) {
    if (v.pose === POSE_BONKED) setPose(v, POSE_DIZZY, 700);
    else v.pose = POSE_IDLE;
  }
  // Rolling total (in step with the ladder note).
  const total = s.score + s.bonus;
  if (v.scoreShown < total) {
    const d = total - v.scoreShown;
    v.scoreShown += Math.max(1, Math.ceil(d * Math.min(1, frameMs / 120)));
    if (v.scoreShown > total) v.scoreShown = total;
  } else if (v.scoreShown > total) v.scoreShown = total;
}
