/**
 * <GoldCheck>: the app's "done" mark in gold and white (never a green check), code-drawn.
 *
 *   <GoldCheck size={28} />
 *
 * A gold disc with a navy rim and a white check stroke (two rounded bars), the same family as every
 * win in the app. Plain views, no art, no SVG, so it is safe anywhere (inside animated views too).
 */
import { memo } from 'react';
import { View } from 'react-native';
import { BRAND } from './tokens';

function GoldCheck({ size = 28 }: { readonly size?: number }) {
  const bar = Math.max(3, Math.round(size * 0.14));
  const short = size * 0.28;
  const long = size * 0.52;
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: BRAND.gold,
      borderWidth: Math.max(1.5, size * 0.07), borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: long, height: long * 0.62, transform: [{ translateY: -size * 0.04 }, { rotate: '-45deg' }] }}>
        <View style={{ position: 'absolute', left: 0, bottom: 0, width: bar, height: short * 1.1, borderRadius: bar / 2, backgroundColor: BRAND.white }} />
        <View style={{ position: 'absolute', left: 0, bottom: 0, width: long, height: bar, borderRadius: bar / 2, backgroundColor: BRAND.white }} />
      </View>
    </View>
  );
}

export default memo(GoldCheck);
