/**
 * CurrencyChip: a groove pill (a slot cut into the band, not a raised box) with Alex's art off
 * its left end and the count in outlined Shark. When the count changes the chip bounces
 * (a spring on the UI thread; Reduce Motion: a 150 ms fade of the number instead).
 */
import { memo, useEffect, useRef } from 'react';
import { Image, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { SPRING } from '../motion';
import useUiReducedMotion from '../useUiReducedMotion';
import StickerText from './StickerText';
import { CHIP, INK, LINE, SHADE, STICK, STROKE } from './tokens';

export type CurrencyChipProps = {
  readonly art: ImageSourcePropType;
  /** Art width:height. */
  readonly artRatio?: number;
  readonly artHeight?: number;
  /** How far the art hangs past the left end (pt). */
  readonly artOver?: number;
  readonly value: number;
  /** VoiceOver: "4075 coins". */
  readonly label: string;
  readonly minWidth?: number;
  readonly style?: StyleProp<ViewStyle>;
};

function CurrencyChipImpl({ art, artRatio = 1, artHeight = CHIP.artHeight, artOver = 12, value, label, minWidth = CHIP.minWidth, style }: CurrencyChipProps) {
  const reduced = useUiReducedMotion();
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
    <Animated.View accessible accessibilityRole="text" accessibilityLabel={label}
      style={[{ alignSelf: 'flex-start', marginLeft: artOver }, chipStyle, style]}>
      <View style={{ height: CHIP.height, minWidth, borderRadius: CHIP.height / 2, borderWidth: LINE.chip, borderColor: INK.navy, backgroundColor: INK.blueLip,
        paddingLeft: CHIP.padLeft, paddingRight: CHIP.padRight, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: CHIP.height / 2, borderTopWidth: 3, borderColor: SHADE.grooveInset }} />
        <Animated.View style={[{ paddingTop: 3 }, numStyle]}>
          <StickerText size={CHIP.font} stroke={STROKE.button} drop={2} spacing={0.04} lineHeight={22} role="none" maxScale={1.2}>{String(value)}</StickerText>
        </Animated.View>
      </View>
      {/* The pale line under the groove (kit.css: 1.5 pt of white at 28 percent). */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 6, right: 6, bottom: -1.5, height: 1.5, borderRadius: 1, backgroundColor: SHADE.grooveRim }} />
      <Image source={art} fadeDuration={0} resizeMode="contain"
        style={{ position: 'absolute', left: -artOver, top: (CHIP.height - artHeight) / 2 - artHeight * 0.02, height: artHeight, width: artHeight * artRatio }} />
    </Animated.View>
  );
}

const CurrencyChip = memo(CurrencyChipImpl);
export default CurrencyChip;
