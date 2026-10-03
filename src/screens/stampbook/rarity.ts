/**
 * Stamp rarity, from the app's ONE rarity palette: `colors.rarity` in
 * design-system.ts, the same ladder the shop and wardrobe use
 * (wearableRarityUi): Common green, Uncommon blue, Rare purple, Epic orange,
 * Legendary gold. Common wearables are white on Inventory cards only; every
 * other surface (finds, stamps, ride parts) keeps green Common.
 * Chips and lips are derived tints, so changing the palette in one place
 * changes the Stamp Book too. Gold is Legendary only.
 */
import { colors } from '../../design-system';
import type { Rarity } from './model';

export interface StampRarityLook {
  readonly label: string;
  /** Frame, ring and gems: the palette colour itself. */
  readonly frame: string;
  /** Light chip behind navy text (frame mixed 82% toward white). */
  readonly chip: string;
  /** Darker lip under an earned tile (frame mixed 28% toward navy). */
  readonly lip: string;
  /** Gem count: the shape cue that works without colour. */
  readonly gems: number;
}

export const RARITY_INK = '#05346e';

function mix(hex: string, toward: string, t: number): string {
  const a = hex.replace('#', ''); const b = toward.replace('#', '');
  const c = [0, 2, 4].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

const LABEL: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const STAMP_RARITY: Readonly<Record<Rarity, StampRarityLook>> = Object.fromEntries(ORDER.map((key, i) => {
  const frame = colors.rarity[key].main;
  return [key, { label: LABEL[key], frame, chip: mix(frame, '#ffffff', 0.82), lip: mix(frame, '#05346e', 0.28), gems: i + 1 }];
})) as Record<Rarity, StampRarityLook>;

export function stampRarity(rarity: Rarity | string | null | undefined): StampRarityLook {
  return STAMP_RARITY[(rarity ?? 'common') as Rarity] ?? STAMP_RARITY.common;
}
