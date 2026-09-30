/**
 * Sharky Swim "Tide Run" (design: tps-prime-time-audit/studio/design/sharky.md).
 * One-thumb, walk-safe underwater runner on the studio engine; deterministic
 * integer sim shared with the server verifier (proof kind 'swim').
 */

export { SharkySwim, default } from './SharkySwim';
export type { SharkySwimProps, SharkyMode, Difficulty } from './SharkySwim';

export const SHARKY_META = { movementPolicy: 'playThrough', proofKind: 'swim' } as const;
