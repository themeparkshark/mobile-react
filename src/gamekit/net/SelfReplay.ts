/**
 * SelfReplay (design rev 7, 11.2): after the final beat and before submit,
 * the phone re-runs its own sim on its own log from a fresh board and compares
 * it with what the live board scored. A mismatch is a client bug (render code
 * that touched game state, a stale board), never the player's fault: dev
 * builds show a red overlay, production ships `party_self_replay_mismatch`
 * with both hashes, and the submit proceeds either way (the server decides).
 */
import type { PartySim, SimTap } from '../../games-registry/partySims';

export interface SelfReplayResult {
  score: number;
  hash: string;
  /** null when the live board never reported a score */
  matches: boolean | null;
  ms: number;
}

export function selfReplay(sim: PartySim<any, any>, seed: number, taps: SimTap[], liveScore: number | null, clock: () => number = () => Date.now()): SelfReplayResult {
  const started = clock();
  const fresh = sim.build(seed);
  const r = sim.resolve(fresh, taps);
  const hash = sim.resultHash(r);
  return { score: r.score, hash, matches: liveScore === null ? null : liveScore === r.score, ms: clock() - started };
}
