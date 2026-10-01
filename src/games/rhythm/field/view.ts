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

type FxState = unknown;
import {
  EV_BIG_DOUBLE,
  EV_FEVER_ARMED,
  EV_FEVER_DEPLOY,
  EV_FEVER_END,
  EV_FEVER_START,
  EV_FLICK,
  EV_FREEZE_FAULT,
  EV_HIT,
  EV_LAUNCH,
  EV_LIMP,
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
  'CRASH!', 'SWIPE UP TO LAUNCH', 'FEEL THE BEAT', 'PARADE CLEARED', 'PERFECT x8',
  'TAP ON THE BLUE', 'CORAL = THE SIDE', 'BLUE LEFT, CORAL RIGHT', 'KEEP DRUMMING!', 'BACK IN STEP!', 'FEVER ON THE DROP',
  'FULL CHART', 'HIDDEN DARE!',
];
export const RB_DARE = 29;
export const RB_TAP_BLUE = 22;
export const RB_CORAL_SIDE = 23;
export const RB_TWO_THUMBS = 24;
export const RB_LIMP = 25;
export const RB_UNLIMP = 26;
export const RB_QUEUED = 27;
export const RB_FULL = 28;
export const RB_HOLD = 9;
export const RB_TWO_FINGERS = 10;
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
  /** Analytic bursts (drawn by ParadeField): type 0 gold stars, 1 sky stars, 2 white stars, 3 firework, 4 confetti, 5 grey puff. */
  bAt: number[];
  bType: number[];
  bX: number[];
  bY: number[];
  bN: number[];
  bHead: number;
  /** World-layer flash (never over the reading surface). */
  flashAt: number;
  flashPeak: number;
  reduced: number;
  pocket: number;
  /** Drum-face overexposure disc (PERFECT, 1 frame) at the touch point. */
  overAt: number;
  overX: number;
  overY: number;
  /** Ripple ring on the drum face. */
  rippleAt: number;
  rippleAmp: number;
  /** Struck-zone flash (the span holding zoneFlashX). */
  zoneFlashAt: number;
  zoneFlashX: number;
  zoneFlashKind: number;
  /** Lane-edge spark kick: 2 per rail on PERFECT, 1 on GREAT. */
  railSparkAt: number;
  railSparkN: number;
  /** Fever drop moment (bloom pulse, crowd jump). */
  dropAt: number;
  /** Launch Swipe streak. */
  launchAt: number;
  launchX: number;
  limping: number;
  /** Per-hit text side: alternates left / right of the lane. */
  judgSide: number;
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
    perfRun: 0,
    bAt: z(24), bType: z(24, 0), bX: z(24, 0), bY: z(24, 0), bN: z(24, 0), bHead: 0, flashAt: -1e9, flashPeak: 0,
    reduced: 0, pocket: 0,
    overAt: -1e9, overX: 0, overY: 0, rippleAt: -1e9, rippleAmp: 0,
    zoneFlashAt: -1e9, zoneFlashX: 0, zoneFlashKind: 0,
    railSparkAt: -1e9, railSparkN: 0, dropAt: -1e9, launchAt: -1e9, launchX: 0, limping: 0, judgSide: 0,
    countBeats,
    cx, yLine, width,
  };
}

export const B_GOLD = 0;
export const B_SKY = 1;
export const B_WHITE = 2;
export const B_FIREWORK = 3;
export const B_CONFETTI = 4;
export const B_PUFF = 5;
export const B_FEVER = 6;

export function addBurst(v: ParadeView, type: number, x: number, y: number, n: number): void {
  'worklet';
  const k = v.bHead;
  v.bAt[k] = v.wt;
  v.bType[k] = type;
  v.bX[k] = x;
  v.bY[k] = y;
  v.bN[k] = v.reduced ? Math.min(n, 6) : n;
  v.bHead = (k + 1) % v.bAt.length;
}

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
  if (fx || true) {
    for (let i = 0; i < v.fwAt.length; i++) {
      if (v.fwAt[i] > 0 && v.wt >= v.fwAt[i]) {
        v.fwAt[i] = -1e9;
        addBurst(v, B_FIREWORK, v.fwX[i], v.fwY[i], 32);
      }
    }
  }
}

/** Moments that own the ribbon for a while (a milestone never covers the Fever drop). */
function ribbonRank(id: number): number {
  'worklet';
  return id === RB_FEVER || id === RB_FULL_COMBO || id === RB_STALL ? 2 : id === 0 ? 0 : 1;
}

function ribbon(v: ParadeView, id: number): void {
  'worklet';
  if (v.ribbon && v.wt - v.ribbonAt < 1100 && ribbonRank(v.ribbon) > ribbonRank(id)) return;
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
      v.judgSide = 1 - v.judgSide;
      v.judgTxt = b === J_SHARP ? TXT_SHARP : b === J_PERFECT ? TXT_PERFECT : b === J_GREAT ? TXT_GREAT : TXT_GOOD;
      v.judgFS = (b === J_GREAT || b === J_GOOD) && Math.abs(c) >= 20 ? (c < 0 ? 1 : 2) : 0;
      v.strikeAt = v.wt;
      v.zoneFlashAt = v.wt;
      v.zoneFlashX = v.touchX;
      v.zoneFlashKind = rim;
      v.rippleAt = v.wt;
      v.rippleAmp = b <= J_PERFECT ? 1 : b === J_GREAT ? 0.6 : 0.35;
      if (b <= J_PERFECT) {
        v.overAt = v.wt;
        v.overX = v.touchX;
        v.overY = v.touchY;
      }
      if (b <= J_GREAT) {
        v.railSparkAt = v.wt;
        v.railSparkN = b <= J_PERFECT ? 2 : 1;
      }
      if (rim) {
        v.rimAt = v.wt;
        v.rimSide = v.touchZone === 2 || v.touchZone === 4 ? 1 : 0;
      } else {
        // RIM hits do not squash the head (design 6.3).
        v.drumAt = v.wt;
        v.drumAmt = b === J_SHARP ? 0.16 : b === J_PERFECT ? 0.14 : b === J_GREAT ? 0.1 : 0.06;
      }
      pushErr(v, c);
      v.perfRun = b <= J_PERFECT ? v.perfRun + 1 : 0;
      if (v.perfRun === 8) ribbon(v, 21);
      {
        const n = b <= J_PERFECT ? 10 : b === J_GREAT ? 6 : 3;
        const x = v.cx;
        addBurst(v, fever ? B_FEVER : rim ? B_SKY : b <= J_PERFECT ? B_GOLD : B_WHITE, x, v.yLine - 6, fever ? Math.round(n * 1.5) : n);
        if (s.kind[a] === K_BIG) {
          scheduleFireworks(v, 3, true);
          if (s.bar[a] === s.lastBar) {
            // Finale BIG: the only camera move in the game (design 6.0, 6.6).
            v.zoomAt = v.wt;
            v.zoomAmt = 0.06;
            v.shakeAt = v.wt;
            v.shakeAmp = 5;
            v.lineFull = 1;
            v.flashAt = v.wt;
            v.flashPeak = 0.3;
          }
        }
      }
    } else if (kind === EV_MISS) {
      v.missAt[a] = v.wt;
      v.judgAt = v.wt;
      v.judgSide = 1 - v.judgSide;
      v.judgTxt = TXT_MISS;
      v.judgFS = 0;
      v.perfRun = 0;
      v.crowdSitAt = v.wt;
      if (b === 1) {
        v.stumbleAt = v.wt;
        v.drumAt = v.wt;
        v.drumAmt = -0.06;
        addBurst(v, B_PUFF, v.cx, v.yLine - 4, 3);
      }
    } else if (kind === EV_WRONG) {
      v.judgAt = v.wt;
      v.judgSide = 1 - v.judgSide;
      v.judgTxt = TXT_OTHER_SIDE;
      v.judgFS = 0;
      v.perfRun = 0;
      v.rimAt = v.wt - 60;
      addBurst(v, B_PUFF, v.cx, v.yLine - 4, 1);
    } else if (kind === EV_STRAY) {
      addBurst(v, B_PUFF, v.touchX, v.touchY, 2);
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
      if (b % 2 === 0) addBurst(v, fever ? B_FEVER : B_GOLD, v.cx, v.yLine - 6, 3);
    } else if (kind === EV_ROLL_BREAK) {
      v.judgAt = v.wt;
      v.judgTxt = TXT_MISS;
      v.stumbleAt = v.wt;
    } else if (kind === EV_BIG_DOUBLE) {
      scheduleFireworks(v, 4, true);
      addBurst(v, B_CONFETTI, v.cx, v.yLine - 40, 36);
    } else if (kind === EV_FLICK) {
      addBurst(v, B_GOLD, v.cx, v.yLine - 20, 8);
    } else if (kind === EV_POPPER_TAP) {
      v.popperAt = v.wt;
      v.popperTaps = b;
      v.drumAt = v.wt;
      v.drumAmt = 0.08;
      addBurst(v, B_WHITE, v.cx, v.yLine - 10, 4);
    } else if (kind === EV_POPPER_POP) {
      v.judgAt = v.wt;
      v.judgTxt = TXT_POP;
      v.judgFS = 0;
      v.popperTaps = 0;
      addBurst(v, B_CONFETTI, v.cx, v.yLine - 30, 30);
    } else if (kind === EV_LIMP) {
      v.limping = a;
      if (a) {
        v.stumbleAt = v.wt;
        ribbon(v, RB_LIMP);
      } else ribbon(v, RB_UNLIMP);
    } else if (kind === EV_LAUNCH) {
      v.launchAt = v.wt;
      v.launchX = v.touchX;
      ribbon(v, RB_QUEUED);
    } else if (kind === EV_FEVER_ARMED) {
      v.armed = 1;
    } else if (kind === EV_FEVER_DEPLOY) {
      v.armed = 0;
    } else if (kind === EV_FEVER_START) {
      // The drop (design 6.5): light, sound and touch; the camera never moves.
      v.feverTarget = 1;
      v.armed = 0;
      v.dropAt = v.wt;
      ribbon(v, RB_FEVER);
      scheduleFireworks(v, 3, false);
      v.flashAt = v.wt;
      v.flashPeak = 0.5;
    } else if (kind === EV_FEVER_END) {
      v.feverTarget = 0;
    } else if (kind === EV_MILESTONE) {
      v.milestoneAt = v.wt;
      ribbon(v, a >= 100 ? 5 : a >= 50 ? 4 : a >= 25 ? 3 : 2);
      addBurst(v, B_CONFETTI, v.width * 0.5, 40, 30);
    } else if (kind === EV_STALL) {
      v.stallAt = v.wt;
      ribbon(v, RB_STALL);
    }
  }
  // Crowd tier follows the live combo (design 6.4).
  const combo = s.combo;
  v.crowdTarget = s.limping ? 6 : combo >= 50 ? 22 : combo >= 25 ? 16 : combo >= 10 ? 10 : 6;
}

export function showRibbon(v: ParadeView, id: number): void {
  'worklet';
  ribbon(v, id);
}

export { J_GOOD };
