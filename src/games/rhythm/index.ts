/**
 * Parade Beat (Rhythm Tap rework): public surface.
 *
 *   import { RhythmTapGame } from '../games/rhythm';
 *   <RhythmTapGame visible seed={seed} difficulty={2} format="queue" onComplete={...} onClose={...} />
 *
 * Code id stays `rhythm`; the game key stays `timing` (LinePlay,
 * MiniGameSelector, TaskGameProofService). Only the display title changed.
 */

export { RhythmTapGame, default } from './RhythmTapGame';
export type { RhythmTapGameProps } from './RhythmTapGame';
export { generate } from './core/generate';
export { replayProof, buildProof } from './core/proof';
export type { RhythmProofV6 } from './core/proof';
export type { Chart, Difficulty, RoundFormat } from './core/types';
