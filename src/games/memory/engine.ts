/**
 * engine.ts: Memory Match rules engine (design doc v8, "mm-6").
 *
 * A pure, deterministic reducer. Time is always passed in (session ms that
 * exclude pauses; charged ms on a server-revealed Ride Sprint), so the same
 * action log replays to the same state on the client, in node tests and in the
 * PHP port (engine.vectors.json).
 *
 *   let s = createEngine(cfg, { cols: 4, rows: 4, seed });
 *   const ev = step(s, { t: 'flip', slot: 5, face: 3, at: 1830 });
 *
 * The engine never needs the whole layout: a face is learned when it is
 * flipped, glimpsed, peeked or photo-flashed. That is what lets Ride Sprint,
 * the Daily (Fair Deck) and duels run on server-revealed boards with the exact
 * same code.
 *
 * Classification (3.2): recall, glimpse and lucky matches, slip, scout, gull
 * miss. The chain grows only on a recall match, holds on everything else and
 * resets on a slip. Knowledge: unseen, glimpsed (shown to you), seen (you
 * flipped it), matched.
 *
 * mm-6 changes from mm-4 (v7 mm-5 + v8):
 *  - bases lucky 60 / glimpse 120 / recall 160; lucky and glimpse hold the chain
 *  - gauge +2 / +1 / +0 (+1 Golden), drains 1 pip per consecutive scout after
 *    the first (no time drain), a slip empties it
 *  - Showtime lasts 5 resolved turns; its match values stack in a pot that
 *    pays in full when the burst ends (5 turns, a slip, or the board clears)
 *  - Photo Flash is a row or column pick, capped at 3 cards (Wide Flash 5)
 *  - one miss-hold rule: auto flip-back at 1500ms (Steady Hand 2500ms), touch
 *    and hold keeps the pair up to 2500ms; walking never changes it
 *  - Time Attack never freezes for looking away; it bleeds at 0.5x only while
 *    the line is moving and you are idle
 *  - Ride Sprint: overtime is look and sound only, the rope stops while a
 *    reveal is pending, the server's charged time reconciles the clock, and
 *    Signal Mode scores on turns
 *  - feature flags per mode mirror the 4.0 matrix (`modeFlags`)
 */

export const ENGINE_VERSION = 'mm-6';

export const FACE_UNKNOWN = -1;
/** Special faces. Deck faces are 0..99. */
export const FACE_GOLD = 900;
export const FACE_GULL = 901;

export const K_UNSEEN = 0;
export const K_GLIMPSED = 1;
export const K_SEEN = 2;
export const K_MATCHED = 3;

export type Verdict = 'recall' | 'glimpse' | 'lucky' | 'scout' | 'slip' | 'gull';
export type MatchGrade = 'recall' | 'glimpse' | 'lucky';
export type MMMode = 'warmup' | 'ride' | 'timeAttack' | 'daily' | 'race' | 'lineDuel' | 'practice';
export type MMStatus = 'play' | 'boardClear' | 'cleared' | 'timeout' | 'out';
export type PhotoAxis = 'row' | 'col';

/** Share-grid / ghost verdict codes (unchanged wire codes, 5 added in mm-6). */
export const V_RECALL = 0;
export const V_LUCKY = 1;
export const V_SCOUT = 2;
export const V_SLIP = 3;
export const V_GULL = 4;
export const V_GLIMPSE = 5;

export interface MMConfig {
  mode: MMMode;
  /** Starting clock. null = no clock (Warm-up, Daily, Signal Mode). */
  clockMs: number | null;
  /** Signal Mode: the try is scored on turns; timeout when this many turns pass uncleared. 0 = off. */
  signalTurns: number;
  /** Time Attack: 0.5x bleed while the line moves and you are idle. */
  lineBleed: boolean;
  idleMs: number;
  clockCapMs: number;
  matchBonusMs: number;
  clearBonusMs: number;
  slipPenaltyMs: number;
  goldenBonusMs: number;
  /** Automatic miss flip-back (Steady Hand charm: 2500). */
  autoHoldMs: number;
  /** Touch-and-hold keeps a miss up to this long after B landed. */
  touchHoldMs: number;
  quickWindowMs: number;
  /** 0 = QUICK off. */
  quickBonus: number;
  overtimeMs: number;
  /** Score multiplier during overtime (1 = look and sound only). */
  overtimeMult: number;
  /** Showtime gauge and pot. */
  gauge: boolean;
  gaugeMax: number;
  showtimeTurns: number;
  /** 0 = no strikes. Daily = 2 (two slips and out). */
  strikes: number;
  photoFlash: boolean;
  /** Photo Flash cap (Wide Flash charm: 5). */
  photoCap: number;
  tideShift: boolean;
  tideEvery: number;
  seagull: boolean;
  /** Heat bonus on the board-clear bonus, in percent (25 one toggle, 60 both). */
  heatPct: number;
  /** Fair Deck par and PERFECT (Daily, Line Duel, Race). */
  fair: boolean;
  finalBonusPerSec: number;
  perfectBonus: number;
}

export const BASE_CONFIG: MMConfig = {
  mode: 'ride',
  clockMs: 45000,
  signalTurns: 0,
  lineBleed: false,
  idleMs: 1500,
  clockCapMs: 45000,
  matchBonusMs: 0,
  clearBonusMs: 0,
  slipPenaltyMs: 0,
  goldenBonusMs: 3000,
  autoHoldMs: 1500,
  touchHoldMs: 2500,
  quickWindowMs: 1500,
  quickBonus: 0,
  overtimeMs: 10000,
  overtimeMult: 1,
  gauge: false,
  gaugeMax: 6,
  showtimeTurns: 5,
  strikes: 0,
  photoFlash: false,
  photoCap: 3,
  tideShift: false,
  tideEvery: 6,
  seagull: false,
  heatPct: 0,
  fair: false,
  finalBonusPerSec: 0,
  perfectBonus: 0,
};

/** Warm-up (4.0a): 4 pairs, no clock, gauge, specials or proof. */
export function warmupConfig(): MMConfig {
  return { ...BASE_CONFIG, mode: 'warmup', clockMs: null, clockCapMs: 0 };
}

/**
 * Ride Sprint: the paid Ride Challenge. Server config sets clockMs (45-50s).
 * `signalTurns` > 0 runs the try in Signal Mode (scored on turns, no clock).
 */
export function rideSprintConfig(clockMs = 45000, signalTurns = 0): MMConfig {
  const c = Math.max(45000, Math.min(50000, clockMs));
  if (signalTurns > 0) {
    return { ...BASE_CONFIG, mode: 'ride', clockMs: null, clockCapMs: 0, signalTurns, finalBonusPerSec: 0, perfectBonus: 100 };
  }
  return { ...BASE_CONFIG, mode: 'ride', clockMs: c, clockCapMs: c, finalBonusPerSec: 50, perfectBonus: 100 };
}

/** Time Attack: queue solo. Systems arrive one per board, each earned (modes/unlocks.ts). */
export function timeAttackConfig(): MMConfig {
  return {
    ...BASE_CONFIG,
    mode: 'timeAttack',
    clockMs: 30000,
    lineBleed: true,
    clockCapMs: 45000,
    matchBonusMs: 1500,
    clearBonusMs: 4000,
    slipPenaltyMs: 2000,
    overtimeMult: 2,
  };
}

/**
 * Memory Race: 45s, Showtime on, overtime x2, the Golden Coin pays x2 only.
 * The interim PRACTICE RACE on Line Party replays a tap log on a seeded layout
 * with a shared glimpse, so it is not a Fair Deck yet (v2 moves it onto
 * server Fair Deck sessions: pass `fair` then).
 */
export function raceConfig(fair = false): MMConfig {
  return {
    ...BASE_CONFIG,
    mode: 'race',
    clockMs: 45000,
    clockCapMs: 45000,
    goldenBonusMs: 0,
    gauge: true,
    overtimeMult: 2,
    fair,
  };
}

/** Line Duel: 45s charged clock on a Fair Deck, overtime look and sound only. */
export function lineDuelConfig(): MMConfig {
  return { ...BASE_CONFIG, mode: 'lineDuel', clockMs: 45000, clockCapMs: 45000, fair: true };
}

/** Daily Deck: Fair Deck, no clock, two slips and out. */
export function dailyConfig(): MMConfig {
  return { ...BASE_CONFIG, mode: 'daily', clockMs: null, clockCapMs: 0, goldenBonusMs: 0, strikes: 2, fair: true };
}

// -----------------------------------------------------------------------------
// The 4.0 mode matrix (the anti-Frankenstein rule)
// -----------------------------------------------------------------------------

export interface ModeFlags {
  clock: 'none' | 'charged' | 'bleed' | 'plain';
  scoreOnHud: boolean;
  golden: boolean;
  showtime: boolean;
  photoFlash: boolean;
  peek: boolean;
  quick: boolean;
  /** 'none' | 'look' (look and sound only) | 'x2'. */
  overtime: 'none' | 'look' | 'x2';
  heat: boolean;
  strikes: boolean;
  fair: boolean;
  glint: boolean;
  charm: boolean;
  railToken: boolean;
  ranked: boolean;
  paid: boolean;
}

const F = (o: Partial<ModeFlags>): ModeFlags => ({
  clock: 'none', scoreOnHud: false, golden: false, showtime: false, photoFlash: false, peek: false,
  quick: false, overtime: 'none', heat: false, strikes: false, fair: false, glint: false, charm: false,
  railToken: false, ranked: false, paid: false, ...o,
});

export const MODE_FLAGS: Record<MMMode, ModeFlags> = {
  warmup: F({ glint: true }),
  ride: F({ clock: 'charged', overtime: 'look', paid: true }),
  timeAttack: F({ clock: 'bleed', scoreOnHud: true, golden: true, showtime: true, photoFlash: true, peek: true, quick: true, overtime: 'x2', heat: true, glint: true, charm: true }),
  daily: F({ strikes: true, fair: true, railToken: true, ranked: true }),
  lineDuel: F({ clock: 'charged', overtime: 'look', fair: true, railToken: true, ranked: true }),
  race: F({ clock: 'plain', showtime: true, overtime: 'x2', fair: true }),
  practice: F({}),
};

export function modeFlags(mode: MMMode): ModeFlags {
  return MODE_FLAGS[mode] ?? MODE_FLAGS.practice;
}

// -----------------------------------------------------------------------------
// Events, actions, state
// -----------------------------------------------------------------------------

export interface MatchParts {
  base: number;
  chainHalves: number;
  showHalves: number;
  golden: boolean;
  overtime: boolean;
  quick: number;
  value: number;
}

export type MMEvent =
  | { k: 'flip'; slot: number; first: boolean }
  | {
      k: 'match'; a: number; b: number; grade: MatchGrade; recall: boolean; chain: number; parts: MatchParts;
      /** Chain tier crossed (2 or 3), 0 otherwise. */
      tierUp: number; face: number; last: boolean; pot: boolean;
      /** For recall arcs: the slot you saw earlier (the B card). */
      seenSlot: number;
    }
  | { k: 'scout'; a: number; b: number; run: number }
  | { k: 'slip'; a: number; b: number; kind: 'a' | 'b'; ghost: number }
  | { k: 'gullMiss'; a: number; b: number }
  | { k: 'hide'; a: number; b: number; quick: boolean }
  | { k: 'gauge'; pips: number; delta: number }
  | { k: 'showtimeOn'; slot: number }
  | { k: 'showtimeTurn'; left: number }
  | { k: 'showtimeWarn' }
  | { k: 'potPay'; value: number; pairs: number[] }
  | { k: 'showtimeOff'; reason: 'done' | 'slip' }
  | { k: 'photoPick'; slot: number }
  | { k: 'photoFlash'; slot: number; slots: number[]; axis: PhotoAxis }
  | { k: 'overtime' }
  | { k: 'second'; left: number }
  | { k: 'strike'; n: number }
  | { k: 'gullSwap'; s1: number; s2: number }
  | { k: 'tide'; row: number }
  | { k: 'boardClear'; bonus: number; board: number }
  | { k: 'cleared'; bonus: number; secondsLeft: number; perfect: boolean }
  | { k: 'timeout' }
  | { k: 'out' }
  | { k: 'clock'; deltaMs: number };

export type MMAction =
  | { t: 'tick'; at: number }
  | { t: 'flip'; slot: number; face: number; at: number }
  /** Quick dismiss of a miss hold (the view sends it before the next flip). */
  | { t: 'dismiss'; slot: number; at: number }
  /** Touch-and-hold on a missed card (keeps the pair up to touchHoldMs). */
  | { t: 'hold'; on: boolean; at: number }
  | { t: 'reveal'; slots: number[]; faces: number[]; at: number }
  | { t: 'peek'; slot: number; face: number; at: number }
  | { t: 'photoPick'; axis: PhotoAxis; at: number }
  | { t: 'walking'; on: boolean; at: number }
  | { t: 'lineMoving'; on: boolean; at: number }
  | { t: 'freeze'; on: boolean; at: number }
  /** A reveal is in flight (beyond 150ms): the rope stops. */
  | { t: 'pending'; on: boolean; at: number }
  /** Server charged time so far (Ride Sprint, Line Duel): reconciles the clock. */
  | { t: 'charged'; ms: number; at: number }
  | { t: 'deal'; cols: number; rows: number; at: number }
  /** Race attack (Gull Swap): two seen face-down cards swap. Queues while a card is up. */
  | { t: 'attack'; at: number };

export interface MMState {
  cfg: MMConfig;
  cols: number;
  rows: number;
  n: number;
  board: number;
  /** Card identity at each slot (moves with Tide Shift and gull swaps). */
  ids: number[];
  faces: number[];
  know: number[];
  moved: number[];
  up: number[];
  /** 0 idle, 1 one card up, 2 miss hold. */
  phase: number;
  a: number;
  b: number;
  holdSince: number;
  held: boolean;
  pendingGull: boolean;
  pendingAttack: number;
  turnStart: number;
  turns: number;
  boardTurns: number;
  pairs: number;
  pairsTotal: number;
  chain: number;
  maxChain: number;
  gauge: number;
  scoutRun: number;
  showTurnsLeft: number;
  showtimes: number;
  pot: number;
  /** Flat [a, b, ...] pairs sitting in the pot. */
  potPairs: number[];
  photoUsed: boolean;
  /** Slot of the pending Photo Flash pick (-1 none). */
  photoSlot: number;
  score: number;
  recalls: number;
  glimpses: number;
  luckies: number;
  scouts: number;
  slips: number;
  slipsA: number;
  slipsB: number;
  boardSlips: number;
  strikes: number;
  clockLeftMs: number;
  elapsedMs: number;
  lastTapAt: number;
  lastSecond: number;
  overtime: boolean;
  frozen: boolean;
  pending: boolean;
  lineMoving: boolean;
  status: MMStatus;
  turnTimes: number[];
  walking: boolean;
  walkOffAt: number;
  rng: number;
  gullsDone: boolean;
  turnsSinceTide: number;
  now: number;
  /** Flat [slot, at] flip log (proof, ghosts, replays); slot -1 = dismiss. */
  log: number[];
  /** Elapsed ms at each pair. */
  pairTimes: number[];
  /** Per-turn verdict codes (V_*): share grid and ghosts. */
  verdicts: number[];
  quicks: number;
  /** Glimpse matches made on a card you had peeked (Peek unlock ledger). */
  peekMatches: number;
  peeked: number[];
}

export interface EngineInit {
  cols: number;
  rows: number;
  seed: number;
}

function fill(n: number, v: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(v);
  return out;
}

export function createEngine(cfg: MMConfig, init: EngineInit): MMState {
  const n = init.cols * init.rows;
  const ids: number[] = [];
  for (let i = 0; i < n; i++) ids.push(i);
  return {
    cfg,
    cols: init.cols,
    rows: init.rows,
    n,
    board: 1,
    ids,
    faces: fill(n, FACE_UNKNOWN),
    know: fill(n, K_UNSEEN),
    moved: fill(n, 0),
    up: [],
    phase: 0,
    a: -1,
    b: -1,
    holdSince: 0,
    held: false,
    pendingGull: false,
    pendingAttack: 0,
    turnStart: 0,
    turns: 0,
    boardTurns: 0,
    pairs: 0,
    pairsTotal: n / 2,
    chain: 0,
    maxChain: 0,
    gauge: 0,
    scoutRun: 0,
    showTurnsLeft: 0,
    showtimes: 0,
    pot: 0,
    potPairs: [],
    photoUsed: false,
    photoSlot: -1,
    score: 0,
    recalls: 0,
    glimpses: 0,
    luckies: 0,
    scouts: 0,
    slips: 0,
    slipsA: 0,
    slipsB: 0,
    boardSlips: 0,
    strikes: 0,
    clockLeftMs: cfg.clockMs ?? 0,
    elapsedMs: 0,
    lastTapAt: -1e9,
    lastSecond: cfg.clockMs == null ? -1 : Math.ceil(cfg.clockMs / 1000),
    overtime: false,
    frozen: false,
    pending: false,
    lineMoving: false,
    status: 'play',
    turnTimes: [],
    walking: false,
    walkOffAt: -1e9,
    rng: (init.seed >>> 0) || 1,
    gullsDone: false,
    turnsSinceTide: 0,
    now: 0,
    log: [],
    pairTimes: [],
    verdicts: [],
    quicks: 0,
    peekMatches: 0,
    peeked: fill(n, 0),
  };
}

// -----------------------------------------------------------------------------
// Pure helpers (also used by the view and the PHP port)
// -----------------------------------------------------------------------------

/** Random layouts: expected turns for a perfect-memory player, rounded up (8 pairs = 13). */
export function parFor(pairs: number): number {
  return Math.ceil(1.614 * pairs);
}
/** Random layouts: PERFECT (8 pairs = 12). */
export function perfectFor(pairs: number): number {
  return Math.floor(1.614 * pairs - 0.511);
}
/** Fair Deck: PERFECT is exactly ceil(n/2) + n turns (8 pairs = 12). */
export function fairPerfectFor(pairs: number): number {
  return Math.ceil(pairs / 2) + pairs;
}
/** Fair Deck par = PERFECT + 2 (8 pairs = 14). */
export function fairParFor(pairs: number): number {
  return fairPerfectFor(pairs) + 2;
}

export function parOf(s: MMState): number {
  return s.cfg.fair ? fairParFor(s.pairsTotal) : parFor(s.pairsTotal);
}
export function perfectOf(s: MMState): number {
  return s.cfg.fair ? fairPerfectFor(s.pairsTotal) : perfectFor(s.pairsTotal);
}

/** Chain multiplier in halves: x1 / x1.5 / x2 at chain 3+. */
export function chainHalves(chain: number): number {
  return chain >= 3 ? 4 : chain === 2 ? 3 : 2;
}

export const BASE: Record<MatchGrade, number> = { lucky: 60, glimpse: 120, recall: 160 };

/** base * chainHalves * showHalves / 4, always an exact integer. */
export function matchValue(grade: MatchGrade | boolean, chain: number, showtime: boolean): number {
  const g: MatchGrade = grade === true ? 'recall' : grade === false ? 'lucky' : grade;
  return (BASE[g] * chainHalves(chain) * (showtime ? 3 : 2)) / 4;
}

/** Gauge gain per match grade (Golden Coin +1 more). */
export const GAUGE_GAIN: Record<MatchGrade, number> = { lucky: 0, glimpse: 1, recall: 2 };

export function isGull(face: number): boolean {
  return face === FACE_GULL;
}

function rand(s: MMState): number {
  // mulberry32 on an integer state (same stepping as core/rng).
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Clock rate at time t: 0 stopped, 0.5 line bleed, 1 full. */
function clockRate(s: MMState, t: number): number {
  if (s.frozen || s.pending || s.status !== 'play') return 0;
  if (s.cfg.clockMs == null) return 0;
  if (s.cfg.lineBleed && s.lineMoving && s.up.length === 0 && t - s.lastTapAt >= s.cfg.idleMs) return 0.5;
  return 1;
}

/** True while Time Attack's line bleed (0.5x) is on: the rim dims to 70%. */
export function isLineBleed(s: MMState): boolean {
  return clockRate(s, s.now) === 0.5;
}

export function inShowtime(s: MMState): boolean {
  return s.showTurnsLeft > 0;
}

function holdDue(s: MMState): number {
  if (s.held) return s.holdSince + Math.max(s.cfg.touchHoldMs, s.cfg.autoHoldMs);
  return s.holdSince + s.cfg.autoHoldMs;
}

function payPot(s: MMState, ev: MMEvent[]): void {
  if (s.pot > 0 || s.potPairs.length) {
    const value = s.pot;
    s.score += value;
    ev.push({ k: 'potPay', value, pairs: s.potPairs.slice() });
  }
  s.pot = 0;
  s.potPairs = [];
}

function endShowtime(s: MMState, ev: MMEvent[], reason: 'done' | 'slip'): void {
  if (!inShowtime(s)) return;
  s.showTurnsLeft = 0;
  s.gauge = 0;
  s.scoutRun = 0;
  payPot(s, ev);
  ev.push({ k: 'showtimeOff', reason });
}

function addClock(s: MMState, ms: number, ev: MMEvent[]): void {
  if (s.cfg.clockMs == null || ms === 0) return;
  const before = s.clockLeftMs;
  s.clockLeftMs = Math.max(0, Math.min(s.cfg.clockCapMs, s.clockLeftMs + ms));
  const d = s.clockLeftMs - before;
  if (d !== 0) ev.push({ k: 'clock', deltaMs: d });
  if (s.overtime && s.clockLeftMs > s.cfg.overtimeMs) s.overtime = false;
  s.lastSecond = Math.ceil(s.clockLeftMs / 1000);
}

function timeoutNow(s: MMState, ev: MMEvent[], at: number): void {
  if (s.phase === 2) hide(s, ev, false, at);
  endShowtime(s, ev, 'done');
  s.status = 'timeout';
  ev.push({ k: 'timeout' });
}

function clockEvents(s: MMState, ev: MMEvent[]): void {
  if (!s.overtime && s.clockLeftMs <= s.cfg.overtimeMs && s.clockLeftMs > 0) {
    s.overtime = true;
    ev.push({ k: 'overtime' });
  }
  const sec = Math.max(0, Math.ceil(s.clockLeftMs / 1000));
  if (sec !== s.lastSecond) {
    s.lastSecond = sec;
    ev.push({ k: 'second', left: sec });
  }
}

/** Advance time to `at`. */
function advance(s: MMState, at: number, ev: MMEvent[]): void {
  if (at <= s.now) return;
  let t = s.now;
  // Walk in slices so the hold and the bleed edge resolve at their exact times.
  while (t < at && s.status === 'play') {
    let next = at;
    if (s.phase === 2) {
      const due = holdDue(s);
      if (due > t && due < next) next = due;
    }
    if (s.cfg.lineBleed && s.lineMoving && s.up.length === 0) {
      const edge = s.lastTapAt + s.cfg.idleMs;
      if (edge > t && edge < next) next = edge;
    }
    const rate = clockRate(s, t);
    if (rate > 0) {
      // The clock may hit zero inside this slice.
      const runOut = t + s.clockLeftMs / rate;
      if (runOut < next) next = Math.max(t, runOut);
    }
    const dt = next - t;
    if (!s.frozen) s.elapsedMs += dt;
    if (rate > 0) {
      s.clockLeftMs -= dt * rate;
      if (s.clockLeftMs < 1e-6) s.clockLeftMs = 0;
      clockEvents(s, ev);
      if (s.clockLeftMs <= 0) {
        s.clockLeftMs = 0;
        s.now = next;
        timeoutNow(s, ev, next);
        return;
      }
    }
    t = next;
    s.now = t;
    if (s.phase === 2 && t >= holdDue(s)) hide(s, ev, false, t);
  }
  s.now = Math.max(s.now, at);
}

function hide(s: MMState, ev: MMEvent[], quick: boolean, at: number): void {
  const a = s.a;
  const b = s.b;
  s.up = [];
  s.phase = 0;
  s.a = -1;
  s.b = -1;
  s.held = false;
  s.turnStart = at;
  ev.push({ k: 'hide', a, b, quick });
  if (s.pendingGull) {
    s.pendingGull = false;
    gullSwap(s, ev);
  }
  flushAttacks(s, ev);
  maybeTide(s, ev, at);
}

function faceDownSeen(s: MMState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.n; i++) {
    if (s.know[i] === K_SEEN && s.up.indexOf(i) < 0 && !isGull(s.faces[i])) out.push(i);
  }
  return out;
}

function swapSlots(s: MMState, i: number, j: number): void {
  const arrs = [s.ids, s.faces, s.know, s.peeked];
  for (const arr of arrs) {
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  s.moved[i] = 1;
  s.moved[j] = 1;
}

function gullSwap(s: MMState, ev: MMEvent[]): void {
  if (s.walking || s.gullsDone || !s.cfg.seagull) return;
  const pool = faceDownSeen(s);
  if (pool.length < 2) return;
  const i = Math.floor(rand(s) * pool.length);
  let j = Math.floor(rand(s) * (pool.length - 1));
  if (j >= i) j += 1;
  const s1 = pool[i];
  const s2 = pool[j];
  swapSlots(s, s1, s2);
  ev.push({ k: 'gullSwap', s1, s2 });
}

/** Race Gull Swap: applies even while walking (opt-in competitive), never mid-turn. */
function attackSwap(s: MMState, ev: MMEvent[]): void {
  const pool = faceDownSeen(s);
  if (pool.length < 2) return;
  const i = Math.floor(rand(s) * pool.length);
  let j = Math.floor(rand(s) * (pool.length - 1));
  if (j >= i) j += 1;
  swapSlots(s, pool[i], pool[j]);
  ev.push({ k: 'gullSwap', s1: pool[i], s2: pool[j] });
}

function flushAttacks(s: MMState, ev: MMEvent[]): void {
  while (s.pendingAttack > 0 && s.phase === 0 && s.status === 'play') {
    s.pendingAttack -= 1;
    attackSwap(s, ev);
  }
}

/** Stationary gate for twists: not walking, and off for 3s. */
function stationary(s: MMState, at: number): boolean {
  return !s.walking && at - s.walkOffAt >= 3000;
}

function maybeTide(s: MMState, ev: MMEvent[], at: number): void {
  if (!s.cfg.tideShift || s.status !== 'play' || s.phase !== 0) return;
  if (s.turnsSinceTide < s.cfg.tideEvery || !stationary(s, at)) return;
  const rows: number[] = [];
  for (let r = 0; r < s.rows; r++) {
    let live = 0;
    for (let c = 0; c < s.cols; c++) if (s.know[r * s.cols + c] !== K_MATCHED) live++;
    if (live >= 2) rows.push(r);
  }
  if (!rows.length) return;
  const row = rows[Math.floor(rand(s) * rows.length)];
  const base = row * s.cols;
  // Rotate the row right by one with wrap-around (matched wells stay put in the view).
  const last = s.cols - 1;
  const arrs = [s.ids, s.faces, s.know, s.peeked];
  for (const arr of arrs) {
    const keep = arr[base + last];
    for (let c = last; c > 0; c--) arr[base + c] = arr[base + c - 1];
    arr[base] = keep;
  }
  for (let c = 0; c < s.cols; c++) if (s.know[base + c] !== K_MATCHED) s.moved[base + c] = 1;
  s.turnsSinceTide = 0;
  ev.push({ k: 'tide', row });
}

/**
 * Photo Flash (5.3): up to `cap` unflipped, unmatched cards on the trigger
 * well's row or column, nearest the well first (ties: lower slot first).
 */
export function photoSlots(s: MMState, slot: number, axis: PhotoAxis, cap = s.cfg.photoCap): number[] {
  const r = Math.floor(slot / s.cols);
  const c = slot % s.cols;
  const cand: number[] = [];
  for (let i = 0; i < s.n; i++) {
    if (i === slot) continue;
    const ri = Math.floor(i / s.cols);
    const ci = i % s.cols;
    const on = axis === 'row' ? ri === r : ci === c;
    if (!on || s.know[i] === K_MATCHED || s.up.indexOf(i) >= 0) continue;
    if (s.know[i] === K_SEEN) continue; // already yours: a flash never wastes a slot on it
    cand.push(i);
  }
  cand.sort((x, y) => {
    const dx = axis === 'row' ? Math.abs((x % s.cols) - c) : Math.abs(Math.floor(x / s.cols) - r);
    const dy = axis === 'row' ? Math.abs((y % s.cols) - c) : Math.abs(Math.floor(y / s.cols) - r);
    return dx - dy || x - y;
  });
  return cand.slice(0, Math.max(0, cap));
}

function gradeOf(knowB: number): MatchGrade {
  return knowB === K_SEEN ? 'recall' : knowB === K_GLIMPSED ? 'glimpse' : 'lucky';
}

function tickShowtime(s: MMState, ev: MMEvent[], wasShow: boolean): void {
  if (!wasShow || !inShowtime(s)) return;
  s.showTurnsLeft -= 1;
  if (s.showTurnsLeft <= 0) {
    s.showTurnsLeft = 1;
    endShowtime(s, ev, 'done');
    return;
  }
  ev.push({ k: 'showtimeTurn', left: s.showTurnsLeft });
  if (s.showTurnsLeft === 1) ev.push({ k: 'showtimeWarn' });
}

function resolveTurn(s: MMState, at: number, ev: MMEvent[], knowB: number): void {
  const a = s.a;
  const b = s.b;
  const fa = s.faces[a];
  const fb = s.faces[b];
  s.turns += 1;
  s.boardTurns += 1;
  s.turnsSinceTide += 1;
  const turnTime = Math.max(0, at - s.turnStart);
  s.turnTimes.push(turnTime);
  const wasShow = inShowtime(s);
  const gullMiss = isGull(fa) !== isGull(fb);

  if (!gullMiss && fa === fb) {
    const grade = gradeOf(knowB);
    const tierBefore = chainHalves(s.chain);
    if (grade === 'recall') {
      s.chain += 1;
      s.recalls += 1;
      if (s.chain > s.maxChain) s.maxChain = s.chain;
      s.verdicts.push(V_RECALL);
    } else if (grade === 'glimpse') {
      s.glimpses += 1;
      s.verdicts.push(V_GLIMPSE);
      if (s.peeked[b] || s.peeked[a]) s.peekMatches += 1;
    } else {
      s.luckies += 1;
      s.verdicts.push(V_LUCKY);
    }
    const tierAfter = chainHalves(s.chain);
    s.scoutRun = 0;
    s.pairs += 1;
    s.know[a] = K_MATCHED;
    s.know[b] = K_MATCHED;
    const golden = fa === FACE_GOLD;
    const ch = chainHalves(s.chain);
    const sh = wasShow ? 3 : 2;
    let value = (BASE[grade] * ch * sh) / 4;
    if (golden) value *= 2;
    const overtime = s.cfg.clockMs != null && s.overtime && s.cfg.overtimeMult > 1;
    if (overtime) value *= s.cfg.overtimeMult;
    const quick = s.cfg.quickBonus > 0 && turnTime <= s.cfg.quickWindowMs ? s.cfg.quickBonus : 0;
    if (quick) s.quicks += 1;
    if (wasShow) {
      s.pot += value + quick;
      s.potPairs.push(a, b);
    } else {
      s.score += value + quick;
    }
    if (isGull(fa)) s.gullsDone = true;
    const last = s.pairs >= s.pairsTotal;
    ev.push({
      k: 'match', a, b, grade, recall: grade === 'recall', chain: s.chain, face: fa, last, pot: wasShow,
      tierUp: tierAfter > tierBefore ? (s.chain >= 3 ? 3 : 2) : 0,
      seenSlot: b,
      parts: { base: BASE[grade], chainHalves: ch, showHalves: sh, golden, overtime, quick, value: value + quick },
    });
    s.pairTimes.push(s.elapsedMs);
    s.up = [];
    s.phase = 0;
    s.a = -1;
    s.b = -1;
    s.turnStart = at;
    for (let i = 0; i < s.n; i++) s.moved[i] = 0;
    // Clock rewards.
    if (golden) addClock(s, s.cfg.goldenBonusMs, ev);
    addClock(s, s.cfg.matchBonusMs, ev);
    // Showtime gauge.
    if (s.cfg.gauge && !wasShow) {
      const add = GAUGE_GAIN[grade] + (golden ? 1 : 0);
      const before = s.gauge;
      s.gauge = Math.min(s.cfg.gaugeMax, s.gauge + add);
      if (s.gauge !== before) ev.push({ k: 'gauge', pips: s.gauge, delta: s.gauge - before });
      if (s.gauge >= s.cfg.gaugeMax && !last) {
        s.showtimes += 1;
        s.showTurnsLeft = s.cfg.showtimeTurns;
        ev.push({ k: 'showtimeOn', slot: b });
        if (s.cfg.photoFlash && !s.photoUsed) {
          s.photoUsed = true;
          s.photoSlot = b;
          ev.push({ k: 'photoPick', slot: b });
        }
      }
    }
    if (last) {
      finishBoard(s, ev);
      return;
    }
    tickShowtime(s, ev, wasShow);
    signalCheck(s, ev, at);
    flushAttacks(s, ev);
    maybeTide(s, ev, at);
    return;
  }

  // Miss.
  s.phase = 2;
  s.holdSince = at;
  s.held = false;
  s.up = [a, b];
  let partner = -1;
  for (let i = 0; i < s.n; i++) {
    if (i !== a && i !== b && s.faces[i] === fa && s.know[i] === K_SEEN) {
      partner = i;
      break;
    }
  }
  const movedInvolved = s.moved[a] === 1 || s.moved[b] === 1 || (partner >= 0 && s.moved[partner] === 1);
  for (let i = 0; i < s.n; i++) s.moved[i] = 0;
  s.know[b] = K_SEEN;
  if (gullMiss) {
    s.verdicts.push(V_GULL);
    s.pendingGull = true;
    ev.push({ k: 'gullMiss', a, b });
    tickShowtime(s, ev, wasShow);
    signalCheck(s, ev, at);
    return;
  }
  const slipA = partner >= 0;
  const slipB = knowB === K_SEEN;
  if (!movedInvolved && (slipA || slipB)) {
    s.slips += 1;
    s.boardSlips += 1;
    if (slipA) s.slipsA += 1;
    else s.slipsB += 1;
    s.verdicts.push(V_SLIP);
    s.chain = 0;
    s.scoutRun = 0;
    if (wasShow) endShowtime(s, ev, 'slip');
    if (s.gauge > 0) ev.push({ k: 'gauge', pips: 0, delta: -s.gauge });
    s.gauge = 0;
    ev.push({ k: 'slip', a, b, kind: slipA ? 'a' : 'b', ghost: slipA ? partner : -1 });
    if (s.cfg.slipPenaltyMs) addClock(s, -s.cfg.slipPenaltyMs, ev);
    if (s.cfg.strikes > 0) {
      s.strikes += 1;
      ev.push({ k: 'strike', n: s.strikes });
      if (s.strikes >= s.cfg.strikes) {
        s.status = 'out';
        ev.push({ k: 'out' });
        return;
      }
    }
    if (s.cfg.clockMs != null && s.clockLeftMs <= 0) {
      timeoutNow(s, ev, at);
      return;
    }
    signalCheck(s, ev, at);
    return;
  }
  s.scouts += 1;
  s.scoutRun += 1;
  s.verdicts.push(V_SCOUT);
  ev.push({ k: 'scout', a, b, run: s.scoutRun });
  if (s.cfg.gauge && !wasShow && s.scoutRun >= 2 && s.gauge > 0) {
    s.gauge -= 1;
    ev.push({ k: 'gauge', pips: s.gauge, delta: -1 });
  }
  tickShowtime(s, ev, wasShow);
  signalCheck(s, ev, at);
}

/** Signal Mode: out of turns without a clear is a timeout. */
function signalCheck(s: MMState, ev: MMEvent[], at: number): void {
  if (s.cfg.signalTurns <= 0 || s.status !== 'play') return;
  if (s.turns >= s.cfg.signalTurns) timeoutNow(s, ev, at);
}

function finishBoard(s: MMState, ev: MMEvent[]): void {
  const pairs = s.pairsTotal;
  const under = Math.max(0, parOf(s) - s.boardTurns);
  const perfect = s.boardTurns <= perfectOf(s);
  endShowtime(s, ev, 'done');
  s.photoSlot = -1;
  if (s.cfg.mode === 'timeAttack') {
    let bonus = 250 * s.board + 100 * under;
    if (s.cfg.heatPct > 0) bonus = Math.round((bonus * (100 + s.cfg.heatPct)) / 100);
    s.score += bonus;
    addClock(s, s.cfg.clearBonusMs, ev);
    s.status = 'boardClear';
    ev.push({ k: 'boardClear', bonus, board: s.board });
    return;
  }
  void pairs;
  let bonus = 0;
  const secondsLeft = s.cfg.clockMs == null ? 0 : Math.floor(s.clockLeftMs / 1000);
  if (s.cfg.mode === 'daily') {
    bonus = 100 * under + (perfect ? 100 : 0) + (s.strikes === 0 ? 150 : 0);
  } else {
    bonus = s.cfg.finalBonusPerSec * secondsLeft + (perfect ? s.cfg.perfectBonus : 0);
  }
  s.score += bonus;
  s.status = 'cleared';
  ev.push({ k: 'cleared', bonus, secondsLeft, perfect });
}

// -----------------------------------------------------------------------------
// The reducer
// -----------------------------------------------------------------------------

/** Apply one action. Mutates `s` in place (hot path) and returns its events. */
export function step(s: MMState, action: MMAction): MMEvent[] {
  const ev: MMEvent[] = [];
  const at = action.at;
  if (action.t === 'deal') {
    dealBoard(s, action.cols, action.rows, at);
    return ev;
  }
  advance(s, at, ev);
  switch (action.t) {
    case 'tick':
      return ev;
    case 'walking': {
      if (s.walking && !action.on) s.walkOffAt = at;
      s.walking = action.on;
      return ev;
    }
    case 'lineMoving': {
      s.lineMoving = action.on;
      return ev;
    }
    case 'pending': {
      s.pending = action.on;
      return ev;
    }
    case 'charged': {
      if (s.cfg.clockMs == null || s.status !== 'play') return ev;
      s.clockLeftMs = Math.max(0, s.cfg.clockMs - Math.max(0, action.ms));
      clockEvents(s, ev);
      if (s.clockLeftMs <= 0) timeoutNow(s, ev, at);
      return ev;
    }
    case 'hold': {
      if (s.phase !== 2 || s.status !== 'play') {
        s.held = false;
        return ev;
      }
      s.held = action.on;
      if (!action.on && at >= holdDue(s)) hide(s, ev, false, at);
      return ev;
    }
    case 'attack': {
      if (s.status !== 'play') return ev;
      s.pendingAttack += 1;
      flushAttacks(s, ev);
      return ev;
    }
    case 'freeze': {
      s.frozen = action.on;
      if (!action.on) s.turnStart = at;
      return ev;
    }
    case 'reveal': {
      for (let i = 0; i < action.slots.length; i++) {
        const slot = action.slots[i];
        if (slot < 0 || slot >= s.n) continue;
        if (s.faces[slot] === FACE_UNKNOWN) s.faces[slot] = action.faces[i];
        if (s.know[slot] === K_UNSEEN) s.know[slot] = K_GLIMPSED;
      }
      return ev;
    }
    case 'peek': {
      const slot = action.slot;
      if (slot < 0 || slot >= s.n || s.know[slot] === K_MATCHED) return ev;
      s.faces[slot] = action.face;
      if (s.know[slot] === K_UNSEEN) {
        s.know[slot] = K_GLIMPSED;
        s.peeked[slot] = 1;
      }
      return ev;
    }
    case 'photoPick': {
      if (s.photoSlot < 0 || s.status !== 'play') return ev;
      const slot = s.photoSlot;
      s.photoSlot = -1;
      const slots = photoSlots(s, slot, action.axis);
      if (slots.length) ev.push({ k: 'photoFlash', slot, slots, axis: action.axis });
      return ev;
    }
    case 'dismiss': {
      if (s.phase === 2 && s.status === 'play') {
        hide(s, ev, true, at);
        s.lastTapAt = at;
        s.log.push(-1, at);
      }
      return ev;
    }
    case 'flip':
      break;
    default:
      return ev;
  }
  if (s.status !== 'play' || s.frozen) return ev;
  const slot = action.slot;
  if (slot < 0 || slot >= s.n || s.know[slot] === K_MATCHED) return ev;
  if (s.phase === 2) {
    const tappedHeld = slot === s.a || slot === s.b;
    hide(s, ev, true, at);
    s.lastTapAt = at;
    if (tappedHeld || s.status !== 'play') return ev;
    // Moves (gull, tide) may have changed what sits under this slot; the tap
    // still flips whatever card is there now.
  } else if (s.up.indexOf(slot) >= 0) {
    return ev;
  }
  s.lastTapAt = at;
  s.faces[slot] = action.face;
  s.log.push(slot, at);
  if (s.phase === 0) {
    s.a = slot;
    s.phase = 1;
    s.up = [slot];
    s.know[slot] = K_SEEN;
    ev.push({ k: 'flip', slot, first: true });
    return ev;
  }
  const knowB = s.know[slot];
  s.b = slot;
  s.up = [s.a, slot];
  ev.push({ k: 'flip', slot, first: false });
  resolveTurn(s, at, ev, knowB);
  return ev;
}

/** Start a fresh board (Time Attack staircase). Clock, chain, gauge and score carry. */
export function dealBoard(s: MMState, cols: number, rows: number, at: number): void {
  const n = cols * rows;
  s.cols = cols;
  s.rows = rows;
  s.n = n;
  s.ids = [];
  for (let i = 0; i < n; i++) s.ids.push(i);
  s.faces = fill(n, FACE_UNKNOWN);
  s.know = fill(n, K_UNSEEN);
  s.moved = fill(n, 0);
  s.peeked = fill(n, 0);
  s.up = [];
  s.phase = 0;
  s.a = -1;
  s.b = -1;
  s.held = false;
  s.pendingGull = false;
  s.pendingAttack = 0;
  s.pairs = 0;
  s.pairsTotal = n / 2;
  s.boardTurns = 0;
  s.boardSlips = 0;
  s.photoUsed = false;
  s.photoSlot = -1;
  s.gullsDone = false;
  s.turnsSinceTide = 0;
  s.board = s.status === 'boardClear' ? s.board + 1 : s.board;
  if (s.status === 'boardClear') s.status = 'play';
  s.now = Math.max(s.now, at);
  s.turnStart = at;
}

// -----------------------------------------------------------------------------
// Time Attack staircase and per-board config
// -----------------------------------------------------------------------------

export const GRID_FOR_PAIRS: Record<number, [number, number]> = { 4: [4, 2], 6: [4, 3], 8: [4, 4], 10: [4, 5] };

/** 0-1 slips: +2 pairs, 2-3: same, 4+: -2. Sizes 6/8/10. */
export function nextPairs(pairs: number, boardSlips: number): number {
  const next = boardSlips <= 1 ? pairs + 2 : boardSlips >= 4 ? pairs - 2 : pairs;
  return Math.max(6, Math.min(10, next));
}

/** Glimpse length by size, -100ms per repeat of that size, floor 600. */
export function glimpseMs(pairs: number, repeats: number): number {
  const base = pairs <= 6 ? 1200 : pairs <= 8 ? 1000 : 800;
  return Math.max(600, base - 100 * repeats);
}

export interface BoardSystems {
  golden: boolean;
  showtime: boolean;
  photoFlash: boolean;
  peek: boolean;
  quick: boolean;
  tideShift: boolean;
  seagull: boolean;
  heatPct: number;
}

/** Active modifiers (twists or hazards) on a board. Must stay <= 2. */
export function modifierCount(sys: Pick<BoardSystems, 'tideShift' | 'seagull'>): number {
  return (sys.tideShift ? 1 : 0) + (sys.seagull ? 1 : 0);
}

/** Apply a board's systems to the engine config (Time Attack). */
export function applySystems(s: MMState, sys: BoardSystems, charms?: { wideFlash?: boolean; steadyHand?: boolean }): void {
  s.cfg = {
    ...s.cfg,
    gauge: sys.showtime,
    photoFlash: sys.photoFlash,
    photoCap: charms?.wideFlash ? 5 : 3,
    autoHoldMs: charms?.steadyHand ? 2500 : 1500,
    quickBonus: sys.quick ? 25 : 0,
    tideShift: sys.tideShift,
    seagull: sys.seagull,
    heatPct: sys.heatPct,
  };
}

// -----------------------------------------------------------------------------
// Stars, coin editions, grades, tips
// -----------------------------------------------------------------------------

/** Charged ms used so far (Ride Sprint, Line Duel). */
export function chargedElapsed(s: MMState): number {
  return s.cfg.clockMs == null ? s.elapsedMs : s.cfg.clockMs - s.clockLeftMs;
}

/**
 * Ride Sprint (4.1): 1 = clear; 2 = par + 3 or fewer turns; 3 = at or under par
 * and within 30s of charged time. Signal Mode: turns only.
 */
export function rideStars(s: MMState): number {
  if (s.status !== 'cleared') return 0;
  const par = parFor(s.pairsTotal);
  if (s.cfg.signalTurns > 0) {
    if (s.turns <= par) return 3;
    if (s.turns <= par + 3) return 2;
    return 1;
  }
  if (s.turns <= par && chargedElapsed(s) <= 30000) return 3;
  if (s.turns <= par + 3) return 2;
  return 1;
}

/** Daily (Fair Deck): 1 clear; 2 at or under par (14); 3 PERFECT (12) with no strike. */
export function dailyStars(s: MMState): number {
  if (s.status !== 'cleared') return 0;
  if (s.turns <= fairPerfectFor(s.pairsTotal) && s.strikes === 0) return 3;
  if (s.turns <= fairParFor(s.pairsTotal)) return 2;
  return 1;
}

/** Time Attack: 1 = reach B2, 2 = clear B3, 3 = clear B5. `cleared` = boards cleared. */
export function timeAttackStars(cleared: number): number {
  if (cleared >= 5) return 3;
  if (cleared >= 3) return 2;
  if (cleared >= 1) return 1;
  return 0;
}

export type CoinEdition = 'none' | 'bronze' | 'silver' | 'gold';
const EDITION_RANK: CoinEdition[] = ['none', 'bronze', 'silver', 'gold'];

/** Stars mint the ride coin edition (5.6). */
export function editionForStars(stars: number): CoinEdition {
  return stars >= 3 ? 'gold' : stars === 2 ? 'silver' : stars === 1 ? 'bronze' : 'none';
}

/** A later Ticket can upgrade the edition, never downgrade it. */
export function upgradeEdition(prev: CoinEdition | null | undefined, next: CoinEdition): { edition: CoinEdition; upgraded: boolean } {
  const p = EDITION_RANK.indexOf(prev ?? 'none');
  const n = EDITION_RANK.indexOf(next);
  if (n > p) return { edition: next, upgraded: p > 0 };
  return { edition: EDITION_RANK[Math.max(0, p)], upgraded: false };
}

export type Grade = 'S' | 'A' | 'B' | 'C';

export interface Grades {
  memory: Grade;
  speed: Grade;
  chain: Grade;
  memoryRatio: number;
  medianTurnMs: number;
  chainRatio: number;
  tip: string;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = xs.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

const RANK: Grade[] = ['S', 'A', 'B', 'C'];

/** RECALL % on results: recall matches over recall chances (recalls + slips). */
export function recallPct(s: MMState): number {
  const denom = s.recalls + s.slips;
  return denom === 0 ? 0 : Math.round((100 * s.recalls) / denom);
}

export function gradesFor(s: MMState, pairsOnBoard = s.pairsTotal): Grades {
  const denom = s.recalls + s.slips;
  const memoryRatio = denom === 0 ? 0 : s.recalls / denom;
  const memory: Grade =
    memoryRatio >= 1 && s.recalls >= 3 ? 'S' : memoryRatio >= 0.9 ? 'A' : memoryRatio >= 0.75 ? 'B' : 'C';
  const med = median(s.turnTimes);
  const speed: Grade = s.turnTimes.length === 0 ? 'C' : med <= 1200 ? 'S' : med <= 1600 ? 'A' : med <= 2200 ? 'B' : 'C';
  const chainRatio = pairsOnBoard > 0 ? s.maxChain / pairsOnBoard : 0;
  const chain: Grade = chainRatio >= 0.75 ? 'S' : chainRatio >= 0.5 ? 'A' : chainRatio >= 0.3 ? 'B' : 'C';
  return { memory, speed, chain, memoryRatio, medianTurnMs: med, chainRatio, tip: tipFor(s, memory, speed, chain) };
}

export const TIPS = {
  slipA: 'You flipped a new card when you knew the match. Go for the one you saw.',
  slipB: "You tapped a card you'd seen that wasn't the match. Try a new card instead.",
  speed: 'Tap your next card during a miss. It flips them back instantly.',
  chain: 'Cash in pairs you know before flipping new cards.',
  perfect: 'Perfect read. Try the Daily.',
};

export function tipFor(s: MMState, memory: Grade, speed: Grade, chain: Grade): string {
  if (memory === 'S' && speed === 'S' && chain === 'S') return TIPS.perfect;
  const r = (g: Grade) => RANK.indexOf(g);
  const worst = Math.max(r(memory), r(speed), r(chain));
  if (r(memory) === worst && s.slips > 0) return s.slipsA >= s.slipsB ? TIPS.slipA : TIPS.slipB;
  if (r(speed) === worst) return TIPS.speed;
  if (r(chain) === worst) return TIPS.chain;
  return s.slipsA >= s.slipsB ? TIPS.slipA : TIPS.slipB;
}

/** Lucky pairs on this board, for the honest results chip. */
export function luckyChip(s: MMState): string {
  return `This board: ${s.luckies} lucky pair${s.luckies === 1 ? '' : 's'}`;
}

// -----------------------------------------------------------------------------
// Replay (proof and golden vectors)
// -----------------------------------------------------------------------------

/** Replay a flip log against a full layout. Returns the final state. */
export function replayLog(cfg: MMConfig, init: EngineInit, faces: number[], log: number[], endAt?: number): MMState {
  const s = createEngine(cfg, init);
  for (let i = 0; i + 1 < log.length; i += 2) {
    const slot = log[i];
    const at = log[i + 1];
    if (slot < 0) {
      step(s, { t: 'dismiss', slot: -1, at });
      continue;
    }
    if (s.phase === 2) step(s, { t: 'dismiss', slot, at });
    else step(s, { t: 'tick', at });
    step(s, { t: 'flip', slot, face: faces[s.ids[slot]], at });
  }
  if (endAt != null) step(s, { t: 'tick', at: endAt });
  return s;
}

/** A compact, JSON-safe summary for proofs, ghosts and parity vectors. */
export function summarize(s: MMState): Record<string, number | string> {
  return {
    status: s.status,
    score: s.score,
    turns: s.turns,
    pairs: s.pairs,
    chain: s.chain,
    maxChain: s.maxChain,
    gauge: s.gauge,
    recalls: s.recalls,
    glimpses: s.glimpses,
    luckies: s.luckies,
    scouts: s.scouts,
    slips: s.slips,
    strikes: s.strikes,
    showtimes: s.showtimes,
    clockLeftMs: Math.round(s.clockLeftMs),
  };
}
