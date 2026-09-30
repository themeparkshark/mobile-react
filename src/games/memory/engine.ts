/**
 * engine.ts: Memory Match rules engine (design doc v4, "mm-4").
 *
 * A pure, deterministic reducer. Time is always passed in (session ms that
 * exclude pauses), so the same action log replays to the same state on the
 * client, in node tests and in the PHP port (engine.vectors.json).
 *
 *   let s = createEngine(cfg, { cols: 4, rows: 4, seed });
 *   const ev = step(s, { t: 'flip', slot: 5, face: 3, at: 1830 });
 *
 * The engine never needs the whole layout: a face is learned when it is
 * flipped, glimpsed, peeked or photo-flashed. That is what lets the Ride Sprint
 * and Daily run on server-revealed boards with the exact same code.
 *
 * Classification (3.2): recall match, lucky match, scout, slip, gull miss.
 * The chain only breaks on a slip. Knowledge: unseen, glimpsed (shown to you,
 * helps only), seen (you flipped it), matched.
 */

export const ENGINE_VERSION = 'mm-4';

export const FACE_UNKNOWN = -1;
/** Special faces. Deck faces are 0..99. */
export const FACE_GOLD = 900;
export const FACE_GULL = 901;

export const K_UNSEEN = 0;
export const K_GLIMPSED = 1;
export const K_SEEN = 2;
export const K_MATCHED = 3;

export type Verdict = 'recall' | 'lucky' | 'scout' | 'slip' | 'gull';
export type MMMode = 'ride' | 'timeAttack' | 'daily' | 'race' | 'practice';
export type MMStatus = 'play' | 'boardClear' | 'cleared' | 'timeout' | 'out';

export interface MMConfig {
  mode: MMMode;
  /** Starting clock. null = no clock (Daily Sudden Death). */
  clockMs: number | null;
  /** Time Attack look-away clock: only drains while a card is up or you tapped recently. */
  activeClock: boolean;
  lookAwayMs: number;
  clockCapMs: number;
  matchBonusMs: number;
  clearBonusMs: number;
  slipPenaltyMs: number;
  goldenBonusMs: number;
  holdMaxMs: number;
  holdMaxWalkMs: number;
  quickWindowMs: number;
  quickBonus: number;
  overtimeMs: number;
  gaugeMax: number;
  drainMs: number;
  showtimeMs: number;
  /** Daily: Showtime lasts N resolved turns instead of clock time. */
  showtimeTurns: number;
  /** 0 = no strikes. Daily = 2 (two slips and out). */
  strikes: number;
  photoFlash: boolean;
  tideShift: boolean;
  tideEvery: number;
  seagull: boolean;
  finalBonusPerSec: number;
}

export const BASE_CONFIG: MMConfig = {
  mode: 'ride',
  clockMs: 45000,
  activeClock: false,
  lookAwayMs: 1500,
  clockCapMs: 45000,
  matchBonusMs: 0,
  clearBonusMs: 0,
  slipPenaltyMs: 0,
  goldenBonusMs: 3000,
  holdMaxMs: 1500,
  holdMaxWalkMs: 2500,
  quickWindowMs: 1500,
  quickBonus: 25,
  overtimeMs: 10000,
  gaugeMax: 6,
  drainMs: 2000,
  showtimeMs: 8000,
  showtimeTurns: 0,
  strikes: 0,
  photoFlash: false,
  tideShift: false,
  tideEvery: 6,
  seagull: false,
  finalBonusPerSec: 50,
};

/** Ride Sprint: the paid Ride Challenge. Server config sets clockMs (45-50s). */
export function rideSprintConfig(clockMs = 45000): MMConfig {
  const c = Math.max(45000, Math.min(50000, clockMs));
  return { ...BASE_CONFIG, mode: 'ride', clockMs: c, clockCapMs: c + 30000 };
}

/** Time Attack: queue solo. Systems unlock per board (see boardSystems). */
export function timeAttackConfig(): MMConfig {
  return {
    ...BASE_CONFIG,
    mode: 'timeAttack',
    clockMs: 30000,
    activeClock: true,
    clockCapMs: 45000,
    matchBonusMs: 1500,
    clearBonusMs: 4000,
    slipPenaltyMs: 2000,
    finalBonusPerSec: 0,
  };
}

/** Memory Race: 45s round cap on a mirrored board; the Golden Coin pays x2 only. */
export function raceConfig(): MMConfig {
  return { ...BASE_CONFIG, mode: 'race', clockMs: 45000, clockCapMs: 45000, goldenBonusMs: 0, finalBonusPerSec: 0 };
}

/** Daily Deck: no clock, two slips and out, Showtime counts turns. */
export function dailyConfig(): MMConfig {
  return {
    ...BASE_CONFIG,
    mode: 'daily',
    clockMs: null,
    goldenBonusMs: 0,
    showtimeTurns: 4,
    strikes: 2,
    photoFlash: true,
    finalBonusPerSec: 0,
  };
}

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
  | { k: 'match'; a: number; b: number; recall: boolean; chain: number; parts: MatchParts; tierUp: boolean; face: number; last: boolean }
  | { k: 'scout'; a: number; b: number }
  | { k: 'slip'; a: number; b: number; kind: 'a' | 'b'; ghost: number }
  | { k: 'gullMiss'; a: number; b: number }
  | { k: 'hide'; a: number; b: number; quick: boolean }
  | { k: 'gauge'; pips: number; delta: number }
  | { k: 'showtimeOn'; slot: number }
  | { k: 'showtimeWarn' }
  | { k: 'showtimeOff'; reason: 'done' | 'slip' }
  | { k: 'photoFlash'; slot: number; slots: number[] }
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
  | { t: 'reveal'; slots: number[]; faces: number[]; at: number }
  | { t: 'peek'; slot: number; face: number; at: number }
  | { t: 'walking'; on: boolean; at: number }
  | { t: 'freeze'; on: boolean; at: number }
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
  drain: number;
  showLeftMs: number;
  showTurnsLeft: number;
  showWarned: boolean;
  showtimes: number;
  photoUsed: boolean;
  score: number;
  recalls: number;
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
  status: MMStatus;
  turnTimes: number[];
  walking: boolean;
  walkOffAt: number;
  rng: number;
  gullsDone: boolean;
  turnsSinceTide: number;
  now: number;
  /** Flat [slot, at] flip log (proof, ghosts, replays). */
  log: number[];
  /** Elapsed ms at each pair (PB ghost lane). */
  pairTimes: number[];
  /** Per-turn verdict codes for the share grid: 0 recall 1 lucky 2 scout 3 slip 4 gull. */
  verdicts: number[];
  quicks: number;
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
    drain: 0,
    showLeftMs: 0,
    showTurnsLeft: 0,
    showWarned: false,
    showtimes: 0,
    photoUsed: false,
    score: 0,
    recalls: 0,
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
    status: 'play',
    turnTimes: [],
    walking: false,
    walkOffAt: 0,
    rng: (init.seed >>> 0) || 1,
    gullsDone: false,
    turnsSinceTide: 0,
    now: 0,
    log: [],
    pairTimes: [],
    verdicts: [],
    quicks: 0,
  };
}

// -----------------------------------------------------------------------------
// Pure helpers (also used by the view and the PHP port)
// -----------------------------------------------------------------------------

/** Expected turns for a perfect-memory player: 1.614n - 0.511. */
export function parFor(pairs: number): number {
  return Math.ceil(1.614 * pairs);
}
export function perfectFor(pairs: number): number {
  return Math.floor(1.614 * pairs - 0.511);
}

/** Chain multiplier in halves: x1 / x1.5 / x2 at chain 3+. */
export function chainHalves(chain: number): number {
  return chain >= 3 ? 4 : chain === 2 ? 3 : 2;
}

/** base * chainHalves * showHalves / 4, always an exact integer. */
export function matchValue(recall: boolean, chain: number, showtime: boolean): number {
  const base = recall ? 160 : 100;
  return (base * chainHalves(chain) * (showtime ? 3 : 2)) / 4;
}

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

function clockRunning(s: MMState, at: number): boolean {
  if (s.frozen || s.status !== 'play') return false;
  if (s.cfg.clockMs == null) return false;
  if (!s.cfg.activeClock) return true;
  return s.up.length > 0 || at - s.lastTapAt < s.cfg.lookAwayMs;
}

/** True while the Time Attack look-away grace has frozen the clock. */
export function isLookAway(s: MMState): boolean {
  return s.cfg.activeClock && s.status === 'play' && !s.frozen && !clockRunning(s, s.now);
}

export function inShowtime(s: MMState): boolean {
  return s.showLeftMs > 0 || s.showTurnsLeft > 0;
}

function holdMax(s: MMState): number {
  return s.walking ? s.cfg.holdMaxWalkMs : s.cfg.holdMaxMs;
}

function endShowtime(s: MMState, ev: MMEvent[], reason: 'done' | 'slip'): void {
  if (!inShowtime(s)) return;
  s.showLeftMs = 0;
  s.showTurnsLeft = 0;
  s.showWarned = false;
  s.gauge = 0;
  s.drain = 0;
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

/** Advance time to `at`. */
function advance(s: MMState, at: number, ev: MMEvent[]): void {
  if (at <= s.now) return;
  let t = s.now;
  // Walk in slices so the hold max resolves at its exact time.
  while (t < at && s.status === 'play') {
    let next = at;
    if (s.phase === 2) {
      const due = s.holdSince + holdMax(s);
      if (due > t && due < next) next = due;
    }
    if (s.cfg.activeClock && s.up.length === 0) {
      const grace = s.lastTapAt + s.cfg.lookAwayMs;
      if (grace > t && grace < next) next = grace;
    }
    const dt = next - t;
    const running = clockRunning(s, t);
    if (!s.frozen) s.elapsedMs += dt;
    if (running) {
      s.clockLeftMs -= dt;
      if (s.showLeftMs > 0) {
        s.showLeftMs -= dt;
        if (!s.showWarned && s.showLeftMs <= 2000 && s.showLeftMs > 0) {
          s.showWarned = true;
          ev.push({ k: 'showtimeWarn' });
        }
        if (s.showLeftMs <= 0) {
          s.showLeftMs = 1; // endShowtime clears it
          endShowtime(s, ev, 'done');
        }
      } else if (s.gauge > 0) {
        s.drain += dt;
        while (s.drain >= s.cfg.drainMs && s.gauge > 0) {
          s.drain -= s.cfg.drainMs;
          s.gauge -= 1;
          ev.push({ k: 'gauge', pips: s.gauge, delta: -1 });
        }
        if (s.gauge === 0) s.drain = 0;
      }
      if (!s.overtime && s.clockLeftMs <= s.cfg.overtimeMs && s.clockLeftMs > 0) {
        s.overtime = true;
        ev.push({ k: 'overtime' });
      }
      const sec = Math.max(0, Math.ceil(s.clockLeftMs / 1000));
      if (sec !== s.lastSecond) {
        s.lastSecond = sec;
        ev.push({ k: 'second', left: sec });
      }
      if (s.clockLeftMs <= 0) {
        s.clockLeftMs = 0;
        s.now = next;
        if (s.phase === 2) hide(s, ev, false, next);
        s.status = 'timeout';
        ev.push({ k: 'timeout' });
        return;
      }
    }
    t = next;
    s.now = t;
    if (s.phase === 2 && t >= s.holdSince + holdMax(s)) hide(s, ev, false, t);
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
  const arrs = [s.ids, s.faces, s.know];
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
  // Rotate right by one with wrap-around.
  const last = s.cols - 1;
  const keep = [s.ids[base + last], s.faces[base + last], s.know[base + last]];
  for (let c = last; c > 0; c--) {
    s.ids[base + c] = s.ids[base + c - 1];
    s.faces[base + c] = s.faces[base + c - 1];
    s.know[base + c] = s.know[base + c - 1];
  }
  s.ids[base] = keep[0];
  s.faces[base] = keep[1];
  s.know[base] = keep[2];
  for (let c = 0; c < s.cols; c++) if (s.know[base + c] !== K_MATCHED) s.moved[base + c] = 1;
  s.turnsSinceTide = 0;
  ev.push({ k: 'tide', row });
}

function photoSlots(s: MMState, slot: number): number[] {
  const r = Math.floor(slot / s.cols);
  const c = slot % s.cols;
  const out: number[] = [];
  for (let i = 0; i < s.n; i++) {
    if (i === slot) continue;
    if ((Math.floor(i / s.cols) === r || i % s.cols === c) && s.know[i] !== K_MATCHED && s.up.indexOf(i) < 0) out.push(i);
  }
  return out;
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
  if (s.showTurnsLeft > 0) {
    s.showTurnsLeft -= 1;
    if (s.showTurnsLeft === 0) {
      s.showTurnsLeft = 1;
      endShowtime(s, ev, 'done');
    }
  }

  if (fa === fb) {
    const recall = knowB >= K_GLIMPSED;
    s.chain += 1;
    if (s.chain > s.maxChain) s.maxChain = s.chain;
    s.pairs += 1;
    s.know[a] = K_MATCHED;
    s.know[b] = K_MATCHED;
    if (recall) s.recalls += 1;
    else s.luckies += 1;
    s.verdicts.push(recall ? 0 : 1);
    const golden = fa === FACE_GOLD;
    const show = inShowtime(s);
    const ch = chainHalves(s.chain);
    const sh = show ? 3 : 2;
    let value = ((recall ? 160 : 100) * ch * sh) / 4;
    if (golden) value *= 2;
    const overtime = s.cfg.clockMs != null && s.overtime;
    if (overtime) value *= 2;
    const quick = turnTime <= s.cfg.quickWindowMs ? s.cfg.quickBonus : 0;
    if (quick) s.quicks += 1;
    s.score += value + quick;
    if (isGull(fa)) s.gullsDone = true;
    const last = s.pairs >= s.pairsTotal;
    ev.push({
      k: 'match', a, b, recall, chain: s.chain, face: fa, last,
      tierUp: s.chain === 3,
      parts: { base: recall ? 160 : 100, chainHalves: ch, showHalves: sh, golden, overtime, quick, value: value + quick },
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
    if (!show) {
      const add = (recall ? 2 : 1) + (golden ? 1 : 0);
      const before = s.gauge;
      s.gauge = Math.min(s.cfg.gaugeMax, s.gauge + add);
      s.drain = 0;
      ev.push({ k: 'gauge', pips: s.gauge, delta: s.gauge - before });
      if (s.gauge >= s.cfg.gaugeMax && !last) {
        s.showtimes += 1;
        s.showWarned = false;
        if (s.cfg.showtimeTurns > 0) s.showTurnsLeft = s.cfg.showtimeTurns;
        else s.showLeftMs = s.cfg.showtimeMs;
        ev.push({ k: 'showtimeOn', slot: b });
        if (s.cfg.photoFlash && !s.photoUsed) {
          s.photoUsed = true;
          const slots = photoSlots(s, b);
          if (slots.length) ev.push({ k: 'photoFlash', slot: b, slots });
        }
      }
    }
    if (last) {
      finishBoard(s, ev);
      return;
    }
    flushAttacks(s, ev);
    maybeTide(s, ev, at);
    return;
  }

  // Miss.
  s.phase = 2;
  s.holdSince = at;
  s.up = [a, b];
  const gullMiss = isGull(fa) !== isGull(fb);
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
    s.scouts += 1;
    s.verdicts.push(4);
    s.drain = 0;
    s.pendingGull = true;
    ev.push({ k: 'gullMiss', a, b });
    return;
  }
  const slipA = partner >= 0;
  const slipB = knowB === K_SEEN;
  if (!movedInvolved && (slipA || slipB)) {
    s.slips += 1;
    s.boardSlips += 1;
    if (slipA) s.slipsA += 1;
    else s.slipsB += 1;
    s.verdicts.push(3);
    s.chain = 0;
    const hadShow = inShowtime(s);
    if (hadShow) endShowtime(s, ev, 'slip');
    if (s.gauge > 0) ev.push({ k: 'gauge', pips: 0, delta: -s.gauge });
    s.gauge = 0;
    s.drain = 0;
    ev.push({ k: 'slip', a, b, kind: slipA ? 'a' : 'b', ghost: slipA ? partner : -1 });
    if (s.cfg.slipPenaltyMs) addClock(s, -s.cfg.slipPenaltyMs, ev);
    if (s.cfg.strikes > 0) {
      s.strikes += 1;
      ev.push({ k: 'strike', n: s.strikes });
      if (s.strikes >= s.cfg.strikes) {
        s.status = 'out';
        ev.push({ k: 'out' });
      }
    }
    return;
  }
  s.scouts += 1;
  s.verdicts.push(2);
  s.drain = 0;
  ev.push({ k: 'scout', a, b });
}

function finishBoard(s: MMState, ev: MMEvent[]): void {
  const pairs = s.pairsTotal;
  const under = Math.max(0, parFor(pairs) - s.boardTurns);
  const perfect = s.boardTurns <= perfectFor(pairs);
  endShowtime(s, ev, 'done');
  if (s.cfg.mode === 'timeAttack') {
    const bonus = 250 * s.board + 100 * under;
    s.score += bonus;
    addClock(s, s.cfg.clearBonusMs, ev);
    s.status = 'boardClear';
    ev.push({ k: 'boardClear', bonus, board: s.board });
    return;
  }
  let bonus = 0;
  const secondsLeft = s.cfg.clockMs == null ? 0 : Math.floor(s.clockLeftMs / 1000);
  if (s.cfg.mode === 'daily') {
    bonus = 100 * under + (perfect ? 100 : 0) + (s.strikes === 0 ? 150 : 0);
  } else {
    bonus = s.cfg.finalBonusPerSec * secondsLeft + (perfect ? 100 : 0);
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
      if (s.know[slot] === K_UNSEEN) s.know[slot] = K_GLIMPSED;
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

/** Start a fresh board (Time Attack staircase). Clock, chain and score carry. */
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
  s.up = [];
  s.phase = 0;
  s.a = -1;
  s.b = -1;
  s.pendingGull = false;
  s.pendingAttack = 0;
  s.pairs = 0;
  s.pairsTotal = n / 2;
  s.boardTurns = 0;
  s.boardSlips = 0;
  s.photoUsed = false;
  s.gullsDone = false;
  s.turnsSinceTide = 0;
  s.board = s.status === 'boardClear' ? s.board + 1 : s.board;
  if (s.status === 'boardClear') s.status = 'play';
  s.now = Math.max(s.now, at);
  s.turnStart = at;
}

// -----------------------------------------------------------------------------
// Time Attack staircase and systems
// -----------------------------------------------------------------------------

export const GRID_FOR_PAIRS: Record<number, [number, number]> = { 6: [4, 3], 8: [4, 4], 10: [4, 5] };

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
  showtimeCallout: boolean;
  photoFlash: boolean;
  peek: boolean;
  tideShift: boolean;
  seagull: boolean;
  /** The one system this board introduces (for the unlock card). */
  unlock: 'none' | 'showtime' | 'peek' | 'tide' | 'seagull';
}

/** One new system per board (4.2), never more than 2 modifiers (5.4). */
export function boardSystems(board: number): BoardSystems {
  return {
    golden: true,
    showtimeCallout: board >= 2,
    photoFlash: board >= 2,
    peek: board >= 3,
    tideShift: board >= 4,
    seagull: board >= 5,
    unlock: board === 2 ? 'showtime' : board === 3 ? 'peek' : board === 4 ? 'tide' : board === 5 ? 'seagull' : 'none',
  };
}

/** Active modifiers (twists or hazards) on a board. Must stay <= 2. */
export function modifierCount(sys: BoardSystems): number {
  return (sys.tideShift ? 1 : 0) + (sys.seagull ? 1 : 0);
}

export function applySystems(s: MMState, sys: BoardSystems): void {
  s.cfg = { ...s.cfg, photoFlash: sys.photoFlash, tideShift: sys.tideShift, seagull: sys.seagull };
}

// -----------------------------------------------------------------------------
// Stars, grades, tips
// -----------------------------------------------------------------------------

export function rideStars(s: MMState): number {
  if (s.status !== 'cleared') return 0;
  const par = parFor(s.pairsTotal);
  if (s.turns <= par && s.elapsedMs <= 30000) return 3;
  if (s.turns <= par + 3) return 2;
  return 1;
}

export function dailyStars(s: MMState): number {
  if (s.status !== 'cleared') return 0;
  const par = parFor(s.pairsTotal);
  if (s.turns <= par && s.showtimes > 0) return 3;
  if (s.turns <= par + 2) return 2;
  return 1;
}

/** Time Attack: 1 = reach B2, 2 = clear B3, 3 = clear B5. `cleared` = boards cleared. */
export function timeAttackStars(cleared: number): number {
  if (cleared >= 5) return 3;
  if (cleared >= 3) return 2;
  if (cleared >= 1) return 1;
  return 0;
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
  chain: 'Flip new cards first, then cash in pairs you know.',
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
    luckies: s.luckies,
    scouts: s.scouts,
    slips: s.slips,
    strikes: s.strikes,
    showtimes: s.showtimes,
    clockLeftMs: Math.round(s.clockLeftMs),
  };
}
