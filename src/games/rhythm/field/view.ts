/**
 * view: the UI-thread presentation state of a Parade Beat round.
 *
 * The judge (core/judge.ts) owns the rules; this struct owns the look: hit
 * flashes, rings, judgment text, drum squash, drum major poses, Fever and
 * March tweens, the hit-error bar, crowd tier and moment ribbons. Events from
 * the judge are applied here on the UI thread in the same frame (gesture or
 * frame callback), so a hit shows before JS even hears about it.
 *
 * Reading-surface rule (design 6.0): nothing here ever moves the lane or the
 * notes. Shake, zoom and flashes live in the world group only.
 */

import { EMITTERS, packHex, type EmitterDef } from '../../../gamekit/core/particles';
import { fxEmitUI, fxFlashUI, type FxState } from '../../../gamekit/fx/FxStage';
import {
  EV_BIG_DOUBLE,
  EV_FEVER_ARMED,
  EV_FEVER_DEPLOY,
  EV_FEVER_END,
  EV_FEVER_START,
  EV_FLICK,
  EV_FREEZE_FAULT,
  EV_HIT,
  EV_MILESTONE,
  EV_MISS,
  EV_OOS,
  EV_POPPER_POP,
  EV_POPPER_TAP,
  EV_ROLL_BREAK,
  EV_ROLL_TICK,
  EV_STALL,
  EV_STRAY,
  EV_WRONG,
  type JudgeState,
} from '../core/judge';
import { J_GOOD, J_GREAT, J_PERFECT, J_SHARP, K_BIG, K_RIM } from '../core/types';

export const TXT_NONE = 0;
export const TXT_SHARP = 1;
export const TXT_PERFECT = 2;
export const TXT_GREAT = 3;
export const TXT_GOOD = 4;
export const TXT_MISS = 5;
export const TXT_OTHER_SIDE = 6;
export const TXT_OOS = 7;
export const TXT_DONT_TAP = 8;
export const TXT_POP = 9;

export const JUDGE_TEXT = ['', 'SHARP', 'PERFECT', 'GREAT', 'GOOD', 'MISS', 'OTHER SIDE', 'OUT OF STEP', "DON'T TAP", 'POP!'];

/** Ribbon messages (index into RIBBON_TEXT). */
export const RIBBON_TEXT = [
  '', 'FIREWORK FEVER', 'COMBO 10', 'COMBO 25', 'COMBO 50', 'COMBO 100', 'MARCHING', 'TAP ON THE BEAT', 'HIT THE SIDE',
  'HOLD', 'TWO FINGERS!', 'POP IT', "DON'T TAP", 'FLICK UP', 'FULL COMBO', 'THE PARADE NEEDS YOU!', 'LISTEN... NOW YOU',
  'CRASH!', 'READY TO LAUNCH', 'FEEL THE BEAT', 'PARADE CLEARED', 'SHARP x8',
];
export const RB_FEVER = 1;
export const RB_MARCH = 6;
export const RB_READY = 18;
export const RB_STALL = 15;
export const RB_FULL_COMBO = 14;

export interface ParadeView {
  /** Visual song time (clock - offset), ms. */
  now: number;
  /** World time (ms, always advancing while playing; drives tweens). */
  wt: number;
  lineAt: number;
  lineFull: number;
  ringAt: number;
  ringGrade: number;
  ringRim: number;
  judgAt: number;
  judgTxt: number;
  judgFS: number;
  drumAt: number;
  drumAmt: number;
  rimAt: number;
  rimSide: number;
  strikeAt: number;
  stumbleAt: number;
  bonkAt: number;
  drumDimUntil: number;
  shakeAt: number;
  shakeAmp: number;
  zoomAt: number;
  zoomAmt: number;
  fever: number;
  feverTarget: number;
  armed: number;
  march: number;
  marchTarget: number;
  errV: number[];
  errT: number[];
  errHead: number;
  crowdTarget: number;
  crowd: number;
  crowdSitAt: number;
  milestoneAt: number;
  ribbon: number;
  ribbonAt: number;
  stallAt: number;
  popperAt: number;
  popperTaps: number;
  /** Touch point of the latest touch-down (for puffs) and its zone. */
  touchX: number;
  touchY: number;
  touchZone: number;
  /** Input is ignored before this song time (resume pre-roll). */
  inputFrom: number;
  /** Per note: time it was missed (falling grey drop) or hit (1-frame flash). */
  missAt: number[];
  hitAt: number[];
  /** Firework bursts scheduled on the world clock. */
  fwAt: number[];
  fwX: number[];
  fwY: number[];
  /** Consecutive PERFECT-or-better run (SHARP x8 ribbon, glock throttle). */
  perfRun: number;
  reduced: number;
  pocket: number;
  /** Count-in numerals 4-3-2-1 run on these 5 beat times (pre-roll or resume bar). */
  countBeats: number[];
  // geometry
  cx: number;
  yLine: number;
  width: number;
}

export function createView(n: number, cx: number, yLine: number, width: number, countBeats: number[] = [-1e9, -1e9, -1e9, -1e9, -1e9]): ParadeView {
  const z = (k: number, v = -1e9): number[] => {
    const a: number[] = [];
    for (let i = 0; i < k; i++) a.push(v);
    return a;
  };
  return {
    now: -1e9, wt: 0,
    lineAt: -1e9, lineFull: 0, ringAt: -1e9, ringGrade: 0, ringRim: 0,
    judgAt: -1e9, judgTxt: 0, judgFS: 0,
    drumAt: -1e9, drumAmt: 0, rimAt: -1e9, rimSide: 0,
    strikeAt: -1e9, stumbleAt: -1e9, bonkAt: -1e9, drumDimUntil: -1e9,
    shakeAt: -1e9, shakeAmp: 0, zoomAt: -1e9, zoomAmt: 0,
    fever: 0, feverTarget: 0, armed: 0, march: 0, marchTarget: 0,
    errV: z(16, 0), errT: z(16), errHead: 0,
    crowdTarget: 6, crowd: 6, crowdSitAt: -1e9, milestoneAt: -1e9,
    ribbon: 0, ribbonAt: -1e9, stallAt: -1e9, popperAt: -1e9, popperTaps: 0,
    touchX: 0, touchY: 0, touchZone: 0, inputFrom: -1e9,
    missAt: z(n), hitAt: z(n),
    fwAt: z(6), fwX: z(6, 0), fwY: z(6, 0),
    perfRun: 0, reduced: 0, pocket: 0,
    countBeats,
    cx, yLine, width,
  };
}

// FX emitters tuned for the parade (sprite-stamped, navy-outlined atlas cells).
const HIT_STARS: EmitterDef = { ...EMITTERS.stars, angle: -90, spread: 140, speed: [400, 650], life: [0.3, 0.38], gravity: 900 };
const RIM_STARS: EmitterDef = { ...HIT_STARS, colors: [packHex('#bfe9ff'), packHex('#ffffff')] };
const GOLD_STARS: EmitterDef = { ...HIT_STARS, colors: [packHex('#ffcf3b'), packHex('#ffffff')] };
const FEVER_STARS: EmitterDef = { ...HIT_STARS, colors: [packHex('#ffffff'), packHex('#7fd4ff'), packHex('#ff8a6b')] };
const PUFF: EmitterDef = { ...EMITTERS.puff, count: [2, 3], life: [0.2, 0.26] };
const FIREWORK: EmitterDef = {
  ...EMITTERS.sparks, count: [30, 36], speed: [260, 420], spread: 360, life: [0.8, 0.95], gravity: 220, drag: 1.4,
  colors: [packHex('#ffffff'), packHex('#7fd4ff'), packHex('#ff8a6b')],
};
const CONFETTI: EmitterDef = { ...EMITTERS.confetti, count: [26, 34] };

export function pushErr(v: ParadeView, delta: number): void {
  'worklet';
  v.errV[v.errHead] = delta;
  v.errT[v.errHead] = v.wt;
  v.errHead = (v.errHead + 1) % v.errV.length;
}

export function scheduleFireworks(v: ParadeView, count: number, big: boolean): void {
  'worklet';
  const w = v.width;
  for (let k = 0; k < count && k < v.fwAt.length; k++) {
    v.fwAt[k] = v.wt + k * 250;
    v.fwX[k] = w * (0.16 + ((k * 0.37 + (big ? 0.11 : 0)) % 0.7));
    v.fwY[k] = 40 + ((k * 53) % 90);
  }
}

/** Step tweens and scheduled world FX (UI thread, every frame). */
export function stepView(v: ParadeView, fx: FxState | null, dt: number): void {
  'worklet';
  v.wt += dt;
  const k = Math.min(1, dt / 400);
  v.fever += (v.feverTarget - v.fever) * (v.feverTarget > v.fever ? k * 1.0 : k * 0.66);
  const km = Math.min(1, dt / 450);
  v.march += (v.marchTarget - v.march) * km;
  v.crowd += (v.crowdTarget - v.crowd) * Math.min(1, dt / 400);
  if (fx) {
    for (let i = 0; i < v.fwAt.length; i++) {
      if (v.fwAt[i] > 0 && v.wt >= v.fwAt[i]) {
        v.fwAt[i] = -1e9;
        fxEmitUI(fx, FIREWORK, v.fwX[i], v.fwY[i], v.reduced ? { count: 12 } : {});
      }
    }
  }
}

function ribbon(v: ParadeView, id: number): void {
  'worklet';
  v.ribbon = id;
  v.ribbonAt = v.wt;
}

/**
 * Apply one drained judge batch to the view and the FX stage. Same frame as
 * the touch (gesture worklet) or the tick (frame callback).
 */
export function applyEventsUI(v: ParadeView, s: JudgeState, fx: FxState | null, batch: number[]): void {
  'worklet';
  for (let i = 0; i + 4 < batch.length; i += 5) {
    const kind = batch[i];
    const a = batch[i + 1];
    const b = batch[i + 2];
    const c = batch[i + 3];
    const fever = v.feverTarget > 0.5;
    if (kind === EV_HIT) {
      const rim = s.kind[a] === K_RIM ? 1 : 0;
      v.hitAt[a] = v.wt;
      v.lineAt = v.wt;
      v.lineFull = b === J_SHARP ? 1 : 0;
      v.ringAt = v.wt;
      v.ringGrade = b;
      v.ringRim = rim;
      v.judgAt = v.wt;
      v.judgTxt = b === J_SHARP ? TXT_SHARP : b === J_PERFECT ? TXT_PERFECT : b === J_GREAT ? TXT_GREAT : TXT_GOOD;
      v.judgFS = (b === J_GREAT || b === J_GOOD) && Math.abs(c) >= 20 ? (c < 0 ? 1 : 2) : 0;
      v.strikeAt = v.wt;
      if (rim) {
        v.rimAt = v.wt;
        v.rimSide = v.touchZone === 2 || v.touchZone === 4 ? 1 : 0;
      } else {
        v.drumAt = v.wt;
        v.drumAmt = b === J_SHARP ? 0.16 : b === J_PERFECT ? 0.14 : b === J_GREAT ? 0.1 : 0.06;
      }
      pushErr(v, c);
      v.perfRun = b <= J_PERFECT ? v.perfRun + 1 : 0;
      if (v.perfRun === 8) ribbon(v, 21);
      if (fx) {
        const n = b <= J_PERFECT ? 8 : b === J_GREAT ? 5 : 3;
        const def = fever ? FEVER_STARS : rim ? RIM_STARS : b <= J_PERFECT ? GOLD_STARS : HIT_STARS;
        const x = rim ? (v.rimSide ? v.cx + 44 : v.cx - 44) : v.cx;
        fxEmitUI(fx, def, x, v.yLine - 6, { count: fever ? Math.round(n * 1.5) : n });
        if (s.kind[a] === K_BIG) scheduleFireworks(v, 3, true);
      }
    } else if (kind === EV_MISS) {
      v.missAt[a] = v.wt;
      v.judgAt = v.wt;
      v.judgTxt = TXT_MISS;
      v.judgFS = 0;
      v.perfRun = 0;
      v.crowdSitAt = v.wt;
      if (b === 1) {
        v.stumbleAt = v.wt;
        v.drumAt = v.wt;
        v.drumAmt = -0.06;
        if (fx) fxEmitUI(fx, PUFF, v.cx, v.yLine - 4, { count: 3 });
      }
    } else if (kind === EV_WRONG) {
      v.judgAt = v.wt;
      v.judgTxt = TXT_OTHER_SIDE;
      v.judgFS = 0;
      v.perfRun = 0;
      v.rimAt = v.wt - 60;
      if (fx) fxEmitUI(fx, PUFF, v.cx, v.yLine - 4, { count: 1 });
    } else if (kind === EV_STRAY) {
      if (fx) fxEmitUI(fx, PUFF, v.touchX, v.touchY, { count: 2 });
    } else if (kind === EV_OOS) {
      v.judgAt = v.wt;
      v.judgTxt = TXT_OOS;
      v.judgFS = 0;
      v.drumDimUntil = v.wt + (a - s.now);
      v.bonkAt = v.wt;
      v.stumbleAt = v.wt;
      v.perfRun = 0;
    } else if (kind === EV_FREEZE_FAULT) {
      v.judgAt = v.wt;
      v.judgTxt = TXT_DONT_TAP;
      v.judgFS = 0;
      v.missAt[a] = v.wt;
    } else if (kind === EV_ROLL_TICK) {
      v.drumAt = v.wt;
      v.drumAmt = 0.05;
      if (fx && b % 2 === 0) fxEmitUI(fx, fever ? FEVER_STARS : GOLD_STARS, v.cx, v.yLine - 6, { count: 2 });
    } else if (kind === EV_ROLL_BREAK) {
      v.judgAt = v.wt;
      v.judgTxt = TXT_MISS;
      v.stumbleAt = v.wt;
    } else if (kind === EV_BIG_DOUBLE) {
      v.zoomAt = v.wt;
      v.zoomAmt = 0.06;
      v.shakeAt = v.wt;
      v.shakeAmp = 5;
      scheduleFireworks(v, 3, true);
      if (fx) fxFlashUI(fx, [1, 0.95, 0.8, 1], 0.3, 140);
    } else if (kind === EV_FLICK) {
      if (fx) fxEmitUI(fx, GOLD_STARS, v.cx, v.yLine - 20, { count: 6 });
    } else if (kind === EV_POPPER_TAP) {
      v.popperAt = v.wt;
      v.popperTaps = b;
      v.drumAt = v.wt;
      v.drumAmt = 0.08;
      if (fx) fxEmitUI(fx, EMITTERS.glints, v.cx, v.yLine - 10, {});
    } else if (kind === EV_POPPER_POP) {
      v.judgAt = v.wt;
      v.judgTxt = TXT_POP;
      v.judgFS = 0;
      v.popperTaps = 0;
      if (fx) fxEmitUI(fx, CONFETTI, v.cx, v.yLine - 30, {});
    } else if (kind === EV_FEVER_ARMED) {
      v.armed = 1;
    } else if (kind === EV_FEVER_DEPLOY) {
      v.armed = 0;
    } else if (kind === EV_FEVER_START) {
      v.feverTarget = 1;
      v.armed = 0;
      v.shakeAt = v.wt;
      v.shakeAmp = 4;
      ribbon(v, RB_FEVER);
      scheduleFireworks(v, 3, false);
      if (fx) fxFlashUI(fx, [1, 0.93, 0.7, 1], 0.35, 260);
    } else if (kind === EV_FEVER_END) {
      v.feverTarget = 0;
    } else if (kind === EV_MILESTONE) {
      v.milestoneAt = v.wt;
      ribbon(v, a >= 100 ? 5 : a >= 50 ? 4 : a >= 25 ? 3 : 2);
      if (fx) fxEmitUI(fx, CONFETTI, v.width * 0.5, 60, v.reduced ? { count: 8 } : {});
    } else if (kind === EV_STALL) {
      v.stallAt = v.wt;
      ribbon(v, RB_STALL);
    }
  }
  // Crowd tier follows the live combo (design 6.4).
  const combo = s.combo;
  v.crowdTarget = combo >= 50 ? 22 : combo >= 25 ? 16 : combo >= 10 ? 10 : 6;
}

export function showRibbon(v: ParadeView, id: number): void {
  'worklet';
  ribbon(v, id);
}

export { J_GOOD };
