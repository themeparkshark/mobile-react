/**
 * CurrencyChip: a groove pill (a slot cut into the band, not a raised box) with Alex's art off its
 * left end and the count in outlined Shark with equal-width digits. The art's size and overhang
 * come from the kind, so no screen passes geometry. The chip's width steps with the number of
 * digits, so a count that ticks never jitters. When the value changes the chip bounces (a spring
 * on the UI thread; Reduce Motion: a 150 ms fade of the number). A count-up animates the chip,
 * never React.
 */
import { memo, useEffect, useRef } from 'react';
import { Image, View, type ImageSourcePropType, type StyleProp } from 'react-native';
import type { LayoutStyle } from './style';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { SPRING } from '../motion';
import useUiReducedMotion from '../useUiReducedMotion';
import StickerText from './StickerText';
import { ART, ART_RATIO } from './art';
import { TEXT } from './textRoles';
import { CHIP, INK, LINE, SHADE, STICK } from './tokens';

export type CurrencyKind = 'coins' | 'energy' | 'tickets' | 'keys' | 'parkCoin' | 'tries';

/** Art geometry per kind (the board's header chips) and the noun VoiceOver says by default. */
export const CURRENCY: Record<CurrencyKind, { readonly art: ImageSourcePropType | null; readonly ratio: number; readonly height: number; readonly over: number; readonly noun: string }> = {
  coins: { art: ART.coins, ratio: ART_RATIO.coins, height: 42, over: 16, noun: 'coins' },
  energy: { art: ART.energy, ratio: ART_RATIO.energy, height: 36, over: 8, noun: 'energy' },
  tickets: { art: ART.ticket, ratio: ART_RATIO.ticket, height: 30, over: 18, noun: 'tickets' },
  // Keys and park coins are server art: the caller passes `art`.
  keys: { art: null, ratio: 1.3, height: 36, over: 14, noun: 'keys' },
  parkCoin: { art: null, ratio: 1, height: 38, over: 14, noun: 'park coins' },
  tries: { art: ART.retry, ratio: ART_RATIO.retry, height: 34, over: 14, noun: 'extra tries' },
};

/** The chip's width for a count: the board's padding plus one fixed digit width per digit, never under 84. */
export function chipWidth(value: number): number {
  const digits = String(Math.max(0, Math.floor(value))).length;
  return Math.max(CHIP.minWidth, Math.ceil(CHIP.padLeft + CHIP.padRight + CHIP.digit * digits));
}

export type CurrencyChipProps = {
  readonly kind: CurrencyKind;
  readonly value: number;
  /** Server art for keys and park coins (and an override for the others). */
  readonly art?: ImageSourcePropType;
  /** A word after the count, drawn in the chip ("0 extra tries"); the chip then hugs its words. */
  readonly unit?: string;
  /** What VoiceOver says (default "4075 coins"). */
  readonly label?: string;
  readonly style?: StyleProp<LayoutStyle>;
};

const SPEC = { ...TEXT.count, maxScale: 1 };

function CurrencyChipImpl({ kind, value, art: artProp, unit, label, style }: CurrencyChipProps) {
  const reduced = useUiReducedMotion();
  const k = CURRENCY[kind];
  const art = artProp ?? k.art;
  const bounce = useSharedValue(1);
  const shown = useSharedValue(1);
  const last = useRef(value);
  useEffect(() => {
    if (last.current === value) return;
    last.current = value;
    if (reduced) {
      shown.value = withSequence(withTiming(0.4, { duration: 0 }), withTiming(1, { duration: STICK.reducedFadeMs, easing: Easing.out(Easing.quad) }));
    } else {
      bounce.value = withSequence(withTiming(1.12, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(1, SPRING.pop));
    }
  }, [bounce, reduced, shown, value]);
  const chipStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounce.value }] }));
  const numStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <Animated.View accessible accessibilityRole="text" accessibilityLabel={label ?? `${value} ${unit ?? k.noun}`}
      style={[{ alignSelf: 'flex-start', marginLeft: k.over }, chipStyle, style]}>
      <View style={{ height: CHIP.height, width: unit ? undefined : chipWidth(value), minWidth: chipWidth(value), borderRadius: CHIP.height / 2, borderWidth: LINE.chip, borderColor: INK.navy, backgroundColor: INK.blueLip,
        paddingLeft: CHIP.padLeft, paddingRight: CHIP.padRight, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: CHIP.height / 2, borderTopWidth: 3, borderColor: SHADE.grooveInset }} />
        <Animated.View style={[{ paddingTop: 3 }, numStyle]}>
          <StickerText spec={SPEC} lineHeight={22} role="none" tabular={!unit}>{unit ? `${value} ${unit}` : String(value)}</StickerText>
        </Animated.View>
      </View>
      {/* The pale line under the groove (kit.css: 1.5 pt of white at 28 percent). */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 6, right: 6, bottom: -1.5, height: 1.5, borderRadius: 1, backgroundColor: SHADE.grooveRim }} />
      {art ? (
        <Image source={art} fadeDuration={0} resizeMode="contain"
          style={{ position: 'absolute', left: -k.over, top: (CHIP.height - k.height) / 2 - k.height * 0.02, height: k.height, width: k.height * k.ratio }} />
      ) : null}
    </Animated.View>
  );
}

const CurrencyChip = memo(CurrencyChipImpl);
export default CurrencyChip;
