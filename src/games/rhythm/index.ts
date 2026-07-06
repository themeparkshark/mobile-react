/**
 * Rhythm Tap — public surface.
 *
 * Usage (from MiniGameSelector or a LinePlay playlist):
 *   import { RhythmTapGame } from '../games/rhythm';
 *   <RhythmTapGame visible difficulty={2} onComplete={...} onClose={...} />
 */

export { RhythmTapGame, default } from './RhythmTapGame';
export type { RhythmTapGameProps } from './RhythmTapGame';
export { buildRound, makeSeed, maxScoreFor } from './patterns';
export type { RoundPlan, Target } from './patterns';
export type { Judgment } from './constants';
