/**
 * faces.ts: engine face ids -> card art (Alex-style authored face sheets, plus
 * the Golden Coin on Alex's coin and the pipeline seagull).
 */
import type { ImageSourcePropType } from 'react-native';
import type { CardFace } from './MemoryCard';
import type { Deck } from './decks';
import { FACE_GOLD, FACE_GULL } from './engine';

export const COIN_ART: ImageSourcePropType = require('../../assets/games/memory/studio/coin_alex.png');
export const GULL_ART: ImageSourcePropType = require('../../assets/games/memory/studio/seagull.png');

export function faceFor(deck: Deck, face: number): CardFace {
  if (face === FACE_GOLD) return { art: COIN_ART, plate: '#ffd54a' };
  if (face === FACE_GULL) return { art: GULL_ART, plate: '#bfe5ff' };
  const sym = deck.symbols[face];
  if (!sym) return {};
  if (sym.extraSheetSlot != null) return { sheet: deck.extraFaceSheet, slot: sym.extraSheetSlot, cols: 2, rows: 1 };
  return { sheet: deck.faceSheet, slot: sym.sheetSlot ?? 0, cols: 4, rows: 2 };
}

/** Readable face name for accessibility (never shown as an emoji). */
export function faceName(deck: Deck, face: number): string {
  if (face === FACE_GOLD) return 'golden coin';
  if (face === FACE_GULL) return 'seagull';
  return deck.symbols[face]?.id.split('-').slice(1).join(' ') ?? 'card';
}
