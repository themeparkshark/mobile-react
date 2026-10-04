/**
 * A server pin drawn as a real enamel pin: one soft drop shadow tinted to the
 * surface it sits on, a feathered resting gloss on the upper face, and a
 * moving shine band. Every layer is a tinted copy of the pin's own art, so
 * shadow and shine follow the die-cut edge of any shape (castle, honey pot,
 * racecar) instead of a circle or a box. The art itself is never redrawn.
 *
 * The shine is driven by one shared 0..1 value per screen (`shine`), offset
 * per pin with `lag`; `lagSpan` is the largest lag in the group, so every
 * band has fully left its pin by the time the shared value reaches 1.
 */
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

const GLOSS_ANGLE = 28;

/** Shadow tint per surface: warm on cork and cream, navy on the blue panels. */
const SHADOW_TINT = { board: '#4a2c0e', panel: '#021c40' } as const;

type Props = {
  readonly uri: string;
  readonly size: number;
  /** Degrees. The pin is pinned a little crooked, like a real board. */
  readonly tilt?: number;
  /** 0..1 sweep progress. Omit for a still pin (reduced motion, small tiles). */
  readonly shine?: SharedValue<number>;
  /** This pin's offset in the shared sweep (0..lagSpan). */
  readonly lag?: number;
  /** The largest lag in the group (so no band is left mid-pin at rest). */
  readonly lagSpan?: number;
  /** Shadow depth 0..1: 0 sits flat, 1 is lifted off the surface. */
  readonly lift?: SharedValue<number>;
  /** Surface under the pin, for the shadow tint. 'none' skips the shadow (small picker tiles). */
  readonly surface?: 'board' | 'panel' | 'none';
  /** Image fade-in. 0 for pins that take over from another view (no blink). */
  readonly transition?: number;
  readonly recyclingKey?: string;
  readonly style?: StyleProp<ViewStyle>;
};

/** One tinted copy of the art, shown through a diagonal window of the face. */
function GlossBand({ uri, size, top, height, opacity, shine, lag = 0, span = 0, travel = 0 }: {
  uri: string; size: number; top: number; height: number; opacity: number;
  shine?: SharedValue<number>; lag?: number; span?: number; travel?: number;
}) {
  const D = size * 2;
  const move = useAnimatedStyle(() => {
    if (!shine) return { transform: [{ translateY: 0 }], opacity };
    const p = shine.value * (1 + span) - lag;
    const on = p > 0 && p < 1;
    return { transform: [{ translateY: on ? p * travel : -D }], opacity: on ? opacity * Math.sin(p * Math.PI) : 0 };
  });
  const counter = useAnimatedStyle(() => {
    if (!shine) return { transform: [{ translateY: 0 }] };
    const p = shine.value * (1 + span) - lag;
    const on = p > 0 && p < 1;
    return { transform: [{ translateY: on ? -p * travel : D }] };
  });
  return (
    <View pointerEvents="none" style={[styles.window, { width: D, height: D, left: -size / 2, top: -size / 2, transform: [{ rotate: `${GLOSS_ANGLE}deg` }] }]}>
      <Animated.View style={[styles.clip, { top, height, width: D }, move]}>
        <Animated.View style={[{ position: 'absolute', top: -top, left: 0, width: D, height: D }, counter]}>
          <Image source={uri} style={{ position: 'absolute', left: size / 2, top: size / 2, width: size, height: size, transform: [{ rotate: `${-GLOSS_ANGLE}deg` }] }}
            contentFit="contain" tintColor="#ffffff" cachePolicy="memory-disk" transition={0} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function EnamelPin({ uri, size, tilt = 0, shine, lag = 0, lagSpan = 0, lift, surface = 'board', transition = 120, recyclingKey, style }: Props) {
  const shadow = useAnimatedStyle(() => {
    const l = lift ? lift.value : 0;
    return {
      opacity: 0.3 - l * 0.08,
      transform: [{ translateX: size * (0.012 + l * 0.02) }, { translateY: size * (0.03 + l * 0.06) }, { scale: 1 + l * 0.03 }],
    };
  });
  const D = size * 2;
  return (
    <View style={[{ width: size, height: size, transform: [{ rotate: `${tilt}deg` }] }, style]} pointerEvents="none">
      {surface !== 'none' && (
        <Animated.View style={[StyleSheet.absoluteFill, shadow]}>
          <Image source={uri} style={StyleSheet.absoluteFill} contentFit="contain" tintColor={SHADOW_TINT[surface]} blurRadius={8}
            cachePolicy="memory-disk" transition={0} recyclingKey={recyclingKey ? `${recyclingKey}-s` : undefined} />
        </Animated.View>
      )}
      <Image source={uri} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk"
        recyclingKey={recyclingKey} transition={transition} />
      {/* Resting gloss: the upper-left face catches the light; two stacked cuts feather the edge. */}
      <GlossBand uri={uri} size={size} top={0} height={D * 0.42} opacity={0.11} />
      <GlossBand uri={uri} size={size} top={0} height={D * 0.37} opacity={0.11} />
      {shine && <GlossBand uri={uri} size={size} top={D * 0.18} height={size * 0.18} opacity={0.7} shine={shine} lag={lag} span={lagSpan} travel={D * 0.62} />}
    </View>
  );
}

export default memo(EnamelPin);

const styles = StyleSheet.create({
  window: { position: 'absolute', overflow: 'hidden' },
  clip: { position: 'absolute', left: 0, overflow: 'hidden' },
});
