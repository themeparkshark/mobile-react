/**
 * Line Party sim registry: the one source of truth for every party game.
 *
 * The app plays these sims, and tools/build-sim-bundle.mjs bundles this exact
 * file for the backend's Node replay sidecar (BE/sim-runner), versioned by
 * content hash. The server never scores with anything else (design 11.3).
 *
 * Every entry is pure and integer-only: build(seed) makes the shared board,
 * resolve(board, taps) scores a tap log, botTaps/ghostFill play empty or
 * dropped seats, and resultHash is the events hash compared with zero tolerance.
 */
import * as bonk from '../games/party/bonkRace';
import * as sprint from '../games/trivia-duel/party/triviaSprint';
import * as rush from '../games/whack/party/whackRush';

export type PartySimKey = 'bonk_race' | 'trivia_sprint' | 'whack_rush';
export type SimTap = [number, number];
export type SimProfile = 'rookie' | 'regular' | 'ace';

export interface PartySim<Board = unknown, Result extends { score: number } = { score: number }> {
  key: PartySimKey;
  version: number;
  roundMs: number;
  maxTaps: number;
  build(seed: number): Board;
  validTaps(taps: unknown): boolean;
  /** untilMs resolves a prefix (Bonk Royale splits): only taps before it count. */
  resolve(board: Board, taps: SimTap[], untilMs?: number): Result;
  botTaps(board: Board, seed: number, seat: number, profile: SimProfile, fromMs?: number): SimTap[];
  ghostFill(board: Board, seed: number, seat: number, own: SimTap[], untilMs: number, profile: SimProfile): SimTap[];
  resultHash(result: Result): string;
  /** Optional: score after every stepMs of board time in one pass (live scoreboards for heavier sims). */
  scoreCurve?(board: Board, taps: SimTap[], stepMs?: number): number[];
  /**
   * Room-level settle for head-to-head bonuses (Bonk Race SNATCH). Takes each
   * seat's resolve() result in seat order (null = not competing) and returns
   * the bonus per seat plus whatever detail the results screen needs.
   */
  settle(results: Array<Result | null>): { bonus: number[]; detail: unknown };
  /** The single biggest lost-points moment of one log (design 7.1.5), or null. */
  explain(board: Board, taps: SimTap[], settle: { bonus: number[]; detail: unknown } | null, seat: number): unknown;
}

export const PARTY_SIMS: Record<PartySimKey, PartySim<any, any>> = {
  bonk_race: {
    key: 'bonk_race',
    version: bonk.BONK_RACE_VERSION,
    roundMs: bonk.ROUND_MS,
    maxTaps: bonk.MAX_TAPS,
    build: bonk.buildTimeline,
    validTaps: bonk.validTaps,
    resolve: bonk.resolve,
    botTaps: bonk.botTaps,
    ghostFill: bonk.ghostFill,
    resultHash: bonk.resultHash,
    settle: (results) => {
      const s = bonk.settleShared(results.map((r) => (r ? r.sgReactions : null)));
      return { bonus: s.bonus, detail: s.golds };
    },
    explain: (board, taps, settle, seat) => bonk.explain(board, taps, settle ? { bonus: settle.bonus, golds: settle.detail as bonk.SharedSettle['golds'] } : null, seat),
  },
  trivia_sprint: {
    key: 'trivia_sprint',
    version: sprint.TRIVIA_SPRINT_VERSION,
    roundMs: sprint.ROUND_MS,
    maxTaps: sprint.MAX_TAPS,
    build: sprint.buildQuestions,
    validTaps: sprint.validTaps,
    resolve: (board, taps, untilMs) => sprint.resolve(board, untilMs === undefined ? taps : taps.filter(([t]) => t < untilMs)),
    botTaps: sprint.botTaps,
    ghostFill: sprint.ghostFill,
    resultHash: sprint.resultHash,
    settle: (results) => ({ bonus: results.map(() => 0), detail: null }),
    explain: () => null,
  },
  // Whack-a-Shark's live round: the full Bonk Rush board (grades, crits, fever) on one shared seed.
  whack_rush: {
    key: 'whack_rush',
    version: rush.WHACK_RUSH_VERSION,
    roundMs: rush.ROUND_MS,
    maxTaps: rush.MAX_TAPS,
    build: rush.buildBoard,
    validTaps: rush.validTaps,
    resolve: rush.resolve,
    botTaps: rush.botTaps,
    ghostFill: rush.ghostFill,
    resultHash: rush.resultHash,
    scoreCurve: rush.scoreCurve,
    settle: (results) => ({ bonus: results.map(() => 0), detail: null }),
    explain: () => null,
  },
};

export function partySim(key: string): PartySim<any, any> | null {
  return (PARTY_SIMS as Record<string, PartySim<any, any>>)[key] ?? null;
}
