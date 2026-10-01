/**
 * partyGame.ts: Memory Race as a Line Party game ("memory_race").
 *
 * Parallel boards from the round seed, the same way Bonk Race works: each phone
 * records its flips as a tick-stamped tap log ([boardMs, slot], slot -1 = a
 * quick dismiss) and the server replays it with the PHP port of engine.ts
 * (golden vectors: src/games/memory/engine.vectors.json). The client score is
 * only used to flag desync.
 */
import { registerPartyGame, type PartyGameDef } from '../../../gamekit/net/PartyClient';
import { createEngine, raceConfig, step, type MMState } from '../engine';
import { RACE_MS, RACE_PLAY_AT, glimpseAll, raceLayout } from './raceSim';

export const MEMORY_RACE_KEY = 'memory_race';
/** 2 = engine mm-6 scoring (lucky 60 / glimpse 120 / recall 160, turn Showtime with a pot). */
export const MEMORY_RACE_VERSION = 2;
/** Round length the server schedules: play window plus the glimpse. */
export const MEMORY_RACE_ROUND_MS = RACE_MS + RACE_PLAY_AT;

/** Replay a party tap log on the round's board. */
export function replayRaceTaps(seed: number, taps: Array<[number, number]>, endAt?: number): MMState {
  const layout = raceLayout(seed);
  const s = createEngine(raceConfig(), { cols: layout.cols, rows: layout.rows, seed });
  glimpseAll(s, layout);
  for (const [at, slot] of taps) {
    if (slot < 0) {
      step(s, { t: 'dismiss', slot: -1, at });
      continue;
    }
    step(s, { t: 'tick', at });
    if (s.phase === 2) step(s, { t: 'dismiss', slot: -1, at });
    step(s, { t: 'flip', slot, face: layout.faces[s.ids[slot]], at });
  }
  if (endAt != null) step(s, { t: 'tick', at: endAt });
  return s;
}

export const memoryRaceParty: PartyGameDef = {
  key: MEMORY_RACE_KEY,
  version: MEMORY_RACE_VERSION,
  timeline: () => [],
  score: (seed, taps) => replayRaceTaps(seed, taps as Array<[number, number]>).score,
};

let registered = false;
export function registerMemoryRace(): void {
  if (registered) return;
  registered = true;
  registerPartyGame(memoryRaceParty);
}
