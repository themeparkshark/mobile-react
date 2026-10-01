/**
 * judge: the Parade Beat rules as a pure reducer (design sections 4-5).
 *
 * One mutable struct (JudgeState) holds the round. It is driven by four
 * inputs, all in song time (ms, after the player's offset):
 *
 *   judgeDown(s, t, zone, pointerId, y)  touch-down (judged on DOWN, never up)
 *   judgeMove(s, t, pointerId, y)        flick tracking for CYMBAL at d3
 *   judgeUp(s, t, pointerId)             ROLL release
 *   judgeTick(s, now)                    auto-miss, ROLL ticks, Fever bar lines,
 *                                        March layer locks, stall
 *
 * Every function carries 'worklet', so the exact same code runs on the UI
 * thread (gesture + frame callbacks), in node tests and in the replay used by
 * the proof; the PHP twin ports it line for line. Feedback leaves through the
 * engine's event ring (one runOnJS per frame).
 *
 * Rules implemented (section refs):
 *   4.1 earliest-candidate consumption, zones + WRONG SIDE, CYMBAL flick,
 *       ROLL hold, BIG two-finger double
 *   4.2 groove / fever meter / combo deltas
 *   3.6 Groove: queue rounds Limp at 0 (x1, no Fever until 30), never end;
 *       the ride sprint stalls at 0
 *   4.3 Firework Fever (rev 6): armed at 100, launched by a one-finger
 *       Launch Swipe (or a meter tap), queued for the next drop line (the
 *       first bar of a section), one whole section x2, fizzle on MISS
 *   4.4 anti-mash: consumption, pending stray drain, Out of Step lockout
 *   4.6 March layer (rev 6): chosen by the player (pill), locked per 4-bar
 *       section at sectionStart - approach - 1 beat, zones ignored, softer
 *       MISS and STRAY, identical windows and points
 *   3.5 Ride Assist windows
 *   5.1-5.2 beat-domain combo (no wall-clock decay), integer score
 *   11.1 pause voiding (+/-250 ms)
 */

import { createEventRing, pushEvent, type EventRing } from '../../../gamekit/core/eventRing';
import {
  ACCURACY_VALUE,
  ASSIST_WINDOWS,
  BASE_POINTS,
  LAUNCH,
  LIMP_RECOVER,
  PENDING_STRAY_MS,
  SECTION_BARS,
  FEVER_METER,
  FLICK_MS,
  FLICK_PT,
  FREEZE_FAULT_MS,
  F_FLICK,
  GROOVE,
  J_GOOD,
  J_GREAT,
  J_MISS,
  J_NONE,
  J_PASS,
  J_PERFECT,
  J_POPPED,
  J_SHARP,
  J_UNPOPPED,
  J_VOID,
  J_WRONG,
  K_BIG,
  K_CYMBAL,
  K_DRUM,
  K_FREEZE,
  K_POPPER,
  K_RIM,
  K_ROLL,
  L_MARCH,
  L_STANDING,
  MASH,
  PAIR_MS,
  PAUSE_VOID_MS,
  WINDOWS,
  Z_CENTRE,
  Z_DEAD_L,
  Z_DEAD_R,
  comboMultiplier,
  isMilestone,
  type Chart,
} from './types';

// -- Events (kind, a, b, c) ----------------------------------------------------
export const EV_HIT = 1; //          a note, b grade, c delta (ms)
export const EV_MISS = 2; //         a note, b 1 if it broke a combo of 10+, c previous combo
export const EV_WRONG = 3; //        a note, b touch zone
export const EV_STRAY = 4; //        a touch zone
export const EV_OOS = 5; //          a lockout end (ms)
export const EV_FREEZE_FAULT = 6; // a note
export const EV_ROLL_TICK = 7; //    a note, b tick count
export const EV_ROLL_BREAK = 8; //   a note
export const EV_ROLL_DONE = 9; //    a note
export const EV_BIG_DOUBLE = 10; //  a note
export const EV_FLICK = 11; //       a note, b grade
export const EV_POPPER_TAP = 12; //  a note, b taps, c needed
export const EV_POPPER_POP = 13; //  a note
export const EV_FEVER_ARMED = 14;
export const EV_FEVER_DEPLOY = 15; // a start bar
export const EV_FEVER_START = 16; //  a start bar
export const EV_FEVER_END = 17; //    a 1 if it fizzled
export const EV_MILESTONE = 18; //   a combo
export const EV_STALL = 19;
export const EV_BAR_LAYER = 20; //   a bar, b layer (1 standing, 2 march)
export const EV_FREEZE_PASS = 21; // a note
export const EV_POPPER_GONE = 22; // a note
export const EV_LIMP = 23; //        a 1 = started limping, 0 = recovered
export const EV_LAUNCH = 24; //      a drop bar the Fever is queued for

export const EVENT_NAMES: Record<number, string> = {
  1: 'hit', 2: 'miss', 3: 'wrong', 4: 'stray', 5: 'oos', 6: 'freezeFault', 7: 'rollTick', 8: 'rollBreak',
  9: 'rollDone', 10: 'bigDouble', 11: 'flick', 12: 'popperTap', 13: 'popperPop', 14: 'feverArmed',
  15: 'feverDeploy', 16: 'feverStart', 17: 'feverEnd', 18: 'milestone', 19: 'stall', 20: 'barLayer',
  21: 'freezePass', 22: 'popperGone', 23: 'limp', 24: 'launch',
};

const MAX_POINTERS = 6;
const MAX_LOG = 4096;

export interface JudgeConfig {
  sharpEnabled?: boolean;
  /** Fever deploys itself on the next bar line when armed (ride, stages 1-2). */
  autoFever?: boolean;
  /** Groove floor 10 until this time (ms). Infinity = the run cannot fail (First Parade). */
  noFailUntilMs?: number;
  /** Tests / proof replay: -1 = follow the MARCH pill (`marchWant`), 0 = never march, 1 = always march. */
  forceMarch?: number;
  /** Explicit March bars (proof replay): overrides the pill for these bars. */
  marchBars?: number[];
  /** Queue rounds: Groove 0 = Limping, the round always plays to its last bar. */
  limp?: boolean;
  /** Ride Assist windows (server-granted after a ride loss). */
  assist?: boolean;
}

export interface JudgeState {
  // config
  d: number;
  sharp: number;
  wSharp: number;
  wPerfect: number;
  wGreat: number;
  wGood: number;
  wConsider: number;
  approach: number;
  autoFever: number;
  noFailUntil: number;
  forceMarch: number;
  popperNeed: number;
  // chart
  n: number;
  t: number[];
  kind: number[];
  zone: number[];
  layers: number[];
  end: number[];
  flags: number[];
  bar: number[];
  beatLen: number[];
  barStart: number[];
  nBars: number;
  firstBar: number;
  lastBar: number;
  endMs: number;
  // per note
  res: number[];
  delta: number[];
  // per bar
  barLayer: number[];
  marchPlan: number[];
  /** The MARCH pill: 1 = the player wants the March layer from the next unlocked section. */
  marchWant: number;
  dropBars: number[];
  limp: number;
  limping: number;
  limped: number;
  /** Song time the round first started Limping (-1 = never). */
  limpT: number;
  /** Per bar: 1 if the player was Limping at any tick inside it. */
  barLimp: number[];
  assist: number;
  cursor: number;
  now: number;
  // score and meters
  score: number;
  combo: number;
  maxCombo: number;
  groove: number;
  meter: number;
  armed: number;
  feverFrom: number;
  feverTo: number;
  feverKillAt: number;
  pendingDeploy: number;
  feverBarsUsed: number;
  // counts
  cSharp: number;
  cPerfect: number;
  cGreat: number;
  cGood: number;
  cMiss: number;
  cWrong: number;
  strays: number;
  faults: number;
  oos: number;
  rollTicks: number;
  popped: number;
  bigDoubles: number;
  flicks: number;
  accSum: number;
  accN: number;
  hitN: number;
  touches: number;
  // touch state
  mash: number[];
  mashHead: number;
  lastDownT: number;
  pairOpen: number;
  lastDownNote: number;
  oosUntil: number;
  pId: number[];
  pRoll: number[];
  pRollNext: number;
  pRollTicks: number[];
  pCym: number[];
  pCymGrade: number[];
  pCymDelta: number[];
  pStartT: number[];
  pStartY: number[];
  pLaunched: number[];
  pendT: number[];
  pendPid: number[];
  pendZone: number[];
  launches: number;
  popperIdx: number;
  popperTaps: number;
  stalled: number;
  stallT: number;
  finished: number;
  // proof log
  logNote: number[];
  logDelta: number[];
  logKind: number[];
  logZone: number[];
  strayT: number[];
  deployT: number[];
  faultT: number[];
  popperLog: number[];
  touchT: number[];
  touchType: number[];
  touchZone: number[];
  touchY: number[];
  touchPid: number[];
  errs: number[];
  ev: EventRing;
}

export function createJudge(chart: Chart, cfg: JudgeConfig = {}): JudgeState {
  const w = cfg.assist && chart.difficulty === 1 ? ASSIST_WINDOWS : WINDOWS[chart.difficulty];
  const n = chart.t.length;
  const zeros = (k: number, v = 0): number[] => {
    const a: number[] = [];
    for (let i = 0; i < k; i++) a.push(v);
    return a;
  };
  const nBars = chart.barStart.length - 1;
  const marchPlan = zeros(nBars, -1);
  if (cfg.marchBars) for (const b of cfg.marchBars) if (b >= 0 && b < nBars) marchPlan[b] = 1;
  const dropBars: number[] = [];
  for (let b = chart.firstBar + SECTION_BARS; b <= chart.lastBar; b += SECTION_BARS) dropBars.push(b);
  return {
    d: chart.difficulty,
    sharp: cfg.sharpEnabled && w.sharp > 0 ? 1 : 0,
    wSharp: w.sharp,
    wPerfect: w.perfect,
    wGreat: w.great,
    wGood: w.good,
    wConsider: w.consider,
    approach: w.approachMs,
    autoFever: cfg.autoFever ? 1 : 0,
    noFailUntil: cfg.noFailUntilMs ?? 0,
    forceMarch: cfg.marchBars ? 0 : cfg.forceMarch ?? -1,
    popperNeed: chart.popperTaps,
    n,
    t: chart.t.slice(),
    kind: chart.kind.slice(),
    zone: chart.zone.slice(),
    layers: chart.layers.slice(),
    end: chart.end.slice(),
    flags: chart.flags.slice(),
    bar: chart.bar.slice(),
    beatLen: chart.beatLen.slice(),
    barStart: chart.barStart.slice(),
    nBars,
    firstBar: chart.firstBar,
    lastBar: chart.lastBar,
    endMs: chart.endMs,
    res: zeros(n),
    delta: zeros(n),
    barLayer: zeros(nBars),
    marchPlan,
    marchWant: 0,
    dropBars,
    limp: cfg.limp ? 1 : 0,
    limping: 0,
    limped: 0,
    limpT: -1,
    barLimp: zeros(nBars),
    assist: cfg.assist && chart.difficulty === 1 ? 1 : 0,
    cursor: 0,
    now: -1e9,
    score: 0,
    combo: 0,
    maxCombo: 0,
    groove: GROOVE.start,
    meter: 0,
    armed: 0,
    feverFrom: -1,
    feverTo: -1,
    feverKillAt: 0,
    pendingDeploy: -1,
    feverBarsUsed: 0,
    cSharp: 0, cPerfect: 0, cGreat: 0, cGood: 0, cMiss: 0, cWrong: 0,
    strays: 0, faults: 0, oos: 0, rollTicks: 0, popped: 0, bigDoubles: 0, flicks: 0,
    accSum: 0, accN: 0, hitN: 0, touches: 0,
    mash: zeros(8, -1e9),
    mashHead: 0,
    lastDownT: -1e9,
    pairOpen: 0,
    lastDownNote: -1,
    oosUntil: -1e9,
    pId: zeros(MAX_POINTERS, -1),
    pRoll: zeros(MAX_POINTERS, -1),
    pRollNext: 0,
    pRollTicks: zeros(MAX_POINTERS),
    pCym: zeros(MAX_POINTERS, -1),
    pCymGrade: zeros(MAX_POINTERS),
    pCymDelta: zeros(MAX_POINTERS),
    pStartT: zeros(MAX_POINTERS),
    pStartY: zeros(MAX_POINTERS),
    pLaunched: zeros(MAX_POINTERS),
    pendT: [],
    pendPid: [],
    pendZone: [],
    launches: 0,
    popperIdx: -1,
    popperTaps: 0,
    stalled: 0,
    stallT: 0,
    finished: 0,
    logNote: [], logDelta: [], logKind: [], logZone: [],
    strayT: [], deployT: [], faultT: [], popperLog: [],
    touchT: [], touchType: [], touchZone: [], touchY: [], touchPid: [],
    errs: [],
    ev: createEventRing(256),
  };
}

// -- helpers --------------------------------------------------------------------

export function barAt(s: JudgeState, t: number): number {
  'worklet';
  const b = s.barStart;
  if (t < b[0]) return -1;
  let lo = 0;
  let hi = s.nBars;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (b[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function feverActiveAt(s: JudgeState, t: number): boolean {
  'worklet';
  if (s.feverFrom < 0) return false;
  const b = barAt(s, t);
  return b >= s.feverFrom && b < s.feverTo && (s.feverKillAt <= 0 || t < s.feverKillAt);
}

export function isMarchBar(s: JudgeState, bar: number): boolean {
  'worklet';
  return bar >= 0 && bar < s.nBars && s.barLayer[bar] === L_MARCH;
}

/** Is note i live in its bar's locked layer? Unlocked bars use the standing layer. */
export function noteActive(s: JudgeState, i: number): boolean {
  'worklet';
  const b = s.bar[i];
  const layer = s.barLayer[b] === L_MARCH ? L_MARCH : L_STANDING;
  return (s.layers[i] & layer) !== 0;
}

/** First bar of the 4-bar section holding bar b (pre-roll and outro bars are their own). */
export function sectionStartBar(s: JudgeState, b: number): number {
  'worklet';
  if (b < s.firstBar || b > s.lastBar) return b;
  return s.firstBar + Math.floor((b - s.firstBar) / SECTION_BARS) * SECTION_BARS;
}

/** The March layer of a section locks at sectionStart - approach - 1 beat (design 4.6). */
export function lockTime(s: JudgeState, b: number): number {
  'worklet';
  const sb = sectionStartBar(s, b);
  const beat = (s.barStart[sb + 1] - s.barStart[sb]) / 4;
  return s.barStart[sb] - s.approach - beat;
}

/** The first section whose layer is not locked yet (-1 when every bar is locked). */
export function nextOpenSection(s: JudgeState): number {
  'worklet';
  for (let b = s.firstBar; b <= s.lastBar; b += SECTION_BARS) if (s.barLayer[b] === 0) return b;
  return -1;
}

function fizzleFever(s: JudgeState, t: number): void {
  'worklet';
  if (feverActiveAt(s, t) && s.feverKillAt <= 0) {
    const i = s.cursor < s.n ? s.cursor : s.n - 1;
    const beat = i >= 0 ? s.beatLen[i] : 450;
    s.feverKillAt = t + beat;
  }
}

function addGroove(s: JudgeState, t: number, dv: number): void {
  'worklet';
  const bar = barAt(s, t);
  const floor = (!s.limp && isMarchBar(s, bar)) || t < s.noFailUntil ? GROOVE.marchFloor : 0;
  let g = s.groove + dv;
  if (g > GROOVE.max) g = GROOVE.max;
  if (dv < 0 && g < floor) g = Math.max(g, Math.min(s.groove, floor));
  if (g < 0) g = 0;
  s.groove = g;
  if (s.limp) {
    // Queue rounds never end early: Limping (x1, no Fever) until Groove is back to 30.
    if (s.groove <= 0 && !s.limping && t >= s.noFailUntil) {
      s.limping = 1;
      s.limped = 1;
      if (s.limpT < 0) s.limpT = t;
      fizzleFever(s, t);
      pushEvent(s.ev, EV_LIMP, 1, 0, 0, t);
    } else if (s.limping && s.groove >= LIMP_RECOVER) {
      s.limping = 0;
      pushEvent(s.ev, EV_LIMP, 0, 0, 0, t);
    }
    return;
  }
  if (s.groove <= 0 && !s.stalled && t >= s.noFailUntil) {
    s.groove = 0;
    s.stalled = 1;
    s.stallT = t;
    pushEvent(s.ev, EV_STALL, 0, 0, 0, t);
  }
}

function addMeter(s: JudgeState, t: number, dv: number): void {
  'worklet';
  if (dv > 0 && (s.armed || s.limping || s.pendingDeploy >= 0 || feverActiveAt(s, t))) return; // overfill is wasted
  let m = s.meter + dv;
  if (m < 0) m = 0;
  if (m >= FEVER_METER.full) {
    m = FEVER_METER.full;
    if (!s.armed) {
      s.armed = 1;
      pushEvent(s.ev, EV_FEVER_ARMED, 0, 0, 0, t);
    }
  }
  s.meter = m;
}

function points(s: JudgeState, t: number, base: number): number {
  'worklet';
  const p = base * (s.limping ? 1 : comboMultiplier(s.combo)) * (feverActiveAt(s, t) ? 2 : 1);
  s.score += p;
  return p;
}

function breakCombo(s: JudgeState): number {
  'worklet';
  const prev = s.combo;
  s.combo = 0;
  return prev;
}

function logInput(s: JudgeState, note: number, delta: number, kind: number, zone: number): void {
  'worklet';
  if (s.logNote.length >= MAX_LOG) return;
  s.logNote.push(note);
  s.logDelta.push(Math.round(delta));
  s.logKind.push(kind);
  s.logZone.push(zone === Z_CENTRE ? 0 : zone === Z_DEAD_L || zone === Z_DEAD_R ? 2 : 1);
}

function gradeOf(s: JudgeState, ad: number): number {
  'worklet';
  if (s.sharp && ad <= s.wSharp) return J_SHARP;
  if (ad <= s.wPerfect) return J_PERFECT;
  if (ad <= s.wGreat) return J_GREAT;
  if (ad <= s.wGood) return J_GOOD;
  return J_MISS;
}

function applyHit(s: JudgeState, i: number, grade: number, delta: number, t: number): void {
  'worklet';
  s.res[i] = grade;
  s.delta[i] = delta;
  s.combo += 1;
  if (s.combo > s.maxCombo) s.maxCombo = s.combo;
  let base = BASE_POINTS.good;
  let gv = GROOVE.good;
  let mv = FEVER_METER.good;
  if (grade === J_SHARP) {
    base = BASE_POINTS.sharp; gv = GROOVE.perfect; mv = FEVER_METER.perfect; s.cSharp++;
  } else if (grade === J_PERFECT) {
    base = BASE_POINTS.perfect; gv = GROOVE.perfect; mv = FEVER_METER.perfect; s.cPerfect++;
  } else if (grade === J_GREAT) {
    base = BASE_POINTS.great; gv = GROOVE.great; mv = FEVER_METER.great; s.cGreat++;
  } else {
    s.cGood++;
  }
  points(s, t, base);
  addGroove(s, t, gv);
  addMeter(s, t, mv);
  s.accSum += ACCURACY_VALUE[grade] ?? 0;
  s.accN += 1;
  s.hitN += 1;
  if (s.errs.length < MAX_LOG) s.errs.push(delta);
  pushEvent(s.ev, EV_HIT, i, grade, delta, t);
  if (isMilestone(s.combo)) pushEvent(s.ev, EV_MILESTONE, s.combo, 0, 0, t);
}

function applyMiss(s: JudgeState, i: number, t: number, delta: number): void {
  'worklet';
  s.res[i] = J_MISS;
  s.delta[i] = delta;
  s.cMiss++;
  const prev = breakCombo(s);
  const march = isMarchBar(s, s.bar[i]);
  addGroove(s, t, march ? GROOVE.missMarch : GROOVE.miss);
  addMeter(s, t, FEVER_METER.miss);
  fizzleFever(s, t);
  s.accN += 1;
  pushEvent(s.ev, EV_MISS, i, prev >= 10 ? 1 : 0, prev, t);
}

function applyWrong(s: JudgeState, i: number, t: number, delta: number, zone: number): void {
  'worklet';
  s.res[i] = J_WRONG;
  s.delta[i] = delta;
  s.cWrong++;
  if (s.d >= 2) breakCombo(s); // d1 keeps the combo (not increased)
  addGroove(s, t, GROOVE.wrong);
  addMeter(s, t, FEVER_METER.wrong);
  s.accN += 1;
  pushEvent(s.ev, EV_WRONG, i, zone, delta, t);
}

function zoneOk(noteKind: number, zone: number): boolean {
  'worklet';
  if (zone === Z_DEAD_L || zone === Z_DEAD_R) return true;
  if (noteKind === K_DRUM) return zone === Z_CENTRE;
  if (noteKind === K_RIM) return zone !== Z_CENTRE;
  return true;
}

/** The drop line a launch at t catches: the next section start at least 150 ms away (-1 = none left). */
export function dropFor(s: JudgeState, t: number): number {
  'worklet';
  for (let k = 0; k < s.dropBars.length; k++) {
    const b = s.dropBars[k];
    if (t <= s.barStart[b] - LAUNCH.catchMs) return b;
  }
  return -1;
}

function deploy(s: JudgeState, t: number): boolean {
  'worklet';
  const drop = dropFor(s, t);
  if (drop < 0) return false;
  s.pendingDeploy = drop;
  s.armed = 0;
  s.meter = 0;
  if (s.deployT.length < 64) s.deployT.push(Math.round(t), drop);
  pushEvent(s.ev, EV_FEVER_DEPLOY, drop, 0, 0, t);
  pushEvent(s.ev, EV_LAUNCH, drop, 0, 0, t);
  return true;
}

function canLaunch(s: JudgeState, t: number): boolean {
  'worklet';
  return s.armed === 1 && !s.limping && s.pendingDeploy < 0 && !feverActiveAt(s, t) && !s.stalled && !s.finished;
}

function resolveStray(s: JudgeState, k: number): void {
  'worklet';
  const t = s.pendT[k];
  const zone = s.pendZone[k];
  s.pendT.splice(k, 1);
  s.pendPid.splice(k, 1);
  s.pendZone.splice(k, 1);
  s.strays++;
  if (s.strayT.length < 512) s.strayT.push(t);
  addGroove(s, t, isMarchBar(s, barAt(s, t)) ? GROOVE.strayMarch : GROOVE.stray);
  addMeter(s, t, FEVER_METER.stray);
  pushEvent(s.ev, EV_STRAY, zone, 0, 0, t);
}

function pointerSlot(s: JudgeState, pid: number, create: boolean): number {
  'worklet';
  for (let k = 0; k < MAX_POINTERS; k++) if (s.pId[k] === pid) return k;
  if (!create) return -1;
  for (let k = 0; k < MAX_POINTERS; k++) {
    if (s.pId[k] < 0) {
      s.pId[k] = pid;
      s.pRoll[k] = -1;
      s.pCym[k] = -1;
      s.pRollTicks[k] = 0;
      s.pLaunched[k] = 0;
      return k;
    }
  }
  return -1;
}

function logTouch(s: JudgeState, t: number, type: number, zone: number, y: number, pid: number): void {
  'worklet';
  if (s.touchT.length >= MAX_LOG) return;
  s.touchT.push(Math.round(t));
  s.touchType.push(type);
  s.touchZone.push(zone);
  s.touchY.push(Math.round(y));
  s.touchPid.push(pid);
}

function chartNotesIn(s: JudgeState, t0: number, t1: number): number {
  'worklet';
  let n = 0;
  for (let i = s.cursor; i < s.n && s.t[i] <= t1; i++) {
    if (s.t[i] >= t0 && s.kind[i] !== K_FREEZE && noteActive(s, i)) n++;
  }
  // Notes already consumed before the cursor inside the span also count.
  for (let i = s.cursor - 1; i >= 0 && s.t[i] >= t0; i--) {
    if (s.t[i] <= t1 && s.kind[i] !== K_FREEZE && s.res[i] !== J_VOID) n++;
  }
  return n;
}

// -- time -------------------------------------------------------------------

export function judgeTick(s: JudgeState, now: number): void {
  'worklet';
  if (s.finished || now < s.now) return;
  s.now = now;
  // March layer lock, per 4-bar section: sectionStart - approach - 1 beat.
  for (let b = 0; b < s.nBars; b++) {
    if (s.barLayer[b] !== 0) continue;
    if (now < lockTime(s, b)) break;
    let march = s.marchWant;
    if (s.marchPlan[b] >= 0) march = s.marchPlan[b];
    else if (s.forceMarch >= 0) march = s.forceMarch;
    if (b < s.firstBar || b > s.lastBar) march = 0;
    s.barLayer[b] = march ? L_MARCH : L_STANDING;
    pushEvent(s.ev, EV_BAR_LAYER, b, s.barLayer[b], 0, now);
  }
  // Fever lifecycle on bar lines.
  if (s.feverFrom >= 0) {
    const b = barAt(s, now);
    if (b >= s.feverTo || (s.feverKillAt > 0 && now >= s.feverKillAt)) {
      const fizz = s.feverKillAt > 0 && now >= s.feverKillAt && b < s.feverTo ? 1 : 0;
      s.feverBarsUsed += Math.max(0, Math.min(b, s.feverTo) - s.feverFrom);
      s.feverFrom = -1;
      s.feverTo = -1;
      s.feverKillAt = 0;
      pushEvent(s.ev, EV_FEVER_END, fizz, 0, 0, now);
    }
  }
  if (s.limping) {
    const lb = barAt(s, now);
    if (lb >= 0 && lb < s.nBars) s.barLimp[lb] = 1;
  }
  // Pending strays resolve 250 ms after their touch-down (a launch cancels them).
  while (s.pendT.length && now - s.pendT[0] >= PENDING_STRAY_MS) resolveStray(s, 0);
  if (s.autoFever && canLaunch(s, now)) deploy(s, now);
  if (s.pendingDeploy >= 0 && s.pendingDeploy < s.nBars && now >= s.barStart[s.pendingDeploy]) {
    s.feverFrom = s.pendingDeploy;
    s.feverTo = Math.min(s.pendingDeploy + SECTION_BARS, s.lastBar + 1);
    s.pendingDeploy = -1;
    s.feverKillAt = 0;
    pushEvent(s.ev, EV_FEVER_START, s.feverFrom, 0, 0, now);
  }
  // Pending CYMBAL flicks time out.
  for (let k = 0; k < MAX_POINTERS; k++) {
    const ci = s.pCym[k];
    if (ci >= 0 && now - s.pStartT[k] > FLICK_MS) {
      s.pCym[k] = -1;
      s.res[ci] = J_NONE;
      logInput(s, ci, s.pCymDelta[k], 0, 0);
      applyMiss(s, ci, now, s.pCymDelta[k]);
    }
  }
  // ROLL ticks every 8th while held.
  for (let k = 0; k < MAX_POINTERS; k++) {
    const ri = s.pRoll[k];
    if (ri < 0) continue;
    const step = s.beatLen[ri] / 2;
    const due = Math.floor((Math.min(now, s.end[ri]) - s.t[ri]) / step);
    while (s.pRollTicks[k] < due) {
      s.pRollTicks[k]++;
      s.rollTicks++;
      points(s, now, BASE_POINTS.rollTick);
      addGroove(s, now, GROOVE.rollTick);
      addMeter(s, now, FEVER_METER.rollTick);
      pushEvent(s.ev, EV_ROLL_TICK, ri, s.pRollTicks[k], 0, now);
    }
    if (now >= s.end[ri]) {
      s.pRoll[k] = -1;
      pushEvent(s.ev, EV_ROLL_DONE, ri, 0, 0, now);
    }
  }
  // Auto-resolve passed notes.
  for (let i = s.cursor; i < s.n; i++) {
    const nt = s.t[i];
    if (nt > now) break;
    if (s.res[i] !== J_NONE) continue;
    const k = s.kind[i];
    if (!noteActive(s, i)) {
      if (s.barLayer[s.bar[i]] !== 0) s.res[i] = J_VOID;
      continue;
    }
    if (k === K_FREEZE) {
      if (now > nt + FREEZE_FAULT_MS) {
        s.res[i] = J_PASS;
        pushEvent(s.ev, EV_FREEZE_PASS, i, 0, 0, now);
      }
      continue;
    }
    if (k === K_POPPER) {
      if (now > s.end[i]) {
        s.res[i] = J_UNPOPPED;
        s.popperLog.push(i, s.popperIdx === i ? s.popperTaps : 0, 0);
        pushEvent(s.ev, EV_POPPER_GONE, i, 0, 0, now);
      }
      continue;
    }
    if (now > nt + s.wGood) applyMiss(s, i, now, 0);
  }
  while (s.cursor < s.n && s.res[s.cursor] !== J_NONE && s.res[s.cursor] !== -1) s.cursor++;
  if (now >= s.endMs && s.cursor >= s.n) s.finished = 1;
}

// -- inputs -----------------------------------------------------------------

function isPendingCymbal(s: JudgeState, i: number): boolean {
  'worklet';
  return s.res[i] === -1;
}

function findPopper(s: JudgeState, t: number): number {
  'worklet';
  // Poppers are rare: scan a small window around the cursor.
  const from = s.cursor > 8 ? s.cursor - 8 : 0;
  for (let i = from; i < s.n; i++) {
    if (s.t[i] > t + s.wGood) break;
    if (s.kind[i] === K_POPPER && s.res[i] === J_NONE && t >= s.t[i] - s.wGood && t <= s.end[i] && noteActive(s, i)) return i;
  }
  return -1;
}

/** Touch-down. Returns the judged note index, or -1. */
export function judgeDown(s: JudgeState, t0: number, zone: number, pid: number, y: number): number {
  'worklet';
  // Integer ms at the input boundary, so the proof replay is bit-exact.
  const t = Math.round(t0);
  if (t > s.now) judgeTick(s, t);
  if (s.stalled || s.finished) return -1;
  s.touches++;
  logTouch(s, t, 0, zone, y, pid);
  const slot = pointerSlot(s, pid, true);
  if (slot >= 0) {
    s.pStartT[slot] = t;
    s.pStartY[slot] = y;
  }
  // Second finger of a pair: a BIG double; never a stray, never a Fever launch.
  if (s.pairOpen && t - s.lastDownT <= PAIR_MS) {
    s.pairOpen = 0;
    // The pair's first finger is not a stray either.
    for (let k = s.pendT.length - 1; k >= 0; k--) {
      if (t - s.pendT[k] <= PAIR_MS) {
        s.pendT.splice(k, 1);
        s.pendPid.splice(k, 1);
        s.pendZone.splice(k, 1);
      }
    }
    const bi = s.lastDownNote;
    if (bi >= 0 && s.kind[bi] === K_BIG && s.res[bi] >= J_SHARP && s.res[bi] <= J_GOOD) {
      s.bigDoubles++;
      points(s, t, BASE_POINTS.bigDouble);
      logInput(s, bi, t - s.t[bi], 3, zone);
      pushEvent(s.ev, EV_BIG_DOUBLE, bi, 0, 0, t);
    }
    return -1;
  }
  s.lastDownT = t;
  s.pairOpen = 1;
  s.lastDownNote = -1;
  if (t < s.oosUntil) return -1;

  // POPPER span: count taps, no stray, no Out of Step.
  const pi = findPopper(s, t);
  if (pi >= 0) {
    if (s.popperIdx !== pi) {
      s.popperIdx = pi;
      s.popperTaps = 0;
    }
    s.popperTaps++;
    points(s, t, BASE_POINTS.popperTap);
    pushEvent(s.ev, EV_POPPER_TAP, pi, s.popperTaps, s.popperNeed, t);
    if (s.popperTaps >= s.popperNeed) {
      s.res[pi] = J_POPPED;
      s.popped++;
      s.combo++;
      if (s.combo > s.maxCombo) s.maxCombo = s.combo;
      points(s, t, BASE_POINTS.popperPop);
      addGroove(s, t, GROOVE.popperPop);
      addMeter(s, t, FEVER_METER.popperPop);
      s.accSum += 100;
      s.accN += 1;
      s.hitN += 1;
      s.popperLog.push(pi, s.popperTaps, 1);
      pushEvent(s.ev, EV_POPPER_POP, pi, 0, 0, t);
    }
    return pi;
  }

  // Out of Step: 5+ touch-downs in 400 ms where the chart has fewer than 3 notes.
  s.mash[s.mashHead] = t;
  s.mashHead = (s.mashHead + 1) % s.mash.length;
  let recent = 0;
  for (let k = 0; k < s.mash.length; k++) if (t - s.mash[k] <= MASH.windowMs) recent++;
  if (recent >= MASH.taps && chartNotesIn(s, t - MASH.windowMs, t) < MASH.maxChartNotes) {
    const beat = s.cursor < s.n ? s.beatLen[s.cursor] : 450;
    s.oosUntil = t + beat;
    s.oos++;
    breakCombo(s);
    addGroove(s, t, GROOVE.outOfStep);
    addMeter(s, t, FEVER_METER.outOfStep);
    for (let k = 0; k < s.mash.length; k++) s.mash[k] = -1e9;
    // Notes inside the lockout beat auto-miss.
    for (let i = s.cursor; i < s.n && s.t[i] <= s.oosUntil; i++) {
      if (s.res[i] === J_NONE && s.t[i] >= t - s.wGood && noteActive(s, i) && s.kind[i] !== K_FREEZE && s.kind[i] !== K_POPPER) {
        applyMiss(s, i, t, 0);
      }
    }
    pushEvent(s.ev, EV_OOS, s.oosUntil, 0, 0, t);
    return -1;
  }

  // Earliest unjudged candidate in reach (never the closest).
  let cand = -1;
  for (let i = s.cursor; i < s.n; i++) {
    const nt = s.t[i];
    if (nt > t + s.wConsider) break;
    if (s.res[i] !== J_NONE) continue;
    const k = s.kind[i];
    if (k === K_FREEZE || k === K_POPPER) continue;
    if (!noteActive(s, i)) continue;
    if (nt < t - s.wConsider) continue;
    if (isPendingCymbal(s, i)) continue;
    cand = i;
    break;
  }
  if (cand < 0) {
    // FREEZE fault?
    for (let i = s.cursor; i < s.n && s.t[i] <= t + FREEZE_FAULT_MS; i++) {
      if (s.kind[i] === K_FREEZE && s.res[i] === J_NONE && Math.abs(t - s.t[i]) <= FREEZE_FAULT_MS && noteActive(s, i)) {
        s.res[i] = J_MISS;
        s.faults++;
        breakCombo(s);
        addGroove(s, t, GROOVE.freezeFault);
        addMeter(s, t, FEVER_METER.freezeFault);
        fizzleFever(s, t);
        if (s.faultT.length < 64) s.faultT.push(Math.round(t));
        pushEvent(s.ev, EV_FREEZE_FAULT, i, 0, 0, t);
        return -1;
      }
    }
    // Pending: a stray only if it does not become a Launch Swipe or a pair (250 ms).
    if (s.pendT.length < 32) {
      s.pendT.push(t);
      s.pendPid.push(pid);
      s.pendZone.push(zone);
    }
    return -1;
  }

  const delta = t - s.t[cand];
  const grade = gradeOf(s, Math.abs(delta));
  const k = s.kind[cand];
  const march = isMarchBar(s, s.bar[cand]);
  s.lastDownNote = cand;
  if (grade === J_MISS) {
    logInput(s, cand, delta, 0, zone);
    applyMiss(s, cand, t, delta);
    return cand;
  }
  if ((k === K_DRUM || k === K_RIM) && !march && !zoneOk(k, zone)) {
    logInput(s, cand, delta, 0, zone);
    applyWrong(s, cand, t, delta, zone);
    return cand;
  }
  if (k === K_CYMBAL && (s.flags[cand] & F_FLICK) && !march && slot >= 0) {
    // Provisional until the flick (28 pt up within 160 ms).
    s.pCym[slot] = cand;
    s.pCymGrade[slot] = grade;
    s.pCymDelta[slot] = delta;
    s.res[cand] = -1;
    return cand;
  }
  logInput(s, cand, delta, 0, zone);
  applyHit(s, cand, grade, delta, t);
  if (k === K_ROLL && slot >= 0) {
    s.pRoll[slot] = cand;
    s.pRollTicks[slot] = 0;
  }
  return cand;
}

/**
 * Fever launch (the Launch Swipe or a tap on the armed meter). Queues the
 * Fever for the next drop line. A launch is never a stray: the pointer's
 * pending stray is cancelled. Returns true when the Fever was queued.
 */
export function judgeLaunch(s: JudgeState, t0: number, pid: number): boolean {
  'worklet';
  const t = Math.round(t0);
  if (t > s.now) judgeTick(s, t);
  for (let k = s.pendT.length - 1; k >= 0; k--) {
    if (s.pendPid[k] === pid) {
      s.pendT.splice(k, 1);
      s.pendPid.splice(k, 1);
      s.pendZone.splice(k, 1);
    }
  }
  logTouch(s, t, 3, 0, 0, pid); // logged even when not armed: it cancels the pending stray
  if (!canLaunch(s, t)) return false;
  s.launches++;
  return deploy(s, t);
}

export function judgeMove(s: JudgeState, t0: number, pid: number, y: number): void {
  'worklet';
  const t = Math.round(t0);
  const slot = pointerSlot(s, pid, false);
  if (slot < 0) return;
  // Launch Swipe: one finger dragged up >= 90 pt within 300 ms of its touch-down.
  if (!s.pLaunched[slot] && s.pStartY[slot] - y >= LAUNCH.swipePt && t - s.pStartT[slot] <= LAUNCH.swipeMs) {
    s.pLaunched[slot] = 1;
    if (s.pRoll[slot] < 0) judgeLaunch(s, t, pid);
    return;
  }
  const ci = s.pCym[slot];
  if (ci < 0) return;
  if (t > s.now) judgeTick(s, t);
  if (s.pCym[slot] < 0) return;
  if (s.pStartY[slot] - y >= FLICK_PT && t - s.pStartT[slot] <= FLICK_MS) {
    s.pCym[slot] = -1;
    s.res[ci] = J_NONE;
    logTouch(s, t, 2, 0, y, pid);
    logInput(s, ci, s.pCymDelta[slot], 1, 0);
    applyHit(s, ci, s.pCymGrade[slot], s.pCymDelta[slot], t);
    s.flicks++;
    points(s, t, BASE_POINTS.flickFlair);
    pushEvent(s.ev, EV_FLICK, ci, s.pCymGrade[slot], 0, t);
  }
}

export function judgeUp(s: JudgeState, t0: number, pid: number): void {
  'worklet';
  const t = Math.round(t0);
  if (t > s.now) judgeTick(s, t);
  const slot = pointerSlot(s, pid, false);
  if (slot < 0) return;
  logTouch(s, t, 1, 0, 0, pid);
  const ri = s.pRoll[slot];
  if (ri >= 0) {
    const early = s.end[ri] - t;
    if (early > s.beatLen[ri] / 8) {
      breakCombo(s);
      addGroove(s, t, GROOVE.rollBreak);
      logInput(s, ri, Math.round(-early), 2, 0);
      pushEvent(s.ev, EV_ROLL_BREAK, ri, 0, 0, t);
    } else {
      pushEvent(s.ev, EV_ROLL_DONE, ri, 0, 0, t);
    }
    s.pRoll[slot] = -1;
  }
  const ci = s.pCym[slot];
  if (ci >= 0) {
    // Lifted without the flick.
    s.pCym[slot] = -1;
    s.res[ci] = J_NONE;
    logInput(s, ci, s.pCymDelta[slot], 0, 0);
    applyMiss(s, ci, t, s.pCymDelta[slot]);
  }
  s.pId[slot] = -1;
}

/** The MARCH pill (or the pause sheet toggle): applies from the next unlocked section. */
export function setMarchWant(s: JudgeState, march: boolean): void {
  'worklet';
  s.marchWant = march ? 1 : 0;
}

/** A pause: notes within +/-250 ms of the pause point are voided. */
export function voidAround(s: JudgeState, t: number): void {
  'worklet';
  for (let i = s.cursor; i < s.n && s.t[i] <= t + PAUSE_VOID_MS; i++) {
    if (s.res[i] === J_NONE && Math.abs(s.t[i] - t) <= PAUSE_VOID_MS) s.res[i] = J_VOID;
  }
  for (let k = 0; k < MAX_POINTERS; k++) {
    s.pId[k] = -1;
    s.pRoll[k] = -1;
    s.pCym[k] = -1;
  }
  s.pairOpen = 0;
  s.pendT.length = 0;
  s.pendPid.length = 0;
  s.pendZone.length = 0;
}

/** End the round now (outro reached, stall, or a queue wrap-up): resolve the rest. */
export function finishJudge(s: JudgeState, t: number, voidRest: boolean): void {
  'worklet';
  while (s.pendT.length) resolveStray(s, 0);
  for (let i = 0; i < s.n; i++) {
    if (s.res[i] === J_NONE || s.res[i] === -1) s.res[i] = voidRest || s.t[i] > t ? J_VOID : J_MISS;
  }
  s.finished = 1;
}

// -- read-outs -------------------------------------------------------------------

export function accuracyPct(s: JudgeState): number {
  'worklet';
  return s.accN > 0 ? s.accSum / s.accN : 0;
}

export function hitRate(s: JudgeState): number {
  'worklet';
  return s.accN > 0 ? s.hitN / s.accN : 0;
}

export function marchBarsOf(s: JudgeState): number[] {
  const out: number[] = [];
  for (let b = s.firstBar; b <= s.lastBar; b++) if (s.barLayer[b] === L_MARCH) out.push(b);
  return out;
}

export { K_BIG, K_CYMBAL, K_ROLL };
