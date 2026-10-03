/** Share Studio public API (share-studio/CONTRACT.md). */
import * as Updates from 'expo-updates';
import { shareInModalsFor } from './modalGate';
export { flexReveal, shareFlex } from './store';
export { FlexShareButton, ShareGlyph } from './FlexShareButton';
export { ShareStudioHost } from './ShareStudioHost';
export { FlexCard, FLEX_SIZE, FLEX_EXPORT } from './FlexCard';
export { flexCopy, shouldFlexReveal, ownedLine, normalizeRarity } from './copy';
export { getFlexRarity } from '../api/endpoints/me/share';
export { FLEX_KINDS } from './types';
export type { FlexKind, FlexPayload, FlexPayloads, FlexFormat, FlexOptions, FlexArt } from './types';

/**
 * Share buttons that live inside a <Modal> (coin level-up, Crowning, Home Hunt podium) stay hidden
 * until the Share sheet is proven to open from a modal and can't wedge the queue (panel r2-fasttrack, blocker 2).
 * On for the internal TestFlight channel (real-finger tap testing) and opt-in dev builds; off on
 * 'production' and every other channel. Flipping production on is a change to shareInModalsFor.
 */
export const SHARE_IN_MODALS: boolean = shareInModalsFor(__DEV__, process.env.EXPO_PUBLIC_SHARE_IN_MODALS, Updates.channel);
