/**
 * Sharky Swim — native Skia rebuild of the WebView flappy shark.
 *
 * Self-contained per the Component 3 contract: exports the game component,
 * consumes GameShellV2, takes a difficulty (1-3), runs 60-120s rounds, keeps a
 * personal best in AsyncStorage, and reports {score, maxCombo, seed} via the
 * shell's onComplete multiplier contract.
 *
 * Integration (Wave 3) swaps this in for src/components/SharkMiniGame.tsx.
 */

export { SharkySwim, default } from './SharkySwim';
export type { SharkySwimProps } from './SharkySwim';
export type { Difficulty } from './constants';
