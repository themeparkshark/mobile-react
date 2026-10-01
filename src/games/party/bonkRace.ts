/**
 * bonkRace.ts: the Line Party "Bonk Race" micro-round (sim `bonk_race` v2,
 * design rev 6 section 7.1), a pure, integer-only simulation shared with the
 * server.
 *
 * Every phone in a room builds the same board from the server's seed, plays it
 * on its own screen (parallel boards, Tetris 99 style) and submits a tap log.
 * The server replays that log through this exact file (the Node sidecar runs
 * the bundled registry) or its line-for-line PHP port (BE BonkRaceSim), gated
 * by the golden vectors in tools/fixtures/party-sim/bonk_race.json.
 *
 * v2 lives on the measured beat grid of Chris's room loop (135.999 BPM): every
 * spawn rises on an eighth, `grid(k) = floor(k * 220590 / 1000)` board-ms
 * since GO, and the round is 11 bars (88 eighths). On the downbeat of bars
 * 2/4/6/8/10 a Shared Golden rises on the same hole on every board in the
 * room; `settleShared` gives +200 to whoever bonked it with the lowest
 * replayed reaction (ties within 17 ms share), so network latency plays no
 * part. A lure drops the streak one tier, a mash (Butterfingers) resets it,
 * whiffs and escapes are free.
 *
 * Rules for this file: integers only, no Math.random, no floats in state, no
 * Date. Math.floor on non-negative values only (it equals PHP intdiv there).
 */

export const BONK_RACE_VERSION = 2;
export const HOLES = 9;
export const MAX_TAPS = 400;

/** One eighth of the room loop in micro-ms: 220.59 ms (135.999 BPM). */
export const EIGHTH_UMS = 220590;
export const EIGHTHS_PER_BAR = 8;
export const BARS = 11;
/** Board-ms of eighth k since GO. */
export function grid(k: number): number {
  return Math.floor((k * EIGHTH_UMS) / 1000);
}
/** 11 bars = 19,411.92 ms; the final beat lands on 19,412. */
export const ROUND_MS = grid(BARS * EIGHTHS_PER_BAR) + 1;
/** Shared Goldens: the downbeat of bars 2, 4, 6, 8 and 10. */
export const SHARED_EIGHTHS = [8, 24, 40, 56, 72] as const;
export const SHARED_UP_MS = grid(4);
/** The Shared Golden rim glows one beat before it rises. */
export const TELEGRAPH_EIGHTHS = 2;
export const SNATCH_TIE_MS = 17;
export const SNATCH_BONUS = 200;
export const LAST_BARS_FROM = grid(72);

export type TargetKind = 'finn' | 'golden' | 'lure';

export interface Spawn {
  id: number;
  at: number;
  hole: number;
  kind: TargetKind;
  up: number;
  /** 1-5 for the Shared Golden of bar 2/4/6/8/10, else 0. */
  sg: number;
  /** Board-ms its telegraph starts (Shared Goldens only, else equal to `at`). */
  tell: number;
}

/** [board-ms since GO, hole 0-8] */
export type Tap = [number, number];

export interface RaceResult {
  score: number;
  hits: number;
  quick: number;
  goldens: number;
  sgHits: number;
  lureHits: number;
  whiffs: number;
  butterfingers: number;
  maxStreak: number;
  escapes: number;
  /** ms from spawn to tap for every non-lure, non-shared hit, in tap order */
  reactions: number[];
  /** Shared Golden reaction per bar 2/4/6/8/10 (-1 = not hit); settled room-wide */
  sgReactions: number[];
  /** spawn ids hit, in tap order */
  hitIds: number[];
  /** signed points per bar (11), for Star Player "best bar" */
  barScores: number[];
}

export const POINTS = { finn: 100, quick: 150, golden: 300, shared: 100, lure: -150 } as const;
export const QUICK_MS = 380;
export const BUTTERFINGERS = { whiffs: 3, windowMs: 1000 } as const;

interface Phase { fromK: number; toK: number; step: number; maxUp: number; upUms: number; lure: number; golden: number }
/** Design 7.1.1 ramp. upUms is in micro-ms so 2.25 beats stays exact. */
export const PHASES: readonly Phase[] = [
  { fromK: 2, toK: 15, step: 4, maxUp: 2, upUms: 6 * EIGHTH_UMS, lure: 0, golden: 3 },
  { fromK: 16, toK: 71, step: 3, maxUp: 3, upUms: 5 * EIGHTH_UMS, lure: 12, golden: 4 },
  { fromK: 72, toK: 84, step: 2, maxUp: 3, upUms: 9 * (EIGHTH_UMS / 2), lure: 15, golden: 6 },
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
  for (let k = 0; k < BARS * EIGHTHS_PER_BAR; k++) {
    const t = grid(k);
    // Reserve the Shared Golden's hole when its telegraph starts (one beat early).
    for (let n = 0; n < SHARED_EIGHTHS.length; n++) {
      if (SHARED_EIGHTHS[n] - TELEGRAPH_EIGHTHS !== k) continue;
      const free = freeAt(t);
      const hole = free.length > 0 ? free[next() % free.length] : next() % HOLES;
      sgHole[n] = hole;
      busyUntil[hole] = grid(SHARED_EIGHTHS[n]) + SHARED_UP_MS + 110;
    }
    let sharedNow = false;
    for (let n = 0; n < SHARED_EIGHTHS.length; n++) {
      if (SHARED_EIGHTHS[n] !== k) continue;
      sharedNow = true;
      spawns.push({ id, at: t, hole: sgHole[n], kind: 'golden', up: SHARED_UP_MS, sg: n + 1, tell: grid(k - TELEGRAPH_EIGHTHS) });
      id += 1;
    }
    let phase: Phase | null = null;
    for (const p of PHASES) if (k >= p.fromK && k <= p.toK && (k - p.fromK) % p.step === 0) phase = p;
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
    spawns.push({ id, at: t, hole, kind, up, sg: 0, tell: t });
    busyUntil[hole] = t + up + 110;
    id += 1;
  }
  return spawns;
}

/** Valid logs are sorted by time, inside the round, on real holes, and bounded. */
export function validTaps(taps: unknown): taps is Tap[] {
  if (!Array.isArray(taps) || taps.length > MAX_TAPS) return false;
  let last = 0;
  for (const tap of taps) {
    if (!Array.isArray(tap) || tap.length !== 2) return false;
    const [t, h] = tap;
    if (!Number.isInteger(t) || !Number.isInteger(h)) return false;
    if (t < 0 || t > ROUND_MS || h < 0 || h >= HOLES || t < last) return false;
    last = t;
  }
  return true;
}

/**
 * Scores one board. `untilMs` resolves a prefix (Bonk Royale splits): taps at
 * or after it are ignored and only targets gone by then can count as escapes.
 */
export function resolve(spawns: Spawn[], taps: Tap[], untilMs: number = ROUND_MS): RaceResult {
  const byHole: Spawn[][] = Array.from({ length: HOLES }, () => []);
  for (const s of spawns) byHole[s.hole].push(s);
  const hit = new Set<number>();
  const whiffTimes: number[] = [];
  const r: RaceResult = {
    score: 0, hits: 0, quick: 0, goldens: 0, sgHits: 0, lureHits: 0, whiffs: 0, butterfingers: 0,
    maxStreak: 0, escapes: 0, reactions: [], sgReactions: SHARED_EIGHTHS.map(() => -1), hitIds: [],
    barScores: new Array<number>(BARS).fill(0),
  };
  let streak = 0;
  for (const [t, h] of taps) {
    if (t >= untilMs) break;
    let target: Spawn | null = null;
    for (const s of byHole[h]) {
      if (s.at <= t && t < s.at + s.up && !hit.has(s.id)) {
        target = s;
        break;
      }
    }
    const bar = barOf(t) - 1;
    if (!target) {
      r.whiffs += 1;
      whiffTimes.push(t);
      while (whiffTimes.length > 0 && whiffTimes[0] <= t - BUTTERFINGERS.windowMs) whiffTimes.shift();
      if (whiffTimes.length >= BUTTERFINGERS.whiffs) {
        r.butterfingers += 1;
        streak = 0;
        whiffTimes.length = 0;
      }
      continue;
    }
    hit.add(target.id);
    r.hitIds.push(target.id);
    if (target.kind === 'lure') {
      r.lureHits += 1;
      r.score += POINTS.lure;
      r.barScores[bar] += POINTS.lure;
      streak = lureDrop(streak);
      continue;
    }
    streak += 1;
    if (streak > r.maxStreak) r.maxStreak = streak;
    const reaction = t - target.at;
    r.hits += 1;
    if (target.sg > 0) {
      // Flat, never multiplied; the hit still feeds the streak.
      r.sgHits += 1;
      r.sgReactions[target.sg - 1] = reaction;
      r.score += POINTS.shared;
      r.barScores[bar] += POINTS.shared;
      continue;
    }
    const quick = target.kind === 'finn' && reaction <= QUICK_MS;
    const base = target.kind === 'golden' ? POINTS.golden : quick ? POINTS.quick : POINTS.finn;
    const gained = Math.floor((base * multTenths(streak)) / 10);
    r.score += gained;
    r.barScores[bar] += gained;
    if (quick) r.quick += 1;
    if (target.kind === 'golden') r.goldens += 1;
    r.reactions.push(reaction);
  }
  for (const s of spawns) {
    if (s.kind === 'lure' || hit.has(s.id)) continue;
    if (Math.min(s.at + s.up, ROUND_MS) <= untilMs) r.escapes += 1;
  }
  if (r.score < 0) r.score = 0;
  return r;
}

export interface SharedSettle {
  /** Bonus per entry, in entry order (+200 per SNATCH). */
  bonus: number[];
  /** Per Shared Golden: the winning reaction (-1 nobody hit it) and the entry indexes that snatched it. */
  golds: Array<{ sg: number; reaction: number; winners: number[] }>;
}

/**
 * Room-level SNATCH settle. Pass every seat's `sgReactions` (null for a seat
 * that doesn't compete, e.g. a disqualified log). The lowest replayed reaction
 * wins +200; everyone within 17 ms of it shares.
 */
export function settleShared(entries: Array<number[] | null>): SharedSettle {
  const bonus = entries.map(() => 0);
  const golds: SharedSettle['golds'] = [];
  for (let n = 0; n < SHARED_EIGHTHS.length; n++) {
    let best = -1;
    for (const e of entries) {
      const r = e ? e[n] ?? -1 : -1;
      if (r >= 0 && (best < 0 || r < best)) best = r;
    }
    const winners: number[] = [];
    if (best >= 0) {
      entries.forEach((e, i) => {
        const r = e ? e[n] ?? -1 : -1;
        if (r >= 0 && r - best <= SNATCH_TIE_MS) {
          winners.push(i);
          bonus[i] += SNATCH_BONUS;
        }
      });
    }
    golds.push({ sg: n + 1, reaction: best, winners });
  }
  return { bonus, golds };
}

export type KeyMomentKind = 'lure' | 'butterfingers' | 'golden_escaped' | 'shared_missed' | 'snatch_missed' | 'none';
export interface KeyMoment {
  kind: KeyMomentKind;
  /** 1-based bar, 0 when kind is none */
  bar: number;
  /** board-ms of the event */
  at: number;
  /** points it cost (always > 0 unless none) */
  cost: number;
  /** snatch_missed: how many ms slower than the snatcher */
  byMs: number;
}

const NO_MOMENT: KeyMoment = { kind: 'none', bar: 0, at: 0, cost: 0, byMs: 0 };

/**
 * The single event whose removal would have gained the most (design 7.1.5):
 * a lure tap, a Butterfingers, an escaped golden, a missed Shared Golden, or
 * (with the room settle and this entry's index) a SNATCH lost by a few ms.
 * Ties go to the earliest event. Pure: the server stores it as `key_moment`.
 */
export function explain(spawns: Spawn[], taps: Tap[], settle?: SharedSettle | null, entry = -1): KeyMoment {
  const base = resolve(spawns, taps);
  let best: KeyMoment = NO_MOMENT;
  const consider = (m: KeyMoment) => {
    if (m.cost <= 0) return;
    if (m.cost > best.cost || (m.cost === best.cost && m.at < best.at)) best = m;
  };
  const without = (drop: Set<number>) => resolve(spawns, taps.filter((_, i) => !drop.has(i))).score - base.score;
  // Walk the log once more to find lure taps and the whiffs behind each Butterfingers.
  const byHole: Spawn[][] = Array.from({ length: HOLES }, () => []);
  for (const s of spawns) byHole[s.hole].push(s);
  const hit = new Set<number>();
  const whiffs: Array<[number, number]> = [];
  taps.forEach(([t, h], i) => {
    if (t >= ROUND_MS) return;
    let target: Spawn | null = null;
    for (const s of byHole[h]) {
      if (s.at <= t && t < s.at + s.up && !hit.has(s.id)) {
        target = s;
        break;
      }
    }
    if (!target) {
      whiffs.push([t, i]);
      while (whiffs.length > 0 && whiffs[0][0] <= t - BUTTERFINGERS.windowMs) whiffs.shift();
      if (whiffs.length >= BUTTERFINGERS.whiffs) {
        consider({ kind: 'butterfingers', bar: barOf(t), at: t, cost: without(new Set(whiffs.map(([, j]) => j))), byMs: 0 });
        whiffs.length = 0;
      }
      return;
    }
    hit.add(target.id);
    if (target.kind === 'lure') consider({ kind: 'lure', bar: barOf(target.at), at: target.at, cost: without(new Set([i])), byMs: 0 });
  });
  for (const s of spawns) {
    if (s.kind !== 'golden' || hit.has(s.id)) continue;
    const at = s.at + 200;
    if (at >= ROUND_MS) continue;
    const added = [...taps, [at, s.hole] as Tap].sort((a, b) => a[0] - b[0]);
    const gain = resolve(spawns, added).score - base.score + (s.sg > 0 ? SNATCH_BONUS : 0);
    consider({ kind: s.sg > 0 ? 'shared_missed' : 'golden_escaped', bar: barOf(s.at), at: s.at, cost: gain, byMs: 0 });
  }
  if (settle && entry >= 0) {
    for (const g of settle.golds) {
      const mine = base.sgReactions[g.sg - 1];
      if (mine < 0 || g.reaction < 0 || g.winners.includes(entry)) continue;
      const at = grid(SHARED_EIGHTHS[g.sg - 1]);
      consider({ kind: 'snatch_missed', bar: barOf(at), at, cost: SNATCH_BONUS, byMs: mine - g.reaction });
    }
  }
  return best;
}

export type BotProfile = 'rookie' | 'regular' | 'ace';

/**
 * A play style in integers. Named crew profiles below; profile ghosts (design
 * 5.2.1) pass their own measured numbers, clamped to sane human ranges.
 */
export interface PlayStyle {
  hitPct: number;
  reactMin: number;
  reactSpread: number;
  lurePct: number;
  sgPct: number;
  sgMin: number;
  sgSpread: number;
}

export const BOT_PROFILES: Record<BotProfile, PlayStyle> = {
  rookie: { hitPct: 58, reactMin: 520, reactSpread: 420, lurePct: 22, sgPct: 70, sgMin: 330, sgSpread: 300 },
  regular: { hitPct: 74, reactMin: 430, reactSpread: 330, lurePct: 12, sgPct: 85, sgMin: 230, sgSpread: 230 },
  ace: { hitPct: 88, reactMin: 340, reactSpread: 250, lurePct: 5, sgPct: 95, sgMin: 150, sgSpread: 160 },
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
    reactMin: clampInt(profile.reactMin, 180, 900, d.reactMin),
    reactSpread: clampInt(profile.reactSpread, 60, 600, d.reactSpread),
    lurePct: clampInt(profile.lurePct, 0, 100, d.lurePct),
    sgPct: clampInt(profile.sgPct, 0, 98, d.sgPct),
    sgMin: clampInt(profile.sgMin, 120, 700, d.sgMin),
    sgSpread: clampInt(profile.sgSpread, 40, 500, d.sgSpread),
  };
}

/** Bot (or ghost) seat seed: a pure function of the round seed and the seat. */
export function botSeed(seed: number, seat: number): number {
  return (seed + (seat + 1) * 1000003) % 4294967296;
}

/**
 * Deterministic bot inputs. `fromMs` lets a ghost take over a dropped player's
 * seat mid-round: it only plays targets that rise at or after that moment.
 */
export function botTaps(spawns: Spawn[], seed: number, seat: number, profile: BotProfile | PlayStyle, fromMs = 0): Tap[] {
  const p = styleOf(profile);
  const next = rng(botSeed(seed, seat));
  const taps: Array<[number, number, number]> = [];
  for (const s of spawns) {
    const roll = next() % 100;
    const shared = s.sg > 0;
    const react = shared ? p.sgMin + (next() % p.sgSpread) : p.reactMin + (next() % p.reactSpread);
    if (s.at < fromMs) continue;
    const wants = s.kind === 'lure' ? roll < p.lurePct : roll < (shared ? p.sgPct : p.hitPct);
    if (!wants || react >= s.up - 40) continue;
    const at = s.at + react;
    if (at > ROUND_MS) continue;
    taps.push([at, s.hole, s.id]);
  }
  taps.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  return taps.map(([t, h]) => [t, h]);
}

/** A dropped player's final log: their own taps before `untilMs`, then their ghost. */
export function ghostFill(spawns: Spawn[], seed: number, seat: number, own: Tap[], untilMs: number, profile: BotProfile | PlayStyle): Tap[] {
  const mine = own.filter(([t]) => t < untilMs);
  const ghost = botTaps(spawns, seed, seat, profile, untilMs);
  const merged = [...mine, ...ghost];
  merged.sort((a, b) => a[0] - b[0]);
  return merged;
}

/** FNV-1a over the canonical result, for vector files and the zero-tolerance claim check. */
export function resultHash(r: RaceResult): string {
  const text = [r.score, r.hits, r.quick, r.goldens, r.sgHits, r.lureHits, r.whiffs, r.butterfingers, r.maxStreak, r.escapes,
    r.reactions.join('.'), r.sgReactions.join('.'), r.hitIds.join('.'), r.barScores.join('.')].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
