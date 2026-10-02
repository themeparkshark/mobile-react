/**
 * Banana Basket v2 (design rev 4): public surface for MiniGameSelector,
 * LinePlay and the dev lab.
 *
 *   import { BananaBasketGame } from '../games/banana-basket';
 *
 * The result meta carries a replayable proof (proof.ts); rewards stay
 * server-side.
 */

export { BananaBasketGame, default } from './BananaBasketGame';
export type { BananaBasketGameProps, BananaGhostInput } from './BananaBasketGame';
export { buildProof, verifyProof, encodeInput, decodeInput } from './proof';
export type { BananaProof } from './proof';
