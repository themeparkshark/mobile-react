/**
 * How a pin looks everywhere on the Pins page (and the lanyard):
 * - owned: Alex's art as a real enamel pin (EnamelPin: light and shadow only),
 * - missing: the same silhouette in soft navy with a "?" (the empty slot sells
 *   the set), so a kid sees exactly what's left,
 * - one corner badge, read without words: the gold "earned at the park" seal
 *   (never tradable) or the blue swap badge (can trade), a gold star on the
 *   chaser, and a "x2" chip for spare copies.
 */
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { BRAND, FONT } from '../../ui';
import EnamelPin from '../pinTrading/EnamelPin';
import { badgeFor, type PinKind } from './pinsModel';

export const PIN_ART = {
  seal: require('../../../assets/images/pins/seal-in-person.webp'),
  trade: require('../../../assets/images/pins/badge-trade.webp'),
  chaser: require('../../../assets/images/pins/badge-chaser.webp'),
  lock: require('../../../assets/images/pins/badge-lock.webp'),
} as const;

export const BOX_ART = {
  blue: {
    closed: require('../../../assets/images/pins/box-blue-closed.webp'),
    lid: require('../../../assets/images/pins/box-blue-lid.webp'),
    base: require('../../../assets/images/pins/box-blue-base.webp'),
  },
  coral: {
    closed: require('../../../assets/images/pins/box-coral-closed.webp'),
    lid: require('../../../assets/images/pins/box-coral-lid.webp'),
    base: require('../../../assets/images/pins/box-coral-base.webp'),
  },
} as const;

export type BoxTone = keyof typeof BOX_ART;

/** The box colour for a series (its theme colour picks blue or coral). */
export function boxTone(themeColor: string | null | undefined): BoxTone {
  const hex = (themeColor ?? '').replace('#', '');
  if (hex.length !== 6) return 'blue';
  const r = parseInt(hex.slice(0, 2), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r > b ? 'coral' : 'blue';
}

export { badgeFor, type BadgeKind } from './pinsModel';

type Props = {
  readonly uri: string | null;
  readonly size: number;
  readonly owned: boolean;
  readonly kind: PinKind;
  readonly tradable: boolean;
  readonly chaser?: boolean;
  readonly spares?: number;
  readonly tilt?: number;
  /** Hide the corner badge (the shelf already says it, or the tile is tiny). */
  readonly badge?: boolean;
  readonly shine?: SharedValue<number>;
  readonly lag?: number;
  readonly lagSpan?: number;
  readonly surface?: 'board' | 'panel' | 'none';
  readonly style?: StyleProp<ViewStyle>;
  /** Chaser serial (#3), stamped on the tile. */
  readonly serial?: number | null;
  /** A plain image tile (grids): no lighting canvas, small art. */
  readonly flat?: boolean;
  /** Smaller corner badge (crowded strips like the lanyard). */
  readonly badgeScale?: number;
};

function PinTileBase({ uri, size, owned, kind, tradable, chaser, spares = 0, tilt = 0, badge = true, shine, lag, lagSpan, surface = 'panel', style, serial, flat, badgeScale = 1 }: Props) {
  const b = badgeFor(kind, tradable);
  const badgeSize = Math.max(16, Math.round(size * 0.34 * badgeScale));
  return (
    <View style={[{ width: size, height: size }, style]}>
      {uri && owned && (
        <EnamelPin uri={uri} size={size} tilt={tilt} shine={shine} lag={lag} lagSpan={lagSpan} surface={surface} flat={flat} />
      )}
      {uri && !owned && (
        // Missing: a soft ghost of the real pin (like the lineup printed on a mystery box), never a solid block.
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image source={uri} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${tilt}deg` }], opacity: 0.42 }]}
            contentFit="contain" tintColor={chaser ? '#c99a1e' : '#2a5c9a'} cachePolicy="memory-disk" transition={0} />
          <Image source={uri} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${tilt}deg` }], opacity: chaser ? 0.3 : 0.2 }]}
            contentFit="contain" cachePolicy="memory-disk" transition={0} />
          <View style={styles.qWrap}>
            <Text maxFontSizeMultiplier={1} style={[styles.q, { fontSize: Math.round(size * 0.34) }, chaser && { color: BRAND.goldLight }]}>?</Text>
          </View>
        </View>
      )}
      {badge && owned && b !== 'none' && (
        <Image source={b === 'seal' ? PIN_ART.seal : PIN_ART.trade}
          style={[styles.badge, { width: badgeSize, height: badgeSize, right: -badgeSize * 0.18, bottom: -badgeSize * 0.12 }]}
          contentFit="contain" accessibilityIgnoresInvertColors />
      )}
      {chaser && !(serial && owned) && (
        <Image source={PIN_ART.chaser}
          style={[styles.badge, { width: badgeSize * 0.92, height: badgeSize * 0.92, left: -badgeSize * 0.2, top: -badgeSize * 0.18 }]}
          contentFit="contain" />
      )}
      {!!serial && owned && (
        <View style={[styles.serial, { right: -6, top: -6 }]} accessible accessibilityLabel={`Number ${serial}`}>
          <Text maxFontSizeMultiplier={1} style={styles.serialText}>#{serial}</Text>
        </View>
      )}
      {spares > 0 && owned && (
        <View style={[styles.spares, { left: -4, bottom: -4 }]}>
          <Text maxFontSizeMultiplier={1} style={styles.sparesText}>x{spares + 1}</Text>
        </View>
      )}
    </View>
  );
}

export const PinTile = memo(PinTileBase);

const styles = StyleSheet.create({
  qWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  q: { fontFamily: FONT.display, color: '#7cc6f5', textShadowColor: BRAND.navy, textShadowRadius: 0, textShadowOffset: { width: 0, height: 2 } },
  badge: { position: 'absolute' },
  spares: {
    position: 'absolute', minWidth: 26, height: 22, paddingHorizontal: 5, borderRadius: 11,
    backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center',
  },
  serial: {
    position: 'absolute', minWidth: 28, height: 22, paddingHorizontal: 5, borderRadius: 6,
    backgroundColor: '#3b2a05', borderWidth: 2, borderColor: BRAND.gold, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '6deg' }],
  },
  serialText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.gold, paddingTop: 2 },
  sparesText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.navy, paddingTop: 2 },
});
