/**
 * Whack-a-Shark — native Skia rebuild of the legacy TapChallenge minigame.
 *
 * Self-contained per the Component 3 contract: exports the game component,
 * consumes GameShellV2, takes a difficulty (1-3), runs a 60s round, keeps a
 * personal best in AsyncStorage, and reports {score, maxCombo, seed} via the
 * shell's onComplete multiplier contract.
 *
 * Integration (Wave 3) swaps this in for the legacy TapChallengeMiniGame.
 */

export { WhackAShark, default } from './WhackAShark';
export type { WhackASharkProps } from './WhackAShark';
export type { Difficulty } from './constants';
