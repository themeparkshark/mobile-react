/**
 * Whack-a-Shark "Bonk Rush" (design: tps-prime-time-audit/studio/design/whack.md).
 *
 * Queue Runs of short authored Bursts, the 30s Ride Challenge with a
 * server-replayable proof (v2), shared-seed ghosts, Bonk Battle duels and
 * Crew Raids. Walk-safe: movement is never an input; Auto Look-Up freezes
 * the board before a disengaged player can lose a target.
 */

export { WhackAShark, default } from './WhackAShark';
export type { WhackASharkProps, WhackHandle, BurstBanked } from './WhackAShark';
export type { Difficulty, WhackFormat } from './waves';
export type { WhackProofV2 } from './proof';
export { verifyProof, WHACK_PROOF_ERROR } from './proof';
export type { WhackNetAdapter, WhackGhost, WhackDuelConfig, WhackRaidConfig, WhackServerEvent, BurstVerdict } from './net/types';
export { createLocalNetAdapter } from './net/localAdapter';
