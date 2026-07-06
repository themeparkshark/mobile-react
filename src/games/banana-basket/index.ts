/**
 * Banana Basket — native Skia rebuild (Queue Kit, Component 3 game #2).
 *
 * Public surface for MiniGameSelector / LinePlay wiring (Wave 3):
 *   import { BananaBasketGame } from '../games/banana-basket';
 *
 * Self-contained: consumes GameKit primitives only, reports {score, maxCombo,
 * seed} to the shell for server-authoritative rewards, zero network, runs in
 * airplane mode.
 */

export { BananaBasketGame, default } from './BananaBasketGame';
export type { BananaBasketGameProps } from './BananaBasketGame';
