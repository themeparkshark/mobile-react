import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { coinTier } from '../../constants/coinTiers';

/**
 * The stand under a Level 6+ coin and the crown on a Level 10 coin
 * (progression.md 9.1, 9.2). Code-drawn from the tier tokens, so no per-tier
 * art: a white wave plinth (Sapphire), foam bubbles (Tidal), a gold trim
 * (Starlight), a pennant in the land colour (Royal) and a gold dais (Shark
 * Crown). The crown is the approved art-pilot crown-v2.
 *
 * Bottom to top: stand, contact shadow, rim, coin art, crown. Render the stand
 * under the coin and the crown over it (`layer`).
 */
const crownArt = require('../../../assets/images/progression/crown.png');

export interface CoinStandProps {
  readonly level: number;
  /** Coin diameter in pt. */
  readonly size: number;
  readonly layer: 'stand' | 'crown';
  /** Royal pennant colour (the ride's land); navy by default. */
  readonly pennantColor?: string;
}

function CoinStand({ level, size, layer, pennantColor = '#1f5fbf' }: CoinStandProps) {
  const tier = coinTier(level);
  if (layer === 'crown') {
    if (!tier.crown) return null;
    const width = size * 0.62;
    return (
      <Image source={crownArt} contentFit="contain" accessibilityIgnoresInvertColors
        style={{ position: 'absolute', width, height: width * 0.95, top: -width * 0.62, alignSelf: 'center' }} />
    );
  }
  if (tier.stand === 'none') return null;
  const width = size * (tier.stand === 'crown_dais' ? 1.05 : 0.9);
  const height = size * 0.2;
  const gold = tier.stand === 'gold_trim' || tier.stand === 'pennant' || tier.stand === 'crown_dais';
  return (
    <View pointerEvents="none" style={[styles.wrap, { width, height: height * 1.6, bottom: -height * 0.9 }]}>
      {tier.stand === 'pennant' && (
        <View style={[styles.pennantPole, { height: size * 0.55, left: width * 0.08, bottom: height * 0.9 }]}>
          <View style={[styles.pennant, { borderLeftColor: pennantColor, borderTopWidth: size * 0.09, borderBottomWidth: size * 0.09,
            borderLeftWidth: size * 0.2 }]} />
        </View>
      )}
      <View style={[styles.top, { width, height, borderRadius: height / 2,
        backgroundColor: tier.stand === 'crown_dais' ? '#ffcf3b' : '#ffffff',
        borderColor: gold ? '#d99a00' : tier.ring, borderWidth: Math.max(2, size * 0.035) }]}>
        {/* Wave scallops on the plinth top. */}
        {(tier.stand === 'wave' || tier.stand === 'wave_foam') && [0.2, 0.5, 0.8].map(x => (
          <View key={x} style={[styles.scallop, { left: width * x - size * 0.07, width: size * 0.14, height: size * 0.07,
            borderColor: tier.ringDeep }]} />
        ))}
      </View>
      <View style={[styles.base, { width: width * 0.8, height: height * 0.7, borderBottomLeftRadius: height / 2,
        borderBottomRightRadius: height / 2, backgroundColor: tier.stand === 'crown_dais' ? '#d99a00' : tier.ringDeep }]} />
      {tier.stand === 'wave_foam' && [0.12, 0.86, 0.95].map((x, i) => (
        <View key={x} style={[styles.bubble, { left: width * x, top: -size * (0.05 + i * 0.06), width: size * (0.07 - i * 0.015),
          height: size * (0.07 - i * 0.015) }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignSelf: 'center', alignItems: 'center' },
  top: { zIndex: 2, overflow: 'hidden' },
  base: { marginTop: -2 },
  scallop: { position: 'absolute', top: 1, borderBottomWidth: 2, borderLeftWidth: 0, borderRightWidth: 0, borderRadius: 20 },
  bubble: { position: 'absolute', borderRadius: 20, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#5fd0ff' },
  pennantPole: { position: 'absolute', width: 3, backgroundColor: '#d99a00', borderRadius: 2 },
  pennant: { position: 'absolute', top: 0, left: 3, width: 0, height: 0, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
});

export default memo(CoinStand);
