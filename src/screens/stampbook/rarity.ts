/**
 * App-wide rarity ramp for stamps. Mirrors RARITY_LOOK in
 * src/screens/SetCollection/dexLook.tsx on claude/hh3-menu-dex (the collection
 * book), so stamps, book, shop and finds read the same: Common slate,
 * Uncommon green, Rare purple (pending Dustin's final word), Epic flame
 * orange-red, Legendary gold with a shimmer. Gold is Legendary only.
 * When the book branch merges, import from there and delete this copy.
 */
import type { Rarity } from './model';

export interface StampRarityLook {
  readonly label: string;
  /** Frame, ring and gems. */
  readonly frame: string;
  /** Light chip behind navy text. */
  readonly chip: string;
  /** Darker lip under an earned tile. */
  readonly lip: string;
  /** Gem count: the shape cue that works without colour. */
  readonly gems: number;
}

export const RARITY_INK = '#05346e';

export const STAMP_RARITY: Readonly<Record<Rarity, StampRarityLook>> = {
  common: { label: 'Common', frame: '#8a9bb0', chip: '#e8edf3', lip: '#6b7a8d', gems: 1 },
  uncommon: { label: 'Uncommon', frame: '#2fb35d', chip: '#dcf6e5', lip: '#22864a', gems: 2 },
  rare: { label: 'Rare', frame: '#9b4dff', chip: '#eee2ff', lip: '#7434cc', gems: 3 },
  epic: { label: 'Epic', frame: '#ff5a2b', chip: '#ffe3d8', lip: '#c8401b', gems: 4 },
  legendary: { label: 'Legendary', frame: '#f5b400', chip: '#fff1c2', lip: '#b8860b', gems: 5 },
};

export function stampRarity(rarity: Rarity | string | null | undefined): StampRarityLook {
  return STAMP_RARITY[(rarity ?? 'common') as Rarity] ?? STAMP_RARITY.common;
}
