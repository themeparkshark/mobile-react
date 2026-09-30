/**
 * modes/daily.ts: Daily Deck rules that are not the engine (design 4.3, 4.4).
 *
 * Pure and deterministic so the server port (WS7 memory_sessions, mode=daily)
 * can mirror it:
 *   - the day key (park-local calendar date) and the deck of the day,
 *   - the face set of the day (same for everyone) and the per-player shuffle,
 *   - the streak with one banked freeze per 7-day streak,
 *   - turn-based ghosts (friend, team or the par shark) and the delta chip,
 *   - the share grid rows (one cell per turn, coloured and shaped by verdict).
 */

import { parFor } from '../engine';

/** Rotation for the deck of the day when no ride deck applies. */
export const DAILY_DECKS = ['park', 'ocean', 'space', 'pirates', 'mansion', 'backlot', 'jungle', 'rainbow-ridge'] as const;

/** Park-local calendar date (the device's local date) as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole days since 1970-01-01 for a day key (calendar arithmetic, no DST drift). */
export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map((x) => Number.parseInt(x, 10));
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** FNV-1a 32-bit over a string. */
export function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The deck of the day. In a ride queue the ride's own deck wins (ride stamps). */
export function dailyDeckId(key: string, rideDeckId?: string | null): string {
  if (rideDeckId) return rideDeckId;
  const n = dayNumber(key);
  return DAILY_DECKS[((n % DAILY_DECKS.length) + DAILY_DECKS.length) % DAILY_DECKS.length];
}

/** Which faces appear today: identical for every player on the same deck. */
export function dailyFaceSeed(key: string, deckId: string): number {
  return hash32(`mm-daily-faces:${key}:${deckId}`);
}

/**
 * Where they sit: shuffled per player so nobody can post the answer. The
 * ranked server session uses HMAC(app.key, day:user_id) instead; this local
 * seed is only for practice and the offline preview.
 */
export function dailyLayoutSeed(key: string, userKey: string, attempt = 0): number {
  return hash32(`mm-daily-layout:${key}:${userKey}:${attempt}`);
}

// -----------------------------------------------------------------------------
// Streak
// -----------------------------------------------------------------------------

export interface StreakState {
  /** Last day with a ranked attempt. */
  last: string | null;
  streak: number;
  best: number;
  /** Banked freezes (max 1). */
  freezes: number;
}

export const EMPTY_STREAK: StreakState = { last: null, streak: 0, best: 0, freezes: 0 };
export const FREEZE_EVERY = 7;
export const FREEZE_MAX = 1;

/** A ranked attempt was made on `key`. One missed day is covered by a banked freeze. */
export function applyRankedDay(st: StreakState, key: string): { state: StreakState; usedFreeze: boolean; earnedFreeze: boolean } {
  if (st.last === key) return { state: st, usedFreeze: false, earnedFreeze: false };
  let streak = 1;
  let freezes = st.freezes;
  let usedFreeze = false;
  if (st.last) {
    const gap = dayNumber(key) - dayNumber(st.last);
    if (gap === 1) streak = st.streak + 1;
    else if (gap === 2 && freezes > 0) {
      streak = st.streak + 1;
      freezes -= 1;
      usedFreeze = true;
    } else if (gap <= 0) {
      // Clock moved backwards: keep the streak, never double count.
      return { state: st, usedFreeze: false, earnedFreeze: false };
    }
  }
  let earnedFreeze = false;
  if (streak % FREEZE_EVERY === 0 && freezes < FREEZE_MAX) {
    freezes += 1;
    earnedFreeze = true;
  }
  return { state: { last: key, streak, best: Math.max(st.best, streak), freezes }, usedFreeze, earnedFreeze };
}

/** The streak as it stands today (0 once a day was missed without a freeze). */
export function liveStreak(st: StreakState, today: string): number {
  if (!st.last) return 0;
  const gap = dayNumber(today) - dayNumber(st.last);
  if (gap <= 1) return st.streak;
  if (gap === 2 && st.freezes > 0) return st.streak;
  return 0;
}

// -----------------------------------------------------------------------------
// Ghosts (turn based, never on the board)
// -----------------------------------------------------------------------------

/** Verdict codes as recorded by the engine: 0 recall 1 lucky 2 scout 3 slip 4 gull. */
export const V_RECALL = 0;
export const V_LUCKY = 1;
export const V_SCOUT = 2;
export const V_SLIP = 3;
export const V_GULL = 4;

export interface DailyGhost {
  name: string;
  verdicts: number[];
  /** A friend or teammate (from the server), or the par shark stand-in. */
  kind: 'friend' | 'team' | 'par';
}

export function isMatchVerdict(v: number): boolean {
  return v === V_RECALL || v === V_LUCKY;
}

/** Pairs a verdict log holds after its first k turns. */
export function pairsAfter(verdicts: readonly number[], k: number): number {
  let n = 0;
  for (let i = 0; i < Math.min(k, verdicts.length); i++) if (isMatchVerdict(verdicts[i])) n++;
  return n;
}

/** Turns a verdict log needed to reach p pairs (Infinity if it never did). */
export function turnsToPairs(verdicts: readonly number[], p: number): number {
  if (p <= 0) return 0;
  let n = 0;
  for (let i = 0; i < verdicts.length; i++) {
    if (isMatchVerdict(verdicts[i])) n++;
    if (n >= p) return i + 1;
  }
  return Infinity;
}

/**
 * The par shark: a clean player who clears exactly on par. It scouts the
 * first half of the board, then cashes in, which is what a real clean run
 * looks like turn by turn.
 */
export function parGhost(pairs = 8): DailyGhost {
  const par = parFor(pairs);
  let scouts = par - pairs;
  let matches = pairs;
  const verdicts: number[] = [];
  // Two opening scouts, a lucky first pair, then scout / recall until the scouts run out.
  for (let t = 0; t < par; t++) {
    const wantScout = t < 2 || (t > 2 && t % 2 === 1);
    if ((wantScout && scouts > 0) || matches === 0) { verdicts.push(V_SCOUT); scouts--; } else { verdicts.push(t === 2 ? V_LUCKY : V_RECALL); matches--; }
  }
  return { name: 'PAR', verdicts, kind: 'par' };
}

/**
 * Delta chip after my turn `myTurns` holding `myPairs`: positive = I lead by
 * that many turns (the ghost needed more turns for the same pairs).
 */
export function ghostDelta(ghost: readonly number[], myTurns: number, myPairs: number): number | null {
  if (myPairs <= 0) return null;
  const theirs = turnsToPairs(ghost, myPairs);
  if (!Number.isFinite(theirs)) return myTurns > 0 ? ghost.length - myTurns + 1 : null;
  return theirs - myTurns;
}

export function ghostDeltaLabel(delta: number | null, name: string): string | null {
  if (delta == null) return null;
  if (delta === 0) return `Even with ${name}`;
  const n = Math.abs(delta);
  return `${delta > 0 ? '+' : '-'}${n} ${n === 1 ? 'turn' : 'turns'} vs ${name}`;
}

// -----------------------------------------------------------------------------
// Share grid (Wordle style image, never emoji)
// -----------------------------------------------------------------------------

export type ShareCell = 'recall' | 'lucky' | 'scout' | 'slip' | 'gull';

const CELL: Record<number, ShareCell> = { 0: 'recall', 1: 'lucky', 2: 'scout', 3: 'slip', 4: 'gull' };

/** One small square per turn, wrapped into rows of `perRow`. */
export function shareRows(verdicts: readonly number[], perRow = 8): ShareCell[][] {
  const rows: ShareCell[][] = [];
  verdicts.forEach((v, i) => {
    if (i % perRow === 0) rows.push([]);
    rows[rows.length - 1].push(CELL[v] ?? 'scout');
  });
  return rows;
}

/** A ride stamp lands on an at-or-under-par clear of that ride's deck. */
export function earnsStamp(cleared: boolean, turns: number, pairs: number, rideKey: string | null): boolean {
  return !!rideKey && cleared && turns <= parFor(pairs);
}
