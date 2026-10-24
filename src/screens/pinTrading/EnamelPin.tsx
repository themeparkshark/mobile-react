/**
 * A server pin drawn as a real enamel pin, in one Skia canvas:
 * - a soft die-cut shadow (the art tinted to the surface and blurred, in a
 *   padded canvas so the blur never clips on wide art),
 * - the art itself, untouched (a gold edition adds a foil rim and a warm glint, never a recolour),
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
 * the shared value rests (the screen sets it once per sweep, not every frame), nothing redraws.
 */
import {
  BlendColor, Blur, Canvas, Circle, Group, Image as SkiaImage, LinearGradient, RadialGradient, Rect, vec,
} from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAnimatedReaction, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { usePinImage } from './pinImageCache';

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
  /** Always a plain image (static tiles that gain nothing from light). */
  readonly flat?: boolean;
  /**
   * The gold foil edition of the same art, lit pins only: the art itself stays untouched (so a kid still
   * sees the pin they know), framed by a polished foil rim in this colour (a deep-to-bright metal edge
   * around the die-cut shape plus a pale inner lip) and swept by a warm glint.
   */
  readonly tint?: string;
};

/** The foil rim around a gold pin (fraction of its size, each side): thick enough to read as gold at card size. */
const FOIL_EDGE = 0.09;
/** The rim's bevel: a bright edge up-left and a deep edge down-right, offset by this (fraction of its size). */
const FOIL_BEVEL = 0.014;
/** The bevel's catch-light and its shadow. */
const BEVEL_LIGHT = '#fff6d2';
const BEVEL_DEEP = '#8a5a00';
/** The pale inner lip of the foil rim, just outside the art (fraction of its size, each side). */
const FOIL_LIP = 0.022;
/** The pale shine of the foil lip. */
const FOIL_LIGHT = '#fff1b8';

/**
 * The foil rim's metal, light to dark across the pin (top-left catches the light): a bright face, the
 * tint itself, a deep edge. Pure, so it is tested.
 */
export function foilStops(hex: string): string[] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mix = (t: number, to: number) => `#${rgb.map(v => Math.round(v + (to - v) * t).toString(16).padStart(2, '0')).join('')}`;
  return [mix(0.55, 255), hex.slice(0, 7).toLowerCase(), mix(0.42, 0), mix(0.3, 255)];
}

/** Under this size the light and shadow are too small to see: a plain image (and no Skia canvas). */
const FLAT_BELOW = 48;

function EnamelPin(props: Props) {
  if (props.flat || props.size < FLAT_BELOW) {
    const { uri, size, tilt = 0, recyclingKey, style } = props;
    return (
      <View style={[{ width: size, height: size, transform: [{ rotate: `${tilt}deg` }] }, style]} pointerEvents="none">
        <Image source={uri} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" transition={0} recyclingKey={recyclingKey} />
      </View>
    );
  }
  return <LitPin {...props} />;
}

function LitPin({ uri, size, tilt = 0, shine, lag = 0, lagSpan = 0, lift, surface = 'board', recyclingKey, style, tint }: Props) {
  const image = usePinImage(uri, size);
  const pad = Math.round(size * PAD);
  const box = size + pad * 2;
  const blur = Math.max(2, size * 0.045);

  // This pin's own sweep progress. It only changes while the band is on this pin (then parks at -1 once),
  // so a sweep redraws one or two canvases at a time, not the whole board.
  const local = useSharedValue(-1);
  useAnimatedReaction(
    () => (shine ? shine.value * (1 + lagSpan) - lag : -1),
    p => {
      // The visible band crosses the pin in the middle 40% of its window: only then does the canvas redraw.
      const q = (p - 0.3) / 0.4;
      if (q > 0 && q < 1) local.value = q;
      else if (local.value !== -1) local.value = -1;
    },
    [lag, lagSpan, shine],
  );
  const shineStart = useDerivedValue(() => {
    const t = local.value * 1.5 - 0.25;
    return vec(pad + size * (t - 0.35), pad + size * (t - 0.35));
  });
  const shineEnd = useDerivedValue(() => {
    const t = local.value * 1.5 - 0.25;
    return vec(pad + size * (t + 0.05), pad + size * (t + 0.05));
  });
  const shineOn = useDerivedValue(() => (local.value >= 0 ? 1 : 0));
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
            {tint && (
              // The bevel: the rim's silhouette drawn twice behind it, nudged up-left in a bright catch-light and
              // down-right in deep gold, so the foil edge reads as raised polished metal, not a flat outline.
              <>
                <SkiaImage image={image} x={pad - size * (FOIL_EDGE + FOIL_BEVEL)} y={pad - size * (FOIL_EDGE + FOIL_BEVEL)}
                  width={size * (1 + FOIL_EDGE * 2)} height={size * (1 + FOIL_EDGE * 2)} fit="contain">
                  <BlendColor color={BEVEL_LIGHT} mode="srcIn" />
                </SkiaImage>
                <SkiaImage image={image} x={pad - size * (FOIL_EDGE - FOIL_BEVEL)} y={pad - size * (FOIL_EDGE - FOIL_BEVEL)}
                  width={size * (1 + FOIL_EDGE * 2)} height={size * (1 + FOIL_EDGE * 2)} fit="contain">
                  <BlendColor color={BEVEL_DEEP} mode="srcIn" />
                </SkiaImage>
              </>
            )}
            {tint && (
              // The foil rim: the pin's own silhouette a little larger, filled with polished metal, behind the art.
              <Group layer>
                <SkiaImage image={image} x={pad - size * FOIL_EDGE} y={pad - size * FOIL_EDGE}
                  width={size * (1 + FOIL_EDGE * 2)} height={size * (1 + FOIL_EDGE * 2)} fit="contain" />
                <Rect x={0} y={0} width={box} height={box} blendMode="srcIn">
                  <LinearGradient start={vec(pad, pad)} end={vec(pad + size, pad + size)} colors={foilStops(tint)} positions={[0, 0.35, 0.72, 1]} />
                </Rect>
              </Group>
            )}
            {tint && (
              // The pale inner lip: a thin bright line where the foil meets the enamel.
              <SkiaImage image={image} x={pad - size * FOIL_LIP} y={pad - size * FOIL_LIP}
                width={size * (1 + FOIL_LIP * 2)} height={size * (1 + FOIL_LIP * 2)} fit="contain">
                <BlendColor color={FOIL_LIGHT} mode="srcIn" />
              </SkiaImage>
            )}
            {/* The art itself, untouched (the gold edition keeps its own colours inside the foil). */}
            <SkiaImage image={image} x={pad} y={pad} width={size} height={size} fit="contain" />
            {/* Resting gloss: a long soft falloff from the upper-left face. */}
            <Rect x={0} y={0} width={box} height={box} blendMode="srcATop">
              <LinearGradient start={vec(pad, pad)} end={vec(pad + size * 0.62, pad + size * 0.62)}
                colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']} positions={[0, 0.45, 1]} />
            </Rect>
            {/* One small specular dot near the upper-left rim. */}
            <Circle cx={pad + size * 0.27} cy={pad + size * 0.22} r={size * 0.11} blendMode="srcATop">
              <RadialGradient c={vec(pad + size * 0.27, pad + size * 0.22)} r={size * 0.11}
                colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']} />
            </Circle>
            {shine && (
              <Rect x={0} y={0} width={box} height={box} blendMode="srcATop" opacity={shineOn}>
                <LinearGradient start={shineStart} end={shineEnd}
                  colors={tint ? ['rgba(255,240,190,0)', 'rgba(255,240,190,0.6)', 'rgba(255,240,190,0)'] : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} positions={[0, 0.5, 1]} />
              </Rect>
            )}
          </Group>
        </Canvas>
      )}
    </View>
  );
}

export default memo(EnamelPin);

