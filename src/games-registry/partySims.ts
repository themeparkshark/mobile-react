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
 *
 * Rev 7: bonk_race v3 (beat judgement, Splash landings as log codes
 * 1000 + n, band check), trivia_sprint v3 (beat grid, answer codes 10-13,
 * local-board-ms speed points, streak bonus only).
 */
import * as bonk from '../games/party/bonkRace';
import * as sprint from '../games/trivia-duel/party/triviaSprint';
import * as dash from '../games/current-quest/party/lagoonDash';

export type PartySimKey = 'bonk_race' | 'trivia_sprint' | 'lagoon_dash';
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
  /**
   * `incoming`: Splashes due on this board at or after fromMs/untilMs as
   * [land board-ms, n] (Bonk Race only); the ghost logs, cracks and pops them.
   */
  botTaps(board: Board, seed: number, seat: number, profile: SimProfile, fromMs?: number, incoming?: Array<[number, number]>): SimTap[];
  ghostFill(board: Board, seed: number, seat: number, own: SimTap[], untilMs: number, profile: SimProfile, incoming?: Array<[number, number]>): SimTap[];
  resultHash(result: Result): string;
  /**
   * Room-level settle for head-to-head bonuses (Bonk Race SNATCH). Takes each
   * seat's resolve() result in seat order (null = not competing) and returns
   * the bonus per seat plus whatever detail the results screen needs.
   */
  settle(results: Array<Result | null>): { bonus: number[]; detail: unknown };
  /** The single biggest lost-points moment of one log (design 7.1.5), or null. */
  explain(board: Board, taps: SimTap[], settle: { bonus: number[]; detail: unknown } | null, seat: number): unknown;
  /** Board-ms of every streak hit that earned a Splash (Bonk Race; [] elsewhere). */
  splashEarned(result: Result): number[];
  /** Perfect-read score of a board, and whether it sits inside the ranked band (design 9.3, 11.2). */
  bandCheck(board: Board): number;
  bandOk(board: Board): boolean;
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
      const s = bonk.settleShared(results.map((r) => (r ? r.sgOffsets : null)));
      return { bonus: s.bonus, detail: s.golds };
    },
    explain: (board, taps, settle, seat) => bonk.explain(board, taps, settle ? { bonus: settle.bonus, golds: settle.detail as bonk.SharedSettle['golds'] } : null, seat),
    splashEarned: bonk.splashEarned,
    bandCheck: bonk.bandCheck,
    bandOk: bonk.bandOk,
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
    splashEarned: () => [],
    bandCheck: () => 0,
    bandOk: () => true,
  },
  // Current Quest's Same-Board Showdown as a 45 s micro-round (ranked by shells, strokes, undos; never time).
  lagoon_dash: {
    key: 'lagoon_dash',
    version: dash.LAGOON_DASH_VERSION,
    roundMs: dash.ROUND_MS,
    maxTaps: dash.MAX_TAPS,
    build: dash.buildBoard,
    validTaps: dash.validTaps,
    resolve: dash.resolve,
    botTaps: (board, seed, seat, profile, fromMs) => dash.botTaps(board, seed, seat, profile === 'ace' ? 'ace' : profile, fromMs),
    ghostFill: (board, seed, seat, own, untilMs, profile) => dash.ghostFill(board, seed, seat, own, untilMs, profile),
    resultHash: dash.resultHash,
    settle: (results) => ({ bonus: results.map(() => 0), detail: null }),
    explain: () => null,
    splashEarned: () => [],
    bandCheck: () => 0,
    bandOk: () => true,
  },
};

export function partySim(key: string): PartySim<any, any> | null {
  return (PARTY_SIMS as Record<string, PartySim<any, any>>)[key] ?? null;
}
