/**
 * bonkRace.ts: the Line Party "Bonk Race" micro-round, as a pure, integer-only
 * simulation shared with the server.
 *
 * Every phone in a room builds the same timeline from the server's seed, plays
 * it on its own board (parallel boards, Tetris 99 style), and submits a tap log.
 * The server runs a line-for-line PHP port (BE app/Domains/Party/Sim/BonkRaceSim)
 * to produce the only score that counts. Golden vectors generated from this file
 * (tools/tests/fixtures/party/bonk_race_vectors.json) are replayed by both the
 * node tests and PHPUnit, so the two ports cannot drift.
 *
 * Rules for this file: integers only, no Math.random, no floats in state, no
 * Date. Math.floor on non-negative values only (it equals PHP intdiv there).
 *
 * Walk-safe by design (the line is always moving): whiffs are free, escapes
 * never break the streak, only bonking a lure or three whiffs inside a second
 * (a bump, a mash) does. Targets are big 3x3 cells and stay up 1.0-1.35s.
 */

export const BONK_RACE_VERSION = 1;
export const ROUND_MS = 20000;
export const HOLES = 9;
export const MAX_TAPS = 400;

export type TargetKind = 'finn' | 'golden' | 'lure';

export interface Spawn {
  id: number;
  at: number;
  hole: number;
  kind: TargetKind;
  up: number;
}

/** [ms since GO, hole 0-8] */
export type Tap = [number, number];

export interface RaceResult {
  score: number;
  hits: number;
  quick: number;
  goldens: number;
  lureHits: number;
  whiffs: number;
  butterfingers: number;
  maxStreak: number;
  escapes: number;
  /** ms from spawn to tap for every non-lure hit, in tap order */
  reactions: number[];
  /** spawn ids hit, in tap order (drives ghost markers and the replay check) */
  hitIds: number[];
}

export const POINTS = { finn: 100, quick: 150, golden: 300, lure: -150 } as const;
export const QUICK_MS = 380;
export const BUTTERFINGERS = { whiffs: 3, windowMs: 1000 } as const;

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

/** Streak multiplier in tenths: x1 for hits 1-5, x1.5 for 6-10 ... capped x3. */
export function multTenths(streak: number): number {
  const tier = Math.min(4, Math.floor((streak - 1) / 5));
  return 10 + 5 * tier;
}

export function buildTimeline(seed: number): Spawn[] {
  const next = rng(seed);
  const spawns: Spawn[] = [];
  const busyUntil = new Array<number>(HOLES).fill(0);
  let t = 600;
  let id = 0;
  while (t < ROUND_MS - 700) {
    const progress = Math.floor((t * 1000) / ROUND_MS); // 0..1000
    const gap = 880 - Math.floor((progress * 380) / 1000); // 880 -> 500ms
    const up = 1350 - Math.floor((progress * 350) / 1000); // 1350 -> 1000ms
    const roll = next() % 100;
    const jitter = (next() % 7) * 20 - 60; // -60..+60ms
    const kind: TargetKind = t > 3000 && roll < 7 ? 'golden' : t > 2500 && roll < 19 ? 'lure' : 'finn';
    const free: number[] = [];
    for (let h = 0; h < HOLES; h++) if (busyUntil[h] <= t) free.push(h);
    if (free.length === 0) {
      t += 120;
      continue;
    }
    const hole = free[next() % free.length];
    const life = kind === 'golden' ? Math.floor((up * 8) / 10) : up;
    spawns.push({ id, at: t, hole, kind, up: life });
    busyUntil[hole] = t + life + 150;
    id += 1;
    // Late in the round a second target sometimes rises on the same beat.
    if (progress > 450 && next() % 100 < 22) {
      const free2: number[] = [];
      for (let h = 0; h < HOLES; h++) if (busyUntil[h] <= t) free2.push(h);
      if (free2.length > 0) {
        const hole2 = free2[next() % free2.length];
        spawns.push({ id, at: t, hole: hole2, kind: 'finn', up });
        busyUntil[hole2] = t + up + 150;
        id += 1;
      }
    }
    t += gap + jitter;
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

export function resolve(spawns: Spawn[], taps: Tap[]): RaceResult {
  const byHole: Spawn[][] = Array.from({ length: HOLES }, () => []);
  for (const s of spawns) byHole[s.hole].push(s);
  const hit = new Set<number>();
  const whiffTimes: number[] = [];
  const r: RaceResult = {
    score: 0, hits: 0, quick: 0, goldens: 0, lureHits: 0, whiffs: 0, butterfingers: 0,
    maxStreak: 0, escapes: 0, reactions: [], hitIds: [],
  };
  let streak = 0;
  for (const [t, h] of taps) {
    let target: Spawn | null = null;
    for (const s of byHole[h]) {
      if (s.at <= t && t < s.at + s.up && !hit.has(s.id)) {
        target = s;
        break;
      }
    }
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
      streak = 0;
      continue;
    }
    streak += 1;
    if (streak > r.maxStreak) r.maxStreak = streak;
    const reaction = t - target.at;
    const quick = target.kind === 'finn' && reaction <= QUICK_MS;
    const base = target.kind === 'golden' ? POINTS.golden : quick ? POINTS.quick : POINTS.finn;
    r.score += Math.floor((base * multTenths(streak)) / 10);
    r.hits += 1;
    if (quick) r.quick += 1;
    if (target.kind === 'golden') r.goldens += 1;
    r.reactions.push(reaction);
  }
  for (const s of spawns) if (s.kind !== 'lure' && !hit.has(s.id)) r.escapes += 1;
  if (r.score < 0) r.score = 0;
  return r;
}

export type BotProfile = 'rookie' | 'regular' | 'ace';

export const BOT_PROFILES: Record<BotProfile, { hitPct: number; reactMin: number; reactSpread: number; lurePct: number }> = {
  rookie: { hitPct: 58, reactMin: 520, reactSpread: 420, lurePct: 22 },
  regular: { hitPct: 74, reactMin: 430, reactSpread: 330, lurePct: 12 },
  ace: { hitPct: 88, reactMin: 340, reactSpread: 250, lurePct: 5 },
};

/** Bot (or ghost) seat seed: a pure function of the round seed and the seat. */
export function botSeed(seed: number, seat: number): number {
  return (seed + (seat + 1) * 1000003) % 4294967296;
}

/**
 * Deterministic bot inputs. `fromMs` lets a ghost take over a dropped player's
 * seat mid-round: it only plays targets that rise at or after that moment.
 */
export function botTaps(spawns: Spawn[], seed: number, seat: number, profile: BotProfile, fromMs = 0): Tap[] {
  const p = BOT_PROFILES[profile];
  const next = rng(botSeed(seed, seat));
  const taps: Array<[number, number, number]> = [];
  for (const s of spawns) {
    const roll = next() % 100;
    const react = p.reactMin + (next() % p.reactSpread);
    if (s.at < fromMs) continue;
    const wants = s.kind === 'lure' ? roll < p.lurePct : roll < p.hitPct;
    if (!wants || react >= s.up - 40) continue;
    const at = s.at + react;
    if (at > ROUND_MS) continue;
    taps.push([at, s.hole, s.id]);
  }
  taps.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  return taps.map(([t, h]) => [t, h]);
}

/** A dropped player's final log: their own taps before `untilMs`, then their ghost. */
export function ghostFill(spawns: Spawn[], seed: number, seat: number, own: Tap[], untilMs: number, profile: BotProfile): Tap[] {
  const mine = own.filter(([t]) => t < untilMs);
  const ghost = botTaps(spawns, seed, seat, profile, untilMs);
  const merged = [...mine, ...ghost];
  merged.sort((a, b) => a[0] - b[0]);
  return merged;
}

/** FNV-1a over the canonical result, for vector files and quick equality checks. */
export function resultHash(r: RaceResult): string {
  const text = [r.score, r.hits, r.quick, r.goldens, r.lureHits, r.whiffs, r.butterfingers, r.maxStreak, r.escapes,
    r.reactions.join('.'), r.hitIds.join('.')].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
