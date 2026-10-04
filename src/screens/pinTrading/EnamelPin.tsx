/**
 * A server pin drawn as a real enamel pin, in one Skia canvas:
 * - a soft die-cut shadow (the art tinted to the surface and blurred, in a
 *   padded canvas so the blur never clips on wide art),
 * - the art itself, untouched,
 * - a resting gloss: a long soft white falloff from the upper-left, plus one
 *   small specular dot on the rim,
 * - a moving shine: a soft 0 -> 0.45 -> 0 gradient sweep.
 * Gloss, dot and shine are drawn with `srcATop` inside a layer, so they only
 * ever land on the pin's own pixels (any die-cut shape), never as boxes.
 * The art is never redrawn or restyled; these are light and shadow only.
 *
 * Until Skia has decoded the image, the plain art shows through expo-image
 * (already cached by the board), so a pin is never blank.
 *
 * The shine is driven by one shared 0..1 value per screen (`shine`), offset
 * per pin with `lag`; `lagSpan` is the largest lag in the group, so every
 * band has fully left its pin by the time the shared value reaches 1. While
 * the shared value rests, nothing redraws.
 */
import {
  BlendColor, Blur, Canvas, Circle, Group, Image as SkiaImage, LinearGradient, RadialGradient, Rect, useImage, vec,
} from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

/** Shadow tint per surface: warm on cork and cream, navy on the blue panels. */
const SHADOW_TINT = { board: '#4a2c0e', panel: '#021c40' } as const;
/** Canvas padding around the art, as a share of the pin size (room for the shadow blur). */
const PAD = 0.14;

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
  /** Kept for callers; the Skia pin has no fade-in of its own. */
  readonly transition?: number;
  readonly recyclingKey?: string;
  readonly style?: StyleProp<ViewStyle>;
};

function EnamelPin({ uri, size, tilt = 0, shine, lag = 0, lagSpan = 0, lift, surface = 'board', recyclingKey, style }: Props) {
  const image = useImage(uri);
  const pad = Math.round(size * PAD);
  const box = size + pad * 2;
  const blur = Math.max(2, size * 0.045);

  // Shine: a soft diagonal band whose gradient line slides across the pin.
  const shineStart = useDerivedValue(() => {
    const p = shine ? shine.value * (1 + lagSpan) - lag : -1;
    const t = p * 1.6 - 0.3;
    return vec(pad + size * (t - 0.35), pad + size * (t - 0.35));
  });
  const shineEnd = useDerivedValue(() => {
    const p = shine ? shine.value * (1 + lagSpan) - lag : -1;
    const t = p * 1.6 - 0.3;
    return vec(pad + size * (t + 0.05), pad + size * (t + 0.05));
  });
  const shineOn = useDerivedValue(() => {
    if (!shine) return 0;
    const p = shine.value * (1 + lagSpan) - lag;
    return p > 0 && p < 1 ? 1 : 0;
  });
  const shadowShift = useDerivedValue(() => {
    const l = lift ? lift.value : 0;
    return [{ translateX: size * (0.012 + l * 0.02) }, { translateY: size * (0.035 + l * 0.06) }];
  });
  const shadowOpacity = useDerivedValue(() => 0.34 - (lift ? lift.value : 0) * 0.1);

  return (
    <View style={[{ width: size, height: size, transform: [{ rotate: `${tilt}deg` }] }, style]} pointerEvents="none">
      {!image && (
        <Image source={uri} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={0} recyclingKey={recyclingKey} />
      )}
      {image && (
        <Canvas style={{ position: 'absolute', left: -pad, top: -pad, width: box, height: box }}>
          {surface !== 'none' && (
            <Group transform={shadowShift} opacity={shadowOpacity}>
              <SkiaImage image={image} x={pad} y={pad} width={size} height={size} fit="contain">
                <BlendColor color={SHADOW_TINT[surface]} mode="srcIn" />
                <Blur blur={blur} />
              </SkiaImage>
            </Group>
          )}
          <Group layer>
            <SkiaImage image={image} x={pad} y={pad} width={size} height={size} fit="contain" />
            {/* Resting gloss: a long soft falloff from the upper-left face. */}
            <Rect x={0} y={0} width={box} height={box} blendMode="srcATop">
              <LinearGradient start={vec(pad, pad)} end={vec(pad + size * 0.62, pad + size * 0.62)}
                colors={['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0)']} positions={[0, 0.45, 1]} />
            </Rect>
            {/* One small specular dot near the upper-left rim. */}
            <Circle cx={pad + size * 0.27} cy={pad + size * 0.22} r={size * 0.11} blendMode="srcATop">
              <RadialGradient c={vec(pad + size * 0.27, pad + size * 0.22)} r={size * 0.11}
                colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']} />
            </Circle>
            {shine && (
              <Rect x={0} y={0} width={box} height={box} blendMode="srcATop" opacity={shineOn}>
                <LinearGradient start={shineStart} end={shineEnd}
                  colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} positions={[0, 0.5, 1]} />
              </Rect>
            )}
          </Group>
        </Canvas>
      )}
    </View>
  );
}

export default memo(EnamelPin);

