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

export type PartySimKey = 'bonk_race' | 'trivia_sprint';
export type SimTap = [number, number];
export type SimProfile = 'rookie' | 'regular' | 'ace';

export interface PartySim<Board = unknown, Result extends { score: number } = { score: number }> {
  key: PartySimKey;
  version: number;
  roundMs: number;
  maxTaps: number;
  build(seed: number): Board;
  validTaps(taps: unknown): boolean;
  resolve(board: Board, taps: SimTap[]): Result;
  botTaps(board: Board, seed: number, seat: number, profile: SimProfile, fromMs?: number): SimTap[];
  ghostFill(board: Board, seed: number, seat: number, own: SimTap[], untilMs: number, profile: SimProfile): SimTap[];
  resultHash(result: Result): string;
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
  },
  trivia_sprint: {
    key: 'trivia_sprint',
    version: sprint.TRIVIA_SPRINT_VERSION,
    roundMs: sprint.ROUND_MS,
    maxTaps: sprint.MAX_TAPS,
    build: sprint.buildQuestions,
    validTaps: sprint.validTaps,
    resolve: sprint.resolve,
    botTaps: sprint.botTaps,
    ghostFill: sprint.ghostFill,
    resultHash: sprint.resultHash,
  },
};

export function partySim(key: string): PartySim<any, any> | null {
  return (PARTY_SIMS as Record<string, PartySim<any, any>>)[key] ?? null;
}
