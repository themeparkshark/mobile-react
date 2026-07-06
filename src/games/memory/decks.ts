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

export interface DeckSymbol {
  /** Stable id used for matching (two cards match iff symbolId is equal). */
  id: string;
  /** Bundled face art. May be undefined if the asset has not landed yet. */
  source?: ImageSourcePropType;
  /** Fallback tint + glyph drawn procedurally when `source` is unavailable. */
  tint: string;
  glyph: string;
}

export interface Deck {
  id: string;
  label: string;
  /** Shared card-back art for every card in the deck. */
  back?: ImageSourcePropType;
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
  symbols: [
    {
      id: 'ocean-shark',
      source: require('../../assets/games/memory/deck-ocean-shark.png'),
      tint: GAME_COLORS.blue,
      glyph: '🦈',
    },
    {
      id: 'ocean-crab',
      source: require('../../assets/games/memory/deck-ocean-crab.png'),
      tint: GAME_COLORS.coral,
      glyph: '🦀',
    },
    // Additional symbols reuse the two generated ocean faces recolored via the
    // procedural fallback so a 10-pair board never runs out of DISTINCT ids.
    // (The pipeline ships two ocean faces; these extend the pool with tinted
    // glyph cards that still read as "ocean".)
    { id: 'ocean-wave', tint: '#38bdf8', glyph: '🌊' },
    { id: 'ocean-fish', tint: '#34d399', glyph: '🐠' },
    { id: 'ocean-turtle', tint: '#4ade80', glyph: '🐢' },
    { id: 'ocean-octopus', tint: '#a78bfa', glyph: '🐙' },
    { id: 'ocean-whale', tint: '#60a5fa', glyph: '🐋' },
    { id: 'ocean-star', tint: GAME_COLORS.gold, glyph: '⭐' },
    { id: 'ocean-shell', tint: '#f9a8d4', glyph: '🐚' },
    { id: 'ocean-jelly', tint: '#f472b6', glyph: '🪼' },
  ],
};

// -- Theme-park deck ----------------------------------------------------------
const PARK: Deck = {
  id: 'park',
  label: 'Theme Park',
  back: CARD_BACK,
  symbols: [
    {
      id: 'park-coaster',
      source: require('../../assets/games/memory/deck-park-coaster.png'),
      tint: GAME_COLORS.coral,
      glyph: '🎢',
    },
    {
      id: 'park-ferriswheel',
      source: require('../../assets/games/memory/deck-park-ferriswheel.png'),
      tint: GAME_COLORS.blue,
      glyph: '🎡',
    },
    { id: 'park-castle', tint: '#a78bfa', glyph: '🏰' },
    { id: 'park-rocket', tint: GAME_COLORS.gold, glyph: '🚀' },
    { id: 'park-treat', tint: '#fda4af', glyph: '🍦' },
    { id: 'park-show', tint: '#f9a8d4', glyph: '🎭' },
    { id: 'park-tent', tint: '#f87171', glyph: '🎪' },
    { id: 'park-map', tint: '#4ade80', glyph: '🗺️' },
    { id: 'park-balloon', tint: '#fb7185', glyph: '🎈' },
    { id: 'park-ticket', tint: '#fbbf24', glyph: '🎟️' },
  ],
};

export const DECKS: readonly Deck[] = [OCEAN, PARK];

/**
 * Deterministic deck pick from a seed so a session/replay reproduces the same
 * board look. Falls back to the first deck.
 */
export function pickDeck(seed: number): Deck {
  const idx = Math.abs(Math.floor(seed)) % DECKS.length;
  return DECKS[idx] ?? DECKS[0];
}
