/**
 * A server pin drawn as a real enamel pin: a soft die-cut shadow, a resting
 * gloss on the upper face, and a moving shine. Every layer is a tinted copy of
 * the pin's own art, so shadow and shine follow the die-cut edge of any shape
 * (castle, honey pot, racecar) instead of a circle or a box. The art itself is
 * never redrawn or restyled.
 *
 * The shine is driven by one shared 0..1 value per screen (`shine`), offset per
 * pin with `lag`, so a whole board sweeps like a wave from a single animation.
 */
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

const GLOSS_ANGLE = 28;

type Props = {
  readonly uri: string;
  readonly size: number;
  /** Degrees. The pin is pinned a little crooked, like a real board. */
  readonly tilt?: number;
  /** 0..1 sweep progress. Omit for a still pin (reduced motion). */
  readonly shine?: SharedValue<number>;
  /** Offset of this pin's sweep in the shared progress (0..0.5). */
  readonly lag?: number;
  /** Shadow depth 0..1: 0 sits flat, 1 is lifted off the board. */
  readonly lift?: SharedValue<number>;
  readonly recyclingKey?: string;
  readonly style?: StyleProp<ViewStyle>;
};

/** One tinted copy of the art, shown through a diagonal window of the face. */
function GlossBand({ uri, size, top, height, opacity, shine, lag = 0, travel = 0 }: {
  uri: string; size: number; top: number; height: number; opacity: number;
  shine?: SharedValue<number>; lag?: number; travel?: number;
}) {
  const D = size * 2;
  const move = useAnimatedStyle(() => {
    if (!shine) return { transform: [{ translateY: 0 }], opacity };
    const p = shine.value * 1.4 - lag;
    const on = p > 0 && p < 1;
    return { transform: [{ translateY: on ? p * travel : -D }], opacity: on ? opacity * Math.sin(p * Math.PI) : 0 };
  });
  const counter = useAnimatedStyle(() => {
    if (!shine) return { transform: [{ translateY: 0 }] };
    const p = shine.value * 1.4 - lag;
    const on = p > 0 && p < 1;
    return { transform: [{ translateY: on ? -p * travel : D }] };
  });
  return (
    <View pointerEvents="none" style={[styles.window, { width: D, height: D, left: -size / 2, top: -size / 2, transform: [{ rotate: `${GLOSS_ANGLE}deg` }] }]}>
      <Animated.View style={[styles.clip, { top, height, width: D }, move]}>
        <Animated.View style={[{ position: 'absolute', top: -top, left: 0, width: D, height: D }, counter]}>
          <Image source={uri} style={{ position: 'absolute', left: size / 2, top: size / 2, width: size, height: size, transform: [{ rotate: `${-GLOSS_ANGLE}deg` }] }}
            contentFit="contain" tintColor="#ffffff" cachePolicy="memory-disk" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function EnamelPin({ uri, size, tilt = 0, shine, lag = 0, lift, recyclingKey, style }: Props) {
  const shadow = useAnimatedStyle(() => {
    const l = lift ? lift.value : 0;
    return {
      opacity: 0.32 - l * 0.1,
      transform: [{ translateX: size * (0.025 + l * 0.03) }, { translateY: size * (0.045 + l * 0.07) }, { scale: 1 + l * 0.03 }],
    };
  });
  const D = size * 2;
  return (
    <View style={[{ width: size, height: size, transform: [{ rotate: `${tilt}deg` }] }, style]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, shadow]}>
        <Image source={uri} style={StyleSheet.absoluteFill} contentFit="contain" tintColor="#05346e" blurRadius={3}
          cachePolicy="memory-disk" recyclingKey={recyclingKey ? `${recyclingKey}-s` : undefined} />
      </Animated.View>
      <Image source={uri} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk"
        recyclingKey={recyclingKey} transition={120} />
      {/* Resting gloss: the upper-left face catches the light, cut along a diagonal. */}
      <GlossBand uri={uri} size={size} top={0} height={D * 0.43} opacity={0.2} />
      {shine && <GlossBand uri={uri} size={size} top={D * 0.18} height={size * 0.16} opacity={0.75} shine={shine} lag={lag} travel={D * 0.62} />}
      {shine && <GlossBand uri={uri} size={size} top={D * 0.1} height={size * 0.07} opacity={0.55} shine={shine} lag={lag + 0.06} travel={D * 0.62} />}
    </View>
  );
}

export default memo(EnamelPin);

const styles = StyleSheet.create({
  window: { position: 'absolute', overflow: 'hidden' },
  clip: { position: 'absolute', left: 0, overflow: 'hidden' },
});
