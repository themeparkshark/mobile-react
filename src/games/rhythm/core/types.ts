/**
 * Parade Beat core types and tuning (design rhythm.md sections 3-5).
 *
 * Pure data. Shared by the UI-thread judge, node tests and the server port
 * (the PHP twin must read the same constants).
 */

export const CHART_VERSION = 'pb-2.0';
export const PROOF_VERSION = 5;
export const GAME_KEY = 'timing';

// -- Note kinds (stage JSON column 3) ----------------------------------------
export const K_DRUM = 0;
export const K_RIM = 1;
export const K_ROLL = 2;
export const K_BIG = 3;
export const K_CYMBAL = 4;
export const K_POPPER = 5;
export const K_FREEZE = 6;

// -- Layers ------------------------------------------------------------------
export const L_STANDING = 1;
export const L_MARCH = 2;

// -- Note flags --------------------------------------------------------------
export const F_ECHO = 1;
export const F_EITHER = 2;
export const F_FLICK = 4;

// -- Touch zones (input) -----------------------------------------------------
/** Centre head (DRUM). */
export const Z_CENTRE = 0;
/** Left rim band (RIM). */
export const Z_RIM_L = 1;
/** Right rim band (RIM). */
export const Z_RIM_R = 2;
/** 16pt dead band between centre and a rim: counts as either. */
export const Z_DEAD_L = 3;
export const Z_DEAD_R = 4;

// -- Judgments ---------------------------------------------------------------
export const J_NONE = 0;
export const J_SHARP = 1;
export const J_PERFECT = 2;
export const J_GREAT = 3;
export const J_GOOD = 4;
export const J_MISS = 5;
export const J_WRONG = 6;
/** Not judged: the note was outside the bar's active layer or voided by a pause. */
export const J_VOID = 7;
/** FREEZE note survived (nobody tapped). */
export const J_PASS = 8;
/** POPPER popped. */
export const J_POPPED = 9;
/** POPPER span ended without the pop (no MISS, no combo break). */
export const J_UNPOPPED = 10;

export type Difficulty = 1 | 2 | 3;
export type RoundFormat = 'queue' | 'ride';

export interface Windows {
  sharp: number;
  perfect: number;
  great: number;
  good: number;
  consider: number;
  approachMs: number;
}

/** Section 3.3. SHARP exists only when the session gate enables it. */
export const WINDOWS: Record<Difficulty, Windows> = {
  1: { sharp: 0, perfect: 55, great: 110, good: 165, consider: 210, approachMs: 1600 },
  2: { sharp: 0, perfect: 45, great: 95, good: 145, consider: 190, approachMs: 1300 },
  3: { sharp: 22, perfect: 35, great: 70, good: 115, consider: 160, approachMs: 1050 },
};

/** Ride Assist (design 3.5): d1 chart, GOOD widened, approach x1.3. */
export const ASSIST_WINDOWS: Windows = { sharp: 0, perfect: 55, great: 110, good: 180, consider: 230, approachMs: 2080 };

/** Fever Launch Swipe (design 3.1, 4.3): one finger up >= 90 pt within 300 ms. */
export const LAUNCH = { swipePt: 90, swipeMs: 300, catchMs: 150 };
/** Queue rounds: Groove 0 = Limping until Groove is back to this (design 3.6). */
export const LIMP_RECOVER = 30;
/** A touch with no note in reach is a stray only after this (design 4.1). */
export const PENDING_STRAY_MS = 250;
/** Playable bars per section; a drop line opens every section after the first. */
export const SECTION_BARS = 4;

/** Section 5.2 base points. */
export const BASE_POINTS = {
  sharp: 320,
  perfect: 300,
  great: 200,
  good: 100,
  rollTick: 10,
  bigDouble: 300,
  flickFlair: 50,
  popperTap: 30,
  popperPop: 500,
};

/** Section 4.2 (standing bars). March modifiers in 4.6. */
export const GROOVE = {
  start: 50,
  max: 100,
  perfect: 2,
  great: 1,
  good: 0.5,
  miss: -8,
  missMarch: -4,
  wrong: -4,
  stray: -3,
  strayMarch: -1,
  freezeFault: -6,
  outOfStep: -6,
  rollTick: 0.25,
  rollBreak: -4,
  popperPop: 4,
  marchFloor: 10,
};

export const FEVER_METER = {
  perfect: 5,
  great: 3,
  good: 1,
  miss: -15,
  wrong: -5,
  stray: -5,
  freezeFault: -15,
  outOfStep: -10,
  rollTick: 0.5,
  popperPop: 10,
  full: 100,
  bars: 4,
};

/** Accuracy values for stars (section 3.6). */
export const ACCURACY_VALUE: Record<number, number> = {
  [J_SHARP]: 100,
  [J_PERFECT]: 100,
  [J_GREAT]: 70,
  [J_GOOD]: 40,
  [J_MISS]: 0,
  [J_WRONG]: 0,
  [J_POPPED]: 100,
};

export const STAR_ACCURACY = { one: 60, two: 80, three: 92 };

/** Ride challenge win (section 9.1). */
export const RIDE_RULES = { hitRate: 0.75, maxStrays: 12 };

/** Anti-mash (section 4.4). */
export const MASH = { taps: 5, windowMs: 400, maxChartNotes: 3 };

export const PAIR_MS = 40;
export const FLICK_PT = 28;
export const FLICK_MS = 160;
export const FREEZE_FAULT_MS = 100;
export const PAUSE_VOID_MS = 250;
export const MILESTONES = [10, 25, 50, 100];

/** Combo multiplier: x1 0-9, x2 10-24, x3 25-49, x4 50+. */
export function comboMultiplier(combo: number): number {
  'worklet';
  if (combo >= 50) return 4;
  if (combo >= 25) return 3;
  if (combo >= 10) return 2;
  return 1;
}

export function isMilestone(combo: number): boolean {
  'worklet';
  if (combo === 10 || combo === 25 || combo === 50 || combo === 100) return true;
  return combo > 100 && combo % 50 === 0;
}

/** Stage JSON note row. */
export type NoteRow = [
  tMs: number,
  beat: number,
  sixteenth: number,
  kind: number,
  zone: number,
  layers: number,
  extra: number,
  group: number,
  alt: number,
  flags: number,
];

export interface StageFormatJson {
  audio: string;
  fever: string;
  durationMs: number;
  preRollBars: number;
  playableBars: number;
  outroBars: number;
  beatUs: number[];
  beatmapHash: string;
  barEnergy: number[];
  charts: Record<string, NoteRow[]>;
  groups: Record<string, [number, string, number][]>;
}

export interface StageJson {
  id: string;
  title: string;
  key: string;
  bpm: number;
  chartVersion: string;
  formats: Partial<Record<RoundFormat, StageFormatJson>>;
}

export type SectionName = 'countin' | 'warmup' | 'stepup' | 'echo' | 'chorus' | 'breakdown' | 'finale' | 'curtain';

/** A generated round: struct of arrays, worklet friendly. */
export interface Chart {
  stage: string;
  format: RoundFormat;
  difficulty: Difficulty;
  seed: number;
  chartVersion: string;
  beatmapHash: string;
  /** Beat times (ms, float) for the whole file. */
  beats: number[];
  /** Bar start times (ms), including pre-roll and outro bars, plus one past the end. */
  barStart: number[];
  /** Section index per bar (index into SECTIONS). */
  barSection: number[];
  barEnergy: number[];
  preRollBars: number;
  playableBars: number;
  /** First and last playable bar indexes (file bars). */
  firstBar: number;
  lastBar: number;
  durationMs: number;
  /** Round end: the downbeat of the last outro bar. */
  endMs: number;
  // notes (sorted by t)
  t: number[];
  kind: number[];
  zone: number[];
  layers: number[];
  /** ROLL / POPPER end time (ms), else 0. */
  end: number[];
  flags: number[];
  bar: number[];
  /** Beat length at the note (ms), for ROLL ticks and flick grace. */
  beatLen: number[];
  /** ECHO calls: whistle times (ms) the leader plays one bar before each answer note. */
  calls: number[];
  callZone: number[];
  /** FREEZE pre-cue times (1 beat before each FREEZE). */
  freezeCues: number[];
  popperTaps: number;
}

export const SECTIONS: SectionName[] = ['countin', 'warmup', 'stepup', 'echo', 'chorus', 'breakdown', 'finale', 'curtain'];
