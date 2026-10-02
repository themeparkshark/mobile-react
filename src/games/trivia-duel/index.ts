/**
 * Trivia Duel public surface (Trivia+ merged with Shark Showdown).
 *
 *   <TriviaDuel visible mode="ride" seed={attemptSeed} parkId={parkId} ... />      Beat the Buzzer ride challenge
 *   <TriviaDuel visible mode="queue" seed={seed} rideId parkId chapterId ... />    Queue Duel vs Captain Fin
 *   <TriviaDuel visible mode="ghost" ghost={record} ... />                          Ghost Duel on the identical seed
 */
export { TriviaDuel } from './TriviaDuel';
export type { TriviaDuelProps } from './TriviaDuel';
export { decodeGhost, encodeGhost, planMatch, planFromIds, gradeRun } from './engine/match';
export type { GhostRecord, MatchPlan } from './engine/match';
