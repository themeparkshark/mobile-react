/**
 * Line of the Day (design v4 12.2): the async main path. Everyone who plays a
 * Line Run in this ride's queue today lands on one board, on one seed:
 *
 *   dailySeed = hash(rideId, parkLocalDate)
 *   xform     = hash(dailySeed, userId) % 8   (same timing, transformed formations)
 *
 * Your Run races the ghosts of the 3 players just above your best rank today
 * (named, timed: "Maya, 2:14 PM"), mapped into your board through
 * mine o theirs^-1. Nobody is ever presented as live: a ghost is a replayed,
 * server-verified Run (12.1). The endpoint `GET /api/whack/line-day/{rideId}`
 * and the ghost fetch are WS7 change requests (SERVER_REPLAY.md); until they
 * land, the local adapter keeps your own Runs today as the board.
 */

import { mixSeed } from '../../../gamekit/core/rng';
import type { WhackGhost } from './types';

/** FNV-1a 32 of a string (ride ids can be numeric or slugs). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Park-local calendar date as YYYY-MM-DD (the server sends the park's offset; local time otherwise). */
export function parkLocalDate(nowMs: number, utcOffsetMin?: number): string {
  const off = utcOffsetMin ?? -new Date(nowMs).getTimezoneOffset();
  const d = new Date(nowMs + off * 60000);
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${d.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function lineDaySeed(rideId: string | number, date: string): number {
  const ymd = parseInt(date.replace(/-/g, ''), 10) >>> 0;
  return mixSeed(hashString(String(rideId)), ymd) >>> 0;
}

/** Per-user dihedral sub-seed: the same timing for everyone, formations transformed. */
export function lineDayXform(dailySeed: number, userId: number | string): number {
  return mixSeed(dailySeed >>> 0, typeof userId === 'number' ? userId >>> 0 : hashString(String(userId))) % 8;
}

export interface LineDayEntry {
  userId: number | string;
  name: string;
  /** "2:14 PM" (park local), from the server's verified timestamp. */
  timeLabel: string;
  avatar?: string;
  score: number;
  /** One ghost per Burst (verified replays). */
  ghosts?: WhackGhost[];
  /** Shadow-flagged results never appear on anyone else's board. */
  flagged?: boolean;
}

export interface LineDayBoard {
  rideId: string | number;
  date: string;
  seed: number;
  entries: LineDayEntry[];
}

/** Ranked view: best Run per player, flagged results hidden except to their owner. */
export function rankBoard(board: LineDayBoard, me: number | string | null): LineDayEntry[] {
  const best = new Map<string, LineDayEntry>();
  for (const e of board.entries) {
    if (e.flagged && String(e.userId) !== String(me)) continue;
    const k = String(e.userId);
    const prev = best.get(k);
    if (!prev || e.score > prev.score) best.set(k, e);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || String(a.userId).localeCompare(String(b.userId)));
}

/** 1-based rank a score would take on the board (ties share the better rank). */
export function rankOf(ranked: LineDayEntry[], score: number): number {
  let r = 1;
  for (const e of ranked) if (e.score > score) r++;
  return r;
}

/** The (up to) 3 players just above my best today: who my Run races. No best yet: the 3 nearest the median. */
export function rivalsFor(ranked: LineDayEntry[], me: number | string | null, myBest: number | null): LineDayEntry[] {
  const others = ranked.filter((e) => String(e.userId) !== String(me));
  if (!others.length) return [];
  if (myBest == null) {
    const mid = Math.floor(others.length / 2);
    return others.slice(Math.max(0, mid - 1), mid + 2);
  }
  const above = others.filter((e) => e.score > myBest);
  return above.slice(-3);
}

/** "beat Maya (2:14 PM) by 320" / "+320 AHEAD OF MAYA" lines for the finale. */
export function ghostDeltaLine(myScore: number, rival: LineDayEntry | null): string | null {
  if (!rival) return null;
  const d = myScore - rival.score;
  const first = rival.name.split(' ')[0].toUpperCase();
  return d >= 0 ? `+${d.toLocaleString()} AHEAD OF ${first}` : `${(-d).toLocaleString()} BEHIND ${first} (${rival.timeLabel})`;
}
