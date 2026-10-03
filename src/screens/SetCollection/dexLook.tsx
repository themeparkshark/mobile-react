/**
 * One look for the collection book, the How to Play book demo and the share
 * card: the rarity ramp (frame color, light chip, navy ink, 1 to 5 gems) and
 * the glossy sticker-slot tile panel in Alex's style (two-tone body, darker
 * lip, one gloss band).
 *
 * Ramp: the app-wide palette in src/design-system.ts colors.rarity (Common
 * green, Uncommon blue, Rare purple, Epic orange, Legendary gold), shared with
 * stamps, the shop and prep items. (The wardrobe keeps a white Common on
 * purpose, via wearableRarityUi.) The lone Common gem stays
 * readable by size and a thick white outline, not a different hue.
 * Ink on every chip is navy for 4.5:1 contrast; the frame color never
 * carries text.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../../design-system';
import { BRAND } from '../../ui';

export type RarityTier = 1 | 2 | 3 | 4 | 5;

export interface RarityLook {
  readonly key: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  readonly label: string;
  /** Tile frame, ring tick and gems. */
  readonly frame: string;
  /** Light chip behind navy text. */
  readonly chip: string;
  /** Text on the chip (navy, 4.5:1 or better on `chip`). */
  readonly ink: string;
}

/** A light tint of a #RRGGBB color (for chips that carry navy text). */
export function tint(hex: string, amount: number): string {
  const v = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[16, 8, 0].map(shift => mix((v >> shift) & 255).toString(16).padStart(2, '0')).join('')}`;
}

// The one app-wide rarity palette (stamps, shop, wardrobe, book): src/design-system.ts colors.rarity.
const R = colors.rarity;
export const RARITY_LOOK: Readonly<Record<RarityTier, RarityLook>> = {
  1: { key: 'common', label: 'Common', frame: R.common.main, chip: tint(R.common.main, 0.82), ink: BRAND.navy },
  2: { key: 'uncommon', label: 'Uncommon', frame: R.uncommon.main, chip: tint(R.uncommon.main, 0.82), ink: BRAND.navy },
  3: { key: 'rare', label: 'Rare', frame: R.rare.main, chip: tint(R.rare.main, 0.85), ink: BRAND.navy },
  4: { key: 'epic', label: 'Epic', frame: R.epic.main, chip: tint(R.epic.main, 0.82), ink: BRAND.navy },
  5: { key: 'legendary', label: 'Legendary', frame: R.legendary.main, chip: tint(R.legendary.main, 0.78), ink: BRAND.navy },
};

export function rarityLook(rarity: number): RarityLook {
  return RARITY_LOOK[(rarity >= 1 && rarity <= 5 ? Math.round(rarity) : 1) as RarityTier];
}

/**
 * 1 to 5 small diamond gems: the shape cue that works without color. Each
 * diamond sits in its own box (side * 1.45) so the rotated corners never clip,
 * with a white keyline and a light facet. One component for tiles, chips and
 * the share card.
 */
export function RarityGems({ rarity, size = 9, style }: { readonly rarity: number; readonly size?: number; readonly style?: StyleProp<ViewStyle> }) {
  const look = rarityLook(rarity);
  const count = Math.max(1, Math.min(5, Math.round(rarity)));
  // A lone Common gem reads as big as the rest (it has the room).
  const gem = count === 1 ? Math.round(size * 1.35) : size;
  const box = Math.ceil((gem + 4) * 1.45);
  return (
    <View style={[styles.gems, style]} accessible={false}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
          <View style={[styles.gemOutline, { width: gem + 4, height: gem + 4 }]}>
            <View style={[styles.gem, { width: gem, height: gem, backgroundColor: look.frame, transform: [] }, count === 1 && styles.gemCommon]}>
              <View style={styles.facet} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** The sticker-slot panel: rarity frame, two-tone body, darker lip, gloss band. */
export function TilePanel({ rarity, found, children, style }: {
  readonly rarity: number; readonly found: boolean; readonly children?: ReactNode; readonly style?: StyleProp<ViewStyle>;
}) {
  const look = rarityLook(rarity);
  return (
    <View style={[styles.panel, { borderColor: found ? look.frame : '#9fb4ca' }, style]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: found ? '#f4f9ff' : '#cfdcea' }]} />
      <View style={[styles.lower, { backgroundColor: found ? '#e3effb' : '#bfd0e2' }]} />
      <LinearGradient colors={['rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']} style={styles.gloss} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  gems: { flexDirection: 'row', gap: 1 },
  // A white keyline inside a 2 px navy outline: every gem reads on white tiles and on blue panels.
  gem: { transform: [{ rotate: '45deg' }], borderWidth: 1.5, borderColor: BRAND.white, borderRadius: 2, overflow: 'hidden' },
  gemOutline: { transform: [{ rotate: '45deg' }], borderWidth: 2, borderColor: BRAND.navy, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  gemCommon: { borderWidth: 2.5 },
  facet: { position: 'absolute', left: 0, top: 0, width: '50%', height: '50%', backgroundColor: 'rgba(255,255,255,0.55)' },
  panel: {
    borderRadius: 16, borderWidth: 3, borderBottomWidth: 6, overflow: 'hidden', alignItems: 'center',
  },
  lower: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%' },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '36%' },
});
