/**
 * bonkRace.ts: the Line Party "Bonk Race" micro-round (sim `bonk_race` v3,
 * design rev 7 section 7.1), a pure, integer-only simulation shared with the
 * server.
 *
 * Every phone in a room builds the same board from the server's seed, plays it
 * on its own screen (parallel boards, Tetris 99 style) and submits a log of
 * [board-ms, code]. The server replays that log through this exact file (the
 * Node sidecar runs the bundled registry) or its line-for-line PHP port (BE
 * BonkRaceSim), gated by the golden vectors in tools/fixtures/party-sim.
 *
 * v3 is judged on the beat of Chris's room loop (135.999 BPM). Every target
 * has a MARK on the beat or half-beat (`grid(k) = floor(k * 220590 / 1000)`)
 * and rises exactly one beat (2 eighths) before it, while a gold approach ring
 * closes on the mark. |tap - mark| <= 50 ms is PERFECT (160), <= 110 ms GREAT
 * (130), any other tap while up GOOD (100); a golden is 3x. The anglerfish
 * lure has no ring: -150 and the streak drops one tier. Three whiffs inside a
 * second (mashing) is Butterfingers and resets the streak; whiffs, escapes and
 * bubble taps are otherwise free.
 *
 * Player interaction: on the downbeat of bars 2/4/6/8/10 a Shared Golden lands
 * on the same hole on every board; `settleShared` gives +200 to the tap
 * closest to its mark (ties within 17 ms share), exact from the replay, so
 * latency plays no part. Every 10th hit of a streak (max 2 per round) earns a
 * Splash the server aims at the leader; it lands in the victim's log as code
 * 1000 + n and seals the hole of their next spawn for 4 beats (2 taps clear it).
 *
 * Rules for this file: integers only, no Math.random, no floats in state, no
 * Date. Math.floor on non-negative values only (it equals PHP intdiv there).
 */

export const BONK_RACE_VERSION = 3;
export const HOLES = 9;
export const MAX_TAPS = 400;

/** One eighth of the room loop in micro-ms: 220.59 ms (135.999 BPM). */
export const EIGHTH_UMS = 220590;
export const SIXTEENTH_UMS = 110295;
export const EIGHTHS_PER_BAR = 8;
export const BARS = 11;
/** Board-ms of eighth k since GO. */
export function grid(k: number): number {
  return Math.floor((k * EIGHTH_UMS) / 1000);
}
/** Board-ms of sixteenth s since GO. */
export function grid16(s: number): number {
  return Math.floor((s * SIXTEENTH_UMS) / 1000);
}
/** 11 bars = 88 eighths = 19,411 board-ms; the whistle blows on it. */
export const ROUND_MS = grid(BARS * EIGHTHS_PER_BAR);
/** A target rises exactly one beat (2 eighths) before its mark. */
export const RISE_EIGHTHS = 2;
/** Shared Golden marks: the downbeat of bars 2, 4, 6, 8 and 10. */
export const SHARED_EIGHTHS = [8, 24, 40, 56, 72] as const;
/** Its rim glows gold across the beat before it rises. */
export const TELEGRAPH_EIGHTHS = 2;
export const SNATCH_TIE_MS = 17;
export const SNATCH_BONUS = 200;
export const LAST_BARS_FROM = grid(72);

export const JUDGE = { perfectMs: 50, greatMs: 110 } as const;
export type Judgement = 0 | 1 | 2; // PERFECT, GREAT, GOOD
export const JUDGE_POINTS = [160, 130, 100] as const;
export const GOLDEN_X = 3;
export const LURE_POINTS = -150;
export const BUTTERFINGERS = { whiffs: 3, windowMs: 1000 } as const;

/** Splash (design 7.1.4): every 10th streak hit, max 2 per round. */
export const SPLASH_EVERY = 10;
export const SPLASH_MAX = 2;
/** A bubble seals one hole for 4 beats and takes 2 taps to clear. */
export const BUBBLE_SEAL_MS = grid(8);
export const BUBBLE_TAPS = 2;
/** Log code of the n-th Splash landing on this board (n from 1). */
export const BUBBLE_CODE = 1000;
export const MAX_BUBBLES = 12;
/** Server rules for a landing: at least 1,200 ms after receipt, on a half-bar, accepted for 2 bars. */
export const SPLASH_LEAD_MS = 1200;
export const HALF_BAR_EIGHTHS = 4;
export const LANDING_WINDOW_MS = grid(16);

export type TargetKind = 'finn' | 'golden' | 'lure';

export interface Spawn {
  id: number;
  /** Board-ms it rises (one beat before its mark). */
  at: number;
  /** Board-ms of its mark: the approach ring closes here. */
  mark: number;
  hole: number;
  kind: TargetKind;
  /** ms it stays up from the rise. */
  up: number;
  /** 1-5 for the Shared Golden of bar 2/4/6/8/10, else 0. */
  sg: number;
  /** Board-ms its telegraph starts (Shared Goldens glow one beat before the rise; else equal to `at`). */
  tell: number;
}

/** [board-ms since GO, code]: 0-8 a hole tap, 1000 + n the n-th Splash landing. */
export type Tap = [number, number];

export interface RaceResult {
  score: number;
  hits: number;
  /** [PERFECT, GREAT, GOOD] counts over judged hits (Shared Goldens included). */
  judgements: number[];
  goldens: number;
  sgHits: number;
  lureHits: number;
  whiffs: number;
  butterfingers: number;
  maxStreak: number;
  escapes: number;
  /** Targets that rose under a bubble. */
  eaten: number;
  bubbles: number;
  bubbleTaps: number;
  bubblesCleared: number;
  /** Signed tap - mark of every judged hit except Shared Goldens, in tap order. */
  offsets: number[];
  /** ms from rise to tap of the same hits (the fast-reaction check). */
  reactions: number[];
  /** |tap - mark| per Shared Golden of bar 2/4/6/8/10 (-1 = not hit); settled room-wide. */
  sgOffsets: number[];
  /** spawn ids hit, in tap order */
  hitIds: number[];
  /** signed points per bar (11), for Star Player "best bar" */
  barScores: number[];
  /** Board-ms of every streak hit that earned a Splash (max 2). */
  splashes: number[];
}

interface Phase { fromK: number; toK: number; every: number; maxUp: number; upUms: number; lure: number; golden: number }
/**
 * Design 7.1.1 ramp, keyed by MARK eighths. upUms is the up-time from the rise
 * in micro-ms so 9 sixteenths (992 ms) stays exact.
 */
export const PHASES: readonly Phase[] = [
  // bars 1-2: a mark every 2 beats, on beats only
  { fromK: 2, toK: 15, every: 4, maxUp: 2, upUms: 6 * EIGHTH_UMS, lure: 0, golden: 3 },
  // bars 3-9: every 1.5 beats, beats and half-beats
  { fromK: 16, toK: 71, every: 3, maxUp: 3, upUms: 5 * EIGHTH_UMS, lure: 12, golden: 4 },
  // bars 10-11, LAST 2 BARS: every beat
  { fromK: 72, toK: 87, every: 2, maxUp: 3, upUms: 9 * SIXTEENTH_UMS, lure: 15, golden: 6 },
];

/** mulberry32: uint32 in, uint32 stream out. Mirrored exactly in PHP. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Streak multiplier in tenths: x1 for hits 1-5, +0.5 per 5 hits, capped x3 from hit 21. */
export function multTenths(streak: number): number {
  if (streak < 1) return 10;
  const tier = Math.min(4, Math.floor((streak - 1) / 5));
  return 10 + 5 * tier;
}

/** A lure drops one tier: the count falls to the start of the previous tier (23 -> 15). */
export function lureDrop(streak: number): number {
  if (streak < 1) return 0;
  const tier = Math.min(4, Math.floor((streak - 1) / 5));
  return tier < 1 ? 0 : (tier - 1) * 5;
}

/** 1-based bar of a board-ms (bar 1 starts at GO). */
export function barOf(ms: number): number {
  return Math.min(BARS, Math.floor((ms * 1000) / (EIGHTH_UMS * EIGHTHS_PER_BAR)) + 1);
}

/** PERFECT (0), GREAT (1) or GOOD (2) for a tap at `tapMs` on a target marked at `mark`. */
export function judge(mark: number, tapMs: number): Judgement {
  const off = tapMs >= mark ? tapMs - mark : mark - tapMs;
  return off <= JUDGE.perfectMs ? 0 : off <= JUDGE.greatMs ? 1 : 2;
}

function phaseOf(markK: number): Phase {
  for (const p of PHASES) if (markK >= p.fromK && markK <= p.toK) return p;
  return PHASES[PHASES.length - 1];
}

/** Up-time (ms from the rise) of a target marked at eighth `markK`. */
export function upFor(markK: number): number {
  return Math.floor(phaseOf(markK).upUms / 1000);
}

export function buildTimeline(seed: number): Spawn[] {
  const next = rng(seed);
  const spawns: Spawn[] = [];
  const busyUntil = new Array<number>(HOLES).fill(0);
  const sgHole = new Array<number>(SHARED_EIGHTHS.length).fill(-1);
  let id = 0;
  const freeAt = (t: number): number[] => {
    const free: number[] = [];
    for (let h = 0; h < HOLES; h++) if (busyUntil[h] <= t) free.push(h);
    return free;
  };
  // Walk the rise eighths in time order; a target marked at eighth k rises at k - 2.
  for (let r = 0; r + RISE_EIGHTHS < BARS * EIGHTHS_PER_BAR; r++) {
    const t = grid(r);
    const k = r + RISE_EIGHTHS;
    // Reserve each Shared Golden's hole when its telegraph starts (one beat before the rise).
    for (let n = 0; n < SHARED_EIGHTHS.length; n++) {
      if (SHARED_EIGHTHS[n] - RISE_EIGHTHS - TELEGRAPH_EIGHTHS !== r) continue;
      const free = freeAt(t);
      const hole = free.length > 0 ? free[next() % free.length] : next() % HOLES;
      sgHole[n] = hole;
      const rise = grid(SHARED_EIGHTHS[n] - RISE_EIGHTHS);
      busyUntil[hole] = rise + Math.floor(phaseOf(SHARED_EIGHTHS[n]).upUms / 1000) + 110;
    }
    let sharedNow = false;
    for (let n = 0; n < SHARED_EIGHTHS.length; n++) {
      if (SHARED_EIGHTHS[n] !== k) continue;
      sharedNow = true;
      const up = Math.floor(phaseOf(k).upUms / 1000);
      spawns.push({ id, at: t, mark: grid(k), hole: sgHole[n], kind: 'golden', up, sg: n + 1, tell: grid(r - TELEGRAPH_EIGHTHS) });
      id += 1;
    }
    let phase: Phase | null = null;
    for (const p of PHASES) if (k >= p.fromK && k <= p.toK && (k - p.fromK) % p.every === 0) phase = p;
    if (!phase) continue;
    let upNow = 0;
    for (const s of spawns) if (s.at <= t && t < s.at + s.up) upNow += 1;
    const roll = next() % 100;
    if (upNow >= phase.maxUp) continue;
    const free = freeAt(t);
    if (free.length === 0) continue;
    const hole = free[next() % free.length];
    let kind: TargetKind = roll < phase.golden ? 'golden' : roll < phase.golden + phase.lure ? 'lure' : 'finn';
    // A Shared Golden never shares its downbeat with a lure.
    if (sharedNow && kind === 'lure') kind = 'finn';
    const up = Math.floor(phase.upUms / 1000);
    spawns.push({ id, at: t, mark: grid(k), hole, kind, up, sg: 0, tell: t });
    busyUntil[hole] = t + up + 110;
    id += 1;
  }
  return spawns;
}

/** Valid logs are sorted by time, inside the round, on real holes or unique Splash landings, and bounded. */
export function validTaps(taps: unknown): taps is Tap[] {
  if (!Array.isArray(taps) || taps.length > MAX_TAPS) return false;
  let last = 0;
  const landed: number[] = [];
  for (const tap of taps) {
    if (!Array.isArray(tap) || tap.length !== 2) return false;
    const [t, c] = tap;
    if (!Number.isInteger(t) || !Number.isInteger(c)) return false;
    if (t < 0 || t >= ROUND_MS || t < last) return false;
    if (c >= BUBBLE_CODE + 1 && c <= BUBBLE_CODE + MAX_BUBBLES) {
      if (landed.indexOf(c) >= 0) return false;
      landed.push(c);
    } else if (c < 0 || c >= HOLES) return false;
    last = t;
  }
  return true;
}

/** The hole a bubble landing at `ms` seals: the next spawn to rise whose hole is not sealed already (-1: none left). */
export function bubbleHole(spawns: Spawn[], ms: number, sealed: boolean[]): number {
  for (const s of spawns) if (s.at >= ms && !sealed[s.hole]) return s.hole;
  return -1;
}

interface Seal { from: number; until: number; taps: number; idx: number }

/** Internal detail for explain(): which log entries were lure taps, mashes and bubble work. */
interface Detail {
  result: RaceResult;
  lureIdx: number[];
  /** each Butterfingers: the indexes of its 3 whiffs */
  mashIdx: number[][];
  /** per bubble landing: [landing index, clear tap indexes...] */
  bubbleIdx: number[][];
  hit: Set<number>;
  eaten: Set<number>;
}

function play(spawns: Spawn[], taps: Tap[], untilMs: number): Detail {
  const byHole: Spawn[][] = Array.from({ length: HOLES }, () => []);
  for (const s of spawns) byHole[s.hole].push(s);
  const hit = new Set<number>();
  const eaten = new Set<number>();
  const whiffs: Array<[number, number]> = [];
  const seals: Array<Seal | null> = new Array(HOLES).fill(null);
  const lureIdx: number[] = [];
  const mashIdx: number[][] = [];
  const bubbleIdx: number[][] = [];
  const r: RaceResult = {
    score: 0, hits: 0, judgements: [0, 0, 0], goldens: 0, sgHits: 0, lureHits: 0, whiffs: 0, butterfingers: 0,
    maxStreak: 0, escapes: 0, eaten: 0, bubbles: 0, bubbleTaps: 0, bubblesCleared: 0, offsets: [], reactions: [],
    sgOffsets: SHARED_EIGHTHS.map(() => -1), hitIds: [], barScores: new Array<number>(BARS).fill(0), splashes: [],
  };
  // Closing a seal eats every target that rose under it.
  const close = (h: number, end: number) => {
    const seal = seals[h];
    if (!seal) return;
    for (const s of byHole[h]) if (s.at >= seal.from && s.at < end && !hit.has(s.id)) eaten.add(s.id);
    seals[h] = null;
  };
  let streak = 0;
  taps.forEach(([t, code], i) => {
    if (t >= untilMs) return;
    for (let h = 0; h < HOLES; h++) {
      const seal = seals[h];
      if (seal && t >= seal.until) close(h, seal.until);
    }
    if (code > BUBBLE_CODE) {
      r.bubbles += 1;
      const hole = bubbleHole(spawns, t, seals.map((s) => s !== null));
      const idx = bubbleIdx.length;
      bubbleIdx.push([i]);
      if (hole >= 0) seals[hole] = { from: t, until: t + BUBBLE_SEAL_MS, taps: 0, idx };
      return;
    }
    const seal = seals[code];
    if (seal) {
      seal.taps += 1;
      r.bubbleTaps += 1;
      bubbleIdx[seal.idx].push(i);
      if (seal.taps >= BUBBLE_TAPS) {
        r.bubblesCleared += 1;
        close(code, t);
      }
      return;
    }
    let target: Spawn | null = null;
    for (const s of byHole[code]) {
      if (s.at <= t && t < s.at + s.up && !hit.has(s.id) && !eaten.has(s.id)) {
        target = s;
        break;
      }
    }
    const bar = barOf(t) - 1;
    if (!target) {
      r.whiffs += 1;
      whiffs.push([t, i]);
      while (whiffs.length > 0 && whiffs[0][0] <= t - BUTTERFINGERS.windowMs) whiffs.shift();
      if (whiffs.length >= BUTTERFINGERS.whiffs) {
        r.butterfingers += 1;
        mashIdx.push(whiffs.map(([, j]) => j));
        streak = 0;
        whiffs.length = 0;
      }
      return;
    }
    hit.add(target.id);
    r.hitIds.push(target.id);
    if (target.kind === 'lure') {
      r.lureHits += 1;
      lureIdx.push(i);
      r.score += LURE_POINTS;
      r.barScores[bar] += LURE_POINTS;
      streak = lureDrop(streak);
      return;
    }
    streak += 1;
    if (streak > r.maxStreak) r.maxStreak = streak;
    const j = judge(target.mark, t);
    r.hits += 1;
    r.judgements[j] += 1;
    const base = target.kind === 'golden' ? JUDGE_POINTS[j] * GOLDEN_X : JUDGE_POINTS[j];
    const gained = Math.floor((base * multTenths(streak)) / 10);
    r.score += gained;
    r.barScores[bar] += gained;
    if (target.sg > 0) {
      r.sgHits += 1;
      r.sgOffsets[target.sg - 1] = t >= target.mark ? t - target.mark : target.mark - t;
    } else {
      if (target.kind === 'golden') r.goldens += 1;
      r.offsets.push(t - target.mark);
      r.reactions.push(t - target.at);
    }
    if (streak % SPLASH_EVERY === 0 && r.splashes.length < SPLASH_MAX) r.splashes.push(t);
  });
  for (let h = 0; h < HOLES; h++) {
    const seal = seals[h];
    if (seal) close(h, seal.until);
  }
  for (const s of spawns) {
    if (eaten.has(s.id)) {
      r.eaten += 1;
      continue;
    }
    if (s.kind === 'lure' || hit.has(s.id)) continue;
    if (Math.min(s.at + s.up, ROUND_MS) <= untilMs) r.escapes += 1;
  }
  if (r.score < 0) r.score = 0;
  return { result: r, lureIdx, mashIdx, bubbleIdx, hit, eaten };
}

/**
 * Scores one board. `untilMs` resolves a prefix (Bonk Royale splits): log
 * entries at or after it are ignored and only targets gone by then can count
 * as escapes.
 */
export function resolve(spawns: Spawn[], taps: Tap[], untilMs: number = ROUND_MS): RaceResult {
  return play(spawns, taps, untilMs).result;
}

/** Board-ms of each streak hit that earned a Splash (what the attacker's POSTs must match). */
export function splashEarned(result: RaceResult): number[] {
  return result.splashes.slice();
}

export interface SharedSettle {
  /** Bonus per entry, in entry order (+200 per SNATCH). */
  bonus: number[];
  /** Per Shared Golden: the winning |offset| (-1 nobody hit it) and the entry indexes that snatched it. */
  golds: Array<{ sg: number; offset: number; winners: number[] }>;
}

/**
 * Room-level SNATCH settle. Pass every seat's `sgOffsets` (null for a seat
 * that doesn't compete, e.g. a disqualified log). The tap closest to the
 * downbeat mark wins +200; everyone within 17 ms of it shares.
 */
export function settleShared(entries: Array<number[] | null>): SharedSettle {
  const bonus = entries.map(() => 0);
  const golds: SharedSettle['golds'] = [];
  for (let n = 0; n < SHARED_EIGHTHS.length; n++) {
    let best = -1;
    for (const e of entries) {
      const o = e ? e[n] ?? -1 : -1;
      if (o >= 0 && (best < 0 || o < best)) best = o;
    }
    const winners: number[] = [];
    if (best >= 0) {
      entries.forEach((e, i) => {
        const o = e ? e[n] ?? -1 : -1;
        if (o >= 0 && o - best <= SNATCH_TIE_MS) {
          winners.push(i);
          bonus[i] += SNATCH_BONUS;
        }
      });
    }
    golds.push({ sg: n + 1, offset: best, winners });
  }
  return { bonus, golds };
}

export type KeyMomentKind = 'lure' | 'butterfingers' | 'golden_escaped' | 'shared_missed' | 'snatch_missed' | 'splashed' | 'none';
export interface KeyMoment {
  kind: KeyMomentKind;
  /** 1-based bar, 0 when kind is none */
  bar: number;
  /** board-ms of the event */
  at: number;
  /** points it cost (always > 0 unless none) */
  cost: number;
  /** snatch_missed: how many ms further from the mark than the snatcher */
  byMs: number;
}

const NO_MOMENT: KeyMoment = { kind: 'none', bar: 0, at: 0, cost: 0, byMs: 0 };

/**
 * The single event whose removal would have gained the most (design 8.4): a
 * lure tap, a Butterfingers, an escaped golden, a missed Shared Golden, a
 * Splash that landed on you, or (with the room settle and this entry's index)
 * a SNATCH lost by a few ms. Ties go to the earliest event. Pure: the server
 * stores it as `key_moment`.
 */
export function explain(spawns: Spawn[], taps: Tap[], settle?: SharedSettle | null, entry = -1): KeyMoment {
  const base = play(spawns, taps, ROUND_MS);
  const score = base.result.score;
  let best: KeyMoment = NO_MOMENT;
  const consider = (m: KeyMoment) => {
    if (m.cost <= 0) return;
    if (m.cost > best.cost || (m.cost === best.cost && m.at < best.at)) best = m;
  };
  const without = (drop: number[]) => resolve(spawns, taps.filter((_, i) => drop.indexOf(i) < 0)).score - score;
  for (const i of base.lureIdx) consider({ kind: 'lure', bar: barOf(taps[i][0]), at: taps[i][0], cost: without([i]), byMs: 0 });
  for (const idx of base.mashIdx) {
    const at = taps[idx[idx.length - 1]][0];
    consider({ kind: 'butterfingers', bar: barOf(at), at, cost: without(idx), byMs: 0 });
  }
  // Had the Splash not landed, the same thumb taps would have met the targets.
  for (const idx of base.bubbleIdx) {
    const at = taps[idx[0]][0];
    consider({ kind: 'splashed', bar: barOf(at), at, cost: without([idx[0]]), byMs: 0 });
  }
  for (const s of spawns) {
    if (s.kind !== 'golden' || base.hit.has(s.id) || base.eaten.has(s.id) || s.mark >= ROUND_MS) continue;
    const added = [...taps, [s.mark, s.hole] as Tap].sort((a, b) => a[0] - b[0]);
    const gain = resolve(spawns, added).score - score + (s.sg > 0 ? SNATCH_BONUS : 0);
    consider({ kind: s.sg > 0 ? 'shared_missed' : 'golden_escaped', bar: barOf(s.mark), at: s.mark, cost: gain, byMs: 0 });
  }
  if (settle && entry >= 0) {
    for (const g of settle.golds) {
      const mine = base.result.sgOffsets[g.sg - 1];
      if (mine < 0 || g.offset < 0 || g.winners.indexOf(entry) >= 0) continue;
      const at = grid(SHARED_EIGHTHS[g.sg - 1]);
      consider({ kind: 'snatch_missed', bar: barOf(at), at, cost: SNATCH_BONUS, byMs: mine - g.offset });
    }
  }
  return best;
}

export type BotProfile = 'rookie' | 'regular' | 'ace';

/**
 * A play style in integers. Named crew profiles below; profile ghosts (design
 * 5.2.1) pass their own measured numbers, clamped to human ranges.
 * Taps land at mark + offBias + uniform(-offSpread..offSpread).
 */
export interface PlayStyle {
  hitPct: number;
  offBias: number;
  offSpread: number;
  lurePct: number;
  sgPct: number;
  sgBias: number;
  sgSpread: number;
  clearMin: number;
  clearSpread: number;
}

export const BOT_PROFILES: Record<BotProfile, PlayStyle> = {
  rookie: { hitPct: 60, offBias: 70, offSpread: 230, lurePct: 22, sgPct: 70, sgBias: 60, sgSpread: 180, clearMin: 520, clearSpread: 520 },
  regular: { hitPct: 75, offBias: 45, offSpread: 170, lurePct: 12, sgPct: 85, sgBias: 40, sgSpread: 130, clearMin: 400, clearSpread: 400 },
  ace: { hitPct: 86, offBias: 25, offSpread: 135, lurePct: 5, sgPct: 95, sgBias: 20, sgSpread: 90, clearMin: 300, clearSpread: 300 },
};

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  return typeof v === 'number' && Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : dflt;
}

/** A named profile, or a measured style clamped to human ranges (never a perfect machine). */
export function styleOf(profile: BotProfile | PlayStyle): PlayStyle {
  if (typeof profile === 'string') return BOT_PROFILES[profile] ?? BOT_PROFILES.rookie;
  const d = BOT_PROFILES.regular;
  return {
    hitPct: clampInt(profile.hitPct, 0, 95, d.hitPct),
    offBias: clampInt(profile.offBias, -200, 250, d.offBias),
    offSpread: clampInt(profile.offSpread, 40, 400, d.offSpread),
    lurePct: clampInt(profile.lurePct, 0, 100, d.lurePct),
    sgPct: clampInt(profile.sgPct, 0, 98, d.sgPct),
    sgBias: clampInt(profile.sgBias, -200, 250, d.sgBias),
    sgSpread: clampInt(profile.sgSpread, 30, 400, d.sgSpread),
    clearMin: clampInt(profile.clearMin, 200, 1500, d.clearMin),
    clearSpread: clampInt(profile.clearSpread, 50, 1000, d.clearSpread),
  };
}

/** Bot (or ghost) seat seed: a pure function of the round seed and the seat. */
export function botSeed(seed: number, seat: number): number {
  return (seed + (seat + 1) * 1000003) % 4294967296;
}

/** A Splash due on a ghost-played board: [land board-ms, n] (n from 1, the victim's own count). */
export type Incoming = [number, number];

function validIncoming(incoming: unknown): Incoming[] {
  const out: Incoming[] = [];
  if (!Array.isArray(incoming)) return out;
  for (const x of incoming) {
    if (!Array.isArray(x) || x.length !== 2 || !Number.isInteger(x[0]) || !Number.isInteger(x[1])) continue;
    if (x[0] < 0 || x[0] >= ROUND_MS || x[1] < 1 || x[1] > MAX_BUBBLES) continue;
    out.push([x[0], x[1]]);
  }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return out;
}

function sortLog(taps: Array<[number, number, number]>): Tap[] {
  // Same board-ms: landings first, then holes in order (one canonical order for every engine).
  taps.sort((a, b) => a[0] - b[0] || b[1] - a[1] || a[2] - b[2]);
  return taps.map(([t, c]) => [t, c]);
}

/**
 * Deterministic inputs for a bot (or a ghost from `fromMs`). `incoming` are
 * Splashes that land on this board at or after `fromMs`: the bot logs each
 * landing, cracks and pops the bubble with its profile timing, and skips the
 * targets the bubble ate.
 */
export function botTaps(spawns: Spawn[], seed: number, seat: number, profile: BotProfile | PlayStyle, fromMs = 0, incoming: unknown = []): Tap[] {
  const p = styleOf(profile);
  const next = rng(botSeed(seed, seat));
  const raw: Array<[number, number, number]> = [];
  for (const s of spawns) {
    const roll = next() % 100;
    const shared = s.sg > 0;
    const spread = shared ? p.sgSpread : p.offSpread;
    const off = (shared ? p.sgBias : p.offBias) + (next() % (2 * spread + 1)) - spread;
    if (s.at < fromMs) continue;
    const wants = s.kind === 'lure' ? roll < p.lurePct : roll < (shared ? p.sgPct : p.hitPct);
    if (!wants) continue;
    // A lure has no ring: a bot that bites taps it as it pops up.
    let at = s.kind === 'lure' ? s.at + 180 + (off >= 0 ? off : -off) : s.mark + off;
    if (at < s.at) at = s.at;
    if (at >= s.at + s.up || at >= ROUND_MS) continue;
    raw.push([at, s.hole, s.id]);
  }
  // Bubbles: seal the same hole the resolver will, clear them, drop what they ate.
  const due = validIncoming(incoming).filter(([land]) => land >= fromMs);
  if (due.length > 0) {
    const bubble = rng((botSeed(seed, seat) + 7919) % 4294967296);
    const sealed = new Array<boolean>(HOLES).fill(false);
    const seals: Array<{ hole: number; end: number; cleared: boolean }> = [];
    for (const [land, n] of due) {
      // The resolver expires a seal at a landing on the same ms, but pops a cleared one only after it.
      for (const s of seals) if (s.cleared ? s.end < land : s.end <= land) sealed[s.hole] = false;
      const c1 = land + p.clearMin + (bubble() % p.clearSpread);
      const c2 = c1 + 140 + (bubble() % 120);
      const hole = bubbleHole(spawns, land, sealed);
      raw.push([land, BUBBLE_CODE + n, -1]);
      if (hole < 0) continue;
      const cleared = c2 < land + BUBBLE_SEAL_MS && c2 < ROUND_MS;
      const end = cleared ? c2 : land + BUBBLE_SEAL_MS;
      sealed[hole] = true;
      seals.push({ hole, end, cleared });
      for (let i = raw.length - 1; i >= 0; i--) {
        const [t, h, sid] = raw[i];
        if (h !== hole || sid < 0) continue;
        const target = spawns[sid];
        if ((t >= land && t <= end) || (target.at >= land && target.at < end)) raw.splice(i, 1);
      }
      if (cleared) {
        raw.push([c1, hole, -2]);
        raw.push([c2, hole, -2]);
      }
    }
  }
  return sortLog(raw);
}

/** A dropped player's final log: their own entries before `untilMs`, then their ghost (with any Splashes still due). */
export function ghostFill(spawns: Spawn[], seed: number, seat: number, own: Tap[], untilMs: number, profile: BotProfile | PlayStyle, incoming: unknown = []): Tap[] {
  const mine = own.filter(([t]) => t < untilMs);
  const ghost = botTaps(spawns, seed, seat, profile, untilMs, incoming);
  const merged: Array<[number, number, number]> = [...mine.map(([t, c], i) => [t, c, i] as [number, number, number]), ...ghost.map(([t, c], i) => [t, c, 100000 + i] as [number, number, number])];
  return sortLog(merged);
}

/** Perfect-read score of a board: every ringed target dead on its mark, every lure left. */
export function bandCheck(spawns: Spawn[]): number {
  const taps: Tap[] = spawns.filter((s) => s.kind !== 'lure' && s.mark < ROUND_MS).map((s) => [s.mark, s.hole] as Tap);
  taps.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return resolve(spawns, taps).score;
}

/** Mean perfect-read score of v3 over 4,000 seeds (tools/bonk-score-dist.mjs) and the KOTQ band (+/-5%). */
export const BAND_MEAN = 15048;
export const BAND_PCT = 5;
export function bandOk(spawns: Spawn[]): boolean {
  const s = bandCheck(spawns);
  const d = s >= BAND_MEAN ? s - BAND_MEAN : BAND_MEAN - s;
  return d * 100 <= BAND_PCT * BAND_MEAN;
}

/** FNV-1a over the canonical result, for vector files and the zero-tolerance claim check. */
export function resultHash(r: RaceResult): string {
  const text = [r.score, r.hits, r.judgements.join('.'), r.goldens, r.sgHits, r.lureHits, r.whiffs, r.butterfingers, r.maxStreak, r.escapes,
    r.eaten, r.bubbles, r.bubbleTaps, r.bubblesCleared, r.offsets.join('.'), r.reactions.join('.'), r.sgOffsets.join('.'),
    r.hitIds.join('.'), r.barScores.join('.'), r.splashes.join('.')].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
