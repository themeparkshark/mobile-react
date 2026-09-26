/**
 * decks.ts — themed card decks for Memory Match+.
 *
 * Each deck is a themed set of face images plus a shared card back. Faces are
 * bundled PNGs from the Queue Kit asset pipeline (tools/assets, --only memory),
 * loaded on-device via Skia's useImage so the same SkImage can be drawn on a
 * Skia canvas or handed to React Native <Image>.
 *
 * A round picks ONE deck (see pickDeck) and uses the first N faces as the pair
 * symbols. Decks list more faces than the biggest board needs so we always have
 * enough distinct symbols (4x5 board = 10 pairs).
 *
 * Metro requires literal require() paths — they are centralized here so the
 * game file stays art-agnostic. Every face falls back to a procedural tint
 * (see FACE_TINTS) if its image fails to decode, so the game runs even before
 * every asset lands (offline-first / asset-pipeline-in-flight tolerance).
 */

import type { ImageSourcePropType } from 'react-native';
import { GAME_COLORS } from '../../gamekit';
export { deckIdForRideName } from '../../services/rideTheme';

export interface DeckSymbol {
  /** Stable id used for matching (two cards match iff symbolId is equal). */
  id: string;
  /** Bundled face art. May be undefined if the asset has not landed yet. */
  source?: ImageSourcePropType;
  /** Fallback tint + glyph drawn procedurally when `source` is unavailable. */
  tint: string;
  glyph: string;
  /** Cell in the deck's 4-column illustrated face sheet. */
  sheetSlot?: number;
  /** Cell in the deck's 2-column extra-face sheet. */
  extraSheetSlot?: number;
}

export interface Deck {
  id: string;
  label: string;
  /** Shared card-back art for every card in the deck. */
  back?: ImageSourcePropType;
  /** Optional illustrated front frame for procedural symbols. */
  faceFrame?: ImageSourcePropType;
  faceSheet?: ImageSourcePropType;
  extraFaceSheet?: ImageSourcePropType;
  symbols: DeckSymbol[];
}

// -- Shared card back ---------------------------------------------------------
// One require, reused across decks. Wrapped so a missing asset degrades to the
// procedural back rather than breaking the bundle at author time.
const CARD_BACK: ImageSourcePropType | undefined = require('../../assets/games/memory/card-back.png');

// -- Ocean deck ---------------------------------------------------------------
const OCEAN: Deck = {
  id: 'ocean',
  label: 'Ocean',
  back: CARD_BACK,
  faceSheet: require('../../assets/games/memory/ocean-faces-v1.png'),
  extraFaceSheet: require('../../assets/games/memory/ocean-extra-faces-v1.png'),
  symbols: [
    {
      id: 'ocean-shark',
      source: require('../../assets/games/memory/deck-ocean-shark.png'),
      tint: GAME_COLORS.blue,
      glyph: '🦈',
      sheetSlot: 0,
    },
    {
      id: 'ocean-crab',
      source: require('../../assets/games/memory/deck-ocean-crab.png'),
      tint: GAME_COLORS.coral,
      glyph: '🦀',
      sheetSlot: 1,
    },
    { id: 'ocean-wave', tint: '#38bdf8', glyph: '🌊', sheetSlot: 2 },
    { id: 'ocean-fish', tint: '#34d399', glyph: '🐠', sheetSlot: 3 },
    { id: 'ocean-turtle', tint: '#4ade80', glyph: '🐢', sheetSlot: 4 },
    { id: 'ocean-octopus', tint: '#a78bfa', glyph: '🐙', sheetSlot: 5 },
    { id: 'ocean-whale', tint: '#60a5fa', glyph: '🐋', sheetSlot: 6 },
    { id: 'ocean-star', tint: GAME_COLORS.gold, glyph: '⭐', sheetSlot: 7 },
    { id: 'ocean-shell', tint: '#f9a8d4', glyph: '🐚', extraSheetSlot: 0 },
    { id: 'ocean-jelly', tint: '#f472b6', glyph: '🪼', extraSheetSlot: 1 },
  ],
};

// -- Theme-park deck ----------------------------------------------------------
const PARK: Deck = {
  id: 'park',
  label: 'Theme Park',
  back: CARD_BACK,
  faceSheet: require('../../assets/games/memory/park-ride-faces-v1.png'),
  extraFaceSheet: require('../../assets/games/memory/park-ride-extra-faces-v1.png'),
  symbols: [
    {
      id: 'park-coaster',
      source: require('../../assets/games/memory/deck-park-coaster.png'),
      tint: GAME_COLORS.coral,
      glyph: '🎢',
      sheetSlot: 0,
    },
    {
      id: 'park-ferriswheel',
      source: require('../../assets/games/memory/deck-park-ferriswheel.png'),
      tint: GAME_COLORS.blue,
      glyph: '🎡',
      sheetSlot: 1,
    },
    { id: 'park-castle', tint: '#a78bfa', glyph: '🏰', sheetSlot: 2 },
    { id: 'park-rocket', tint: GAME_COLORS.gold, glyph: '🚀', sheetSlot: 3 },
    { id: 'park-carousel', tint: '#fda4af', glyph: '🎠', sheetSlot: 4 },
    { id: 'park-show', tint: '#f9a8d4', glyph: '🎭', sheetSlot: 5 },
    { id: 'park-tent', tint: '#f87171', glyph: '🎪', sheetSlot: 6 },
    { id: 'park-map', tint: '#4ade80', glyph: '🗺️', sheetSlot: 7 },
    { id: 'park-waterflume', tint: '#38bdf8', glyph: '🌊', extraSheetSlot: 0 },
    { id: 'park-swingride', tint: '#fbbf24', glyph: '🎡', extraSheetSlot: 1 },
  ],
};

// Original shark-space symbols shared by the two distinct Space Mountain missions.
const SPACE: Deck = {
  id: 'space',
  label: 'Star Chart',
  back: CARD_BACK,
  faceSheet: require('../../assets/games/memory/star-chart-faces-v1.png'),
  extraFaceSheet: require('../../assets/games/memory/star-chart-extra-faces-v1.png'),
  symbols: [
    { id: 'space-star', tint: '#fbbf24', glyph: '⭐', sheetSlot: 0 },
    { id: 'space-moon', tint: '#c4b5fd', glyph: '🌙', sheetSlot: 1 },
    { id: 'space-planet', tint: '#60a5fa', glyph: '🪐', sheetSlot: 2 },
    { id: 'space-comet', tint: '#fb7185', glyph: '☄️', sheetSlot: 3 },
    { id: 'space-rocket', tint: '#f97316', glyph: '🚀', sheetSlot: 4 },
    { id: 'space-satellite', tint: '#93c5fd', glyph: '🛰️', sheetSlot: 5 },
    { id: 'space-astronaut', tint: '#e5e7eb', glyph: '👩‍🚀', sheetSlot: 6 },
    { id: 'space-meteor', tint: '#a78bfa', glyph: '🌠', sheetSlot: 7 },
    { id: 'space-galaxy', tint: '#818cf8', glyph: '🌌', extraSheetSlot: 0 },
    { id: 'space-earth', tint: '#34d399', glyph: '🌍', extraSheetSlot: 1 },
  ],
};

const LAUNCH_CODE: Deck = { ...SPACE, id: 'launch-code', label: 'Launch Code' };

// Original nautical symbols for the Disneyland Pirates queue chapter.
const PIRATES: Deck = {
  id: 'pirates',
  label: 'Vanishing Compass',
  back: CARD_BACK,
  faceSheet: require('../../assets/games/memory/pirates-faces-v1.png'),
  extraFaceSheet: require('../../assets/games/memory/pirates-extra-faces-v1.png'),
  symbols: [
    { id: 'pirates-compass', tint: '#fbbf24', glyph: '🧭', sheetSlot: 0 },
    { id: 'pirates-map', tint: '#d6b88a', glyph: '🗺️', sheetSlot: 1 },
    { id: 'pirates-anchor', tint: '#94a3b8', glyph: '⚓', sheetSlot: 2 },
    { id: 'pirates-sail', tint: '#e2e8f0', glyph: '⛵', sheetSlot: 3 },
    { id: 'pirates-key', tint: '#f6ad55', glyph: '🗝️', sheetSlot: 4 },
    { id: 'pirates-wave', tint: '#38bdf8', glyph: '🌊', sheetSlot: 5 },
    { id: 'pirates-crab', tint: '#fb7185', glyph: '🦀', sheetSlot: 6 },
    { id: 'pirates-lantern', tint: '#fde68a', glyph: '🏮', sheetSlot: 7 },
    { id: 'pirates-shell', tint: '#f9a8d4', glyph: '🐚', extraSheetSlot: 0 },
    { id: 'pirates-shark', tint: '#60a5fa', glyph: '🦈', extraSheetSlot: 1 },
  ],
};

// Original shark river-adventure symbols for Disneyland's Jungle Cruise chapter.
const JUNGLE: Deck = {
  id: 'jungle',
  label: 'Skipper’s Log',
  back: CARD_BACK,
  faceSheet: require('../../assets/games/memory/jungle-faces-v1.png'),
  extraFaceSheet: require('../../assets/games/memory/jungle-extra-faces-v1.png'),
  symbols: [
    { id: 'jungle-log', tint: '#b77b4b', glyph: '📔', sheetSlot: 0 },
    { id: 'jungle-boat', tint: '#fbbf24', glyph: '🚤', sheetSlot: 1 },
    { id: 'jungle-compass', tint: '#fbbf24', glyph: '🧭', sheetSlot: 2 },
    { id: 'jungle-gorilla', tint: '#8b6a52', glyph: '🦍', sheetSlot: 3 },
    { id: 'jungle-elephant', tint: '#94a3b8', glyph: '🐘', sheetSlot: 4 },
    { id: 'jungle-falls', tint: '#38bdf8', glyph: '🌊', sheetSlot: 5 },
    { id: 'jungle-leaf', tint: '#4ade80', glyph: '🌿', sheetSlot: 6 },
    { id: 'jungle-shark', tint: '#60a5fa', glyph: '🦈', sheetSlot: 7 },
    { id: 'jungle-hippo', tint: '#a78bfa', glyph: '🦛', extraSheetSlot: 0 },
    { id: 'jungle-tiger', tint: '#fb923c', glyph: '🐅', extraSheetSlot: 1 },
  ],
};

// Original mining symbols for Disneyland Big Thunder's shark dispatch mystery.
const RAINBOW_RIDGE: Deck = {
  id: 'rainbow-ridge',
  label: 'Rainbow Ridge Dispatch',
  back: CARD_BACK,
  faceSheet: require('../../assets/games/memory/rainbow-ridge-faces-v1.png'),
  extraFaceSheet: require('../../assets/games/memory/rainbow-ridge-extra-faces-v1.png'),
  symbols: [
    { id: 'ridge-dispatch', tint: '#dfac65', glyph: '📜', sheetSlot: 0 },
    { id: 'ridge-train', tint: '#c27743', glyph: '🚂', sheetSlot: 1 },
    { id: 'ridge-lantern', tint: '#fbbf24', glyph: '🏮', sheetSlot: 2 },
    { id: 'ridge-tools', tint: '#94a3b8', glyph: '⛏️', sheetSlot: 3 },
    { id: 'ridge-gold', tint: '#facc15', glyph: '🪙', sheetSlot: 4 },
    { id: 'ridge-canyon', tint: '#e98550', glyph: '🏜️', sheetSlot: 5 },
    { id: 'ridge-rails', tint: '#9d805c', glyph: '🛤️', sheetSlot: 6 },
    { id: 'ridge-shark', tint: '#60a5fa', glyph: '🦈', sheetSlot: 7 },
    { id: 'ridge-cart', tint: '#c48a5c', glyph: '🛒', extraSheetSlot: 0 },
    { id: 'ridge-compass', tint: '#fbbf24', glyph: '🧭', extraSheetSlot: 1 },
  ],
};

// Original shark-mansion symbols for the Magic Kingdom queue chapter.
const MANSION: Deck = {
  id: 'mansion',
  label: 'Missing Guest Book',
  back: CARD_BACK,
  faceFrame: require('../../assets/games/memory/deck-mansion-face-frame.png'),
  faceSheet: require('../../assets/games/memory/mansion-faces-v1.png'),
  extraFaceSheet: require('../../assets/games/memory/mansion-extra-faces-v1.png'),
  symbols: [
    { id: 'mansion-book', tint: '#a78bfa', glyph: '📖', sheetSlot: 0 },
    { id: 'mansion-key', tint: '#fbbf24', glyph: '🗝️', sheetSlot: 1 },
    { id: 'mansion-lantern', tint: '#f59e0b', glyph: '🏮', sheetSlot: 2 },
    { id: 'mansion-moon', tint: '#c4b5fd', glyph: '🌙', sheetSlot: 3 },
    { id: 'mansion-ghost', tint: '#e2e8f0', glyph: '👻', sheetSlot: 4 },
    { id: 'mansion-clock', tint: '#60a5fa', glyph: '🕰️', sheetSlot: 5 },
    { id: 'mansion-candle', tint: '#fde68a', glyph: '🕯️', sheetSlot: 6 },
    { id: 'mansion-bat', tint: '#818cf8', glyph: '🦇', sheetSlot: 7 },
    { id: 'mansion-hat', tint: '#fb7185', glyph: '🎩', extraSheetSlot: 0 },
    { id: 'mansion-shark', tint: '#38bdf8', glyph: '🦈', extraSheetSlot: 1 },
  ],
};

// Original movie-backlot symbols for the Universal Studios Hollywood tour.
const BACKLOT: Deck = {
  id: 'backlot',
  label: 'Missing Backlot Reel',
  back: CARD_BACK,
  faceFrame: require('../../assets/games/memory/deck-backlot-face-frame.png'),
  faceSheet: require('../../assets/games/memory/backlot-faces-v1.png'),
  extraFaceSheet: require('../../assets/games/memory/backlot-extra-faces-v1.png'),
  symbols: [
    { id: 'backlot-camera', tint: '#60a5fa', glyph: '📷', sheetSlot: 0 },
    { id: 'backlot-clapper', tint: '#fbbf24', glyph: '🎬', sheetSlot: 1 },
    { id: 'backlot-film', tint: '#c4b5fd', glyph: '🎞️', sheetSlot: 2 },
    { id: 'backlot-light', tint: '#fde68a', glyph: '💡', sheetSlot: 3 },
    { id: 'backlot-mic', tint: '#94a3b8', glyph: '🎙️', sheetSlot: 4 },
    { id: 'backlot-megaphone', tint: '#fb7185', glyph: '📣', sheetSlot: 5 },
    { id: 'backlot-shark', tint: '#38bdf8', glyph: '🦈', sheetSlot: 6 },
    { id: 'backlot-wave', tint: '#34d399', glyph: '🌊', sheetSlot: 7 },
    { id: 'backlot-star', tint: '#fbbf24', glyph: '⭐', extraSheetSlot: 0 },
    { id: 'backlot-ticket', tint: '#fdba74', glyph: '🎟️', extraSheetSlot: 1 },
  ],
};

export const DECKS: readonly Deck[] = [OCEAN, PARK, SPACE, PIRATES, MANSION, BACKLOT, JUNGLE, RAINBOW_RIDGE];

export function deckById(id?: string): Deck | null {
  if (id === LAUNCH_CODE.id) return LAUNCH_CODE;
  return id ? DECKS.find((deck) => deck.id === id) ?? null : null;
}

/**
 * Deterministic deck pick from a seed so a session/replay reproduces the same
 * board look. Falls back to the first deck.
 */
export function pickDeck(seed: number): Deck {
  const idx = Math.abs(Math.floor(seed)) % DECKS.length;
  return DECKS[idx] ?? DECKS[0];
}
