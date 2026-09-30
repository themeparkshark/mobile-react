/**
 * Client side of the Line Party game registry (mirrors the backend's
 * PartyGames). Every game is a pure, integer-only sim keyed by the round's
 * `game`, so the room shell, the live race strip, bots and the client's
 * advisory score work the same for every game.
 *
 *   bonk_race      Whack-a-Shark race (games/party/bonkRace.ts)
 *   trivia_sprint  Trivia Duel live: 3 face-down questions (games/trivia-duel/party/triviaSprint.ts)
 */
import * as bonk from '../../games/party/bonkRace';
import * as sprint from '../../games/trivia-duel/party/triviaSprint';

export type PartyGameKey = 'bonk_race' | 'trivia_sprint';
export type AnyTap = [number, number];
export type BotProfileName = 'rookie' | 'regular' | 'ace';

export interface PartyGameClient {
  key: PartyGameKey;
  version: number;
  roundMs: number;
  /** Score for a (partial) tap log. */
  score(seed: number, taps: AnyTap[]): number;
  botTaps(seed: number, seat: number, profile: BotProfileName): AnyTap[];
}

const timelines = new Map<string, unknown>();
function cached<T>(key: string, seed: number, build: (s: number) => T): T {
  const k = `${key}:${seed}`;
  let v = timelines.get(k) as T | undefined;
  if (!v) {
    v = build(seed);
    if (timelines.size > 16) timelines.clear();
    timelines.set(k, v);
  }
  return v;
}

export const PARTY_GAMES: Record<PartyGameKey, PartyGameClient> = {
  bonk_race: {
    key: 'bonk_race',
    version: bonk.BONK_RACE_VERSION,
    roundMs: bonk.ROUND_MS,
    score: (seed, taps) => bonk.resolve(cached('bonk', seed, bonk.buildTimeline), taps).score,
    botTaps: (seed, seat, profile) => bonk.botTaps(cached('bonk', seed, bonk.buildTimeline), seed, seat, profile),
  },
  trivia_sprint: {
    key: 'trivia_sprint',
    version: sprint.TRIVIA_SPRINT_VERSION,
    roundMs: sprint.ROUND_MS,
    score: (seed, taps) => sprint.resolve(cached('sprint', seed, sprint.buildQuestions), taps).score,
    botTaps: (seed, seat, profile) => sprint.botTaps(cached('sprint', seed, sprint.buildQuestions), seed, seat, profile),
  },
};

export function partyGame(key: string | null | undefined): PartyGameClient {
  return PARTY_GAMES[(key as PartyGameKey) ?? 'bonk_race'] ?? PARTY_GAMES.bonk_race;
}
