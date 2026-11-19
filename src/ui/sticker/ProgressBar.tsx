/**
 * ProgressBar: a groove, the lit gold fill, the walking dot (how far) and the prize standing on
 * the end (Alex's trophy art, inside the bar's own box). On blue or on paper, from where it is
 * mounted. An optional second part of the fill in orange.
 *
 * The fill and the dot move by translateX on the UI thread. The groove's width goes into a shared
 * value (from `width` when the caller knows it, else one onLayout into the shared value, never into
 * React state), so the bar is drawn from its first frame and a width change walks, not snaps.
 * Reduce Motion: a changed value fades in over 150 ms; nothing fades on mount.
 */
import { memo, useEffect, useRef } from 'react';
import { View, type ImageSourcePropType, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SPRING } from '../motion';
import useUiReducedMotion from '../useUiReducedMotion';
import Lift from './Lift';
import { useStickerPlace } from './StickerContext';
import { BAR, DROP, INK, LINE, SHADE, STICK } from './tokens';

export type ProgressBarProps = {
  /** 0 to 1. */
  readonly value: number;
  /** Optional second part of the fill, 0 to 1 of the whole bar, drawn after the first. */
  readonly second?: number;
  readonly prize?: { readonly source: ImageSourcePropType; readonly width: number; readonly height: number };
  /** VoiceOver: "16 of 35 coins". */
  readonly label: string;
  /** The bar's whole width when the caller knows it (drawn right from the first frame). */
  readonly width?: number;
  readonly showDot?: boolean;
  readonly style?: StyleProp<ViewStyle>;
};

const GOLD = [INK.goldLight, INK.gold, SHADE.goldFillLow] as const;
const GOLD_AT = [0, 0.6, 1] as const;
const TWO = [SHADE.twoTop, SHADE.two, SHADE.twoLow] as const;

export function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

/** Room the prize takes at the bar's right end (it stands on the end, inside the bar's own box). */
export function prizeRoom(prizeWidth: number): number {
  return Math.round(prizeWidth * 0.75);
}

function ProgressBarImpl({ value, second = 0, prize, label, width, showDot = true, style }: ProgressBarProps) {
  const { surface } = useStickerPlace();
  const paper = surface === 'paper';
  const reduced = useUiReducedMotion();
  const room = prize ? prizeRoom(prize.width) : 0;
  const groove = useSharedValue(width ? Math.max(0, width - room - LINE.chip * 2) : 0);
  const v = useSharedValue(clamp01(value));
  const two = useSharedValue(clamp01(second));
  const fade = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduced) {
      v.value = clamp01(value);
      two.value = clamp01(second);
      fade.value = 0.35;
      fade.value = withTiming(1, { duration: STICK.reducedFadeMs, easing: Easing.out(Easing.quad) });
    } else {
      v.value = withSpring(clamp01(value), SPRING.settle);
      two.value = withSpring(clamp01(second), SPRING.settle);
    }
  }, [fade, reduced, second, two, v, value]);
  useEffect(() => {
    if (width) groove.value = withSpring(Math.max(0, width - room - LINE.chip * 2), SPRING.settle);
  }, [groove, room, width]);
  const fillStyle = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateX: -groove.value * (1 - v.value) }] }));
  const twoStyle = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateX: -groove.value * (1 - Math.min(1, v.value + two.value)) }] }));
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ translateX: groove.value * v.value }] }));
  const onLayout = width ? undefined : (e: LayoutChangeEvent) => { groove.value = Math.max(0, e.nativeEvent.layout.width - LINE.chip * 2); };
  const boxH = Math.max(BAR.dot, prize ? prize.height : 0);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp01(value) * 100) }}
      style={[{ height: boxH, justifyContent: prize ? 'flex-end' : 'center', paddingRight: room, width, paddingBottom: prize ? (BAR.dot - BAR.height) / 2 : 0 }, style]}>
      <View onLayout={onLayout} style={{ height: BAR.height }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: BAR.height / 2, borderWidth: LINE.chip, borderColor: INK.navy,
          backgroundColor: paper ? SHADE.barPaper : INK.blueLip, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: BAR.inset, backgroundColor: paper ? SHADE.barPaperInset : SHADE.grooveInset }} />
          {second > 0 ? (
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, right: 0, borderRadius: BAR.height / 2, overflow: 'hidden' }, twoStyle]}>
              <LinearGradient colors={TWO} locations={GOLD_AT} style={{ flex: 1 }} />
            </Animated.View>
          ) : null}
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, right: 0, borderRadius: BAR.height / 2, overflow: 'hidden' }, fillStyle]}>
            <LinearGradient colors={GOLD} locations={GOLD_AT} style={{ flex: 1 }} />
            <View style={{ position: 'absolute', left: 5, right: 9, top: 2, height: 3.5, borderRadius: 4, backgroundColor: SHADE.shine55 }} />
          </Animated.View>
        </View>
        {!paper ? <View pointerEvents="none" style={{ position: 'absolute', left: 8, right: 8, bottom: -1.5, height: 1.5, borderRadius: 1, backgroundColor: SHADE.grooveRim }} /> : null}
        {showDot ? (
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: LINE.chip - BAR.dot / 2, top: (BAR.height - BAR.dot) / 2, width: BAR.dot, height: BAR.dot }, dotStyle]}>
            <View style={{ position: 'absolute', width: BAR.dot, height: BAR.dot, borderRadius: BAR.dot / 2, backgroundColor: DROP.knob, transform: [{ translateY: 2 }] }} />
            <View style={{ width: BAR.dot, height: BAR.dot, borderRadius: BAR.dot / 2, backgroundColor: INK.white, borderWidth: BAR.dotLine, borderColor: INK.navy, padding: 4 }}>
              <View style={{ flex: 1, borderRadius: BAR.dot, backgroundColor: INK.gold }} />
            </View>
          </Animated.View>
        ) : null}
      </View>
      {prize ? (
        <View pointerEvents="none" style={{ position: 'absolute', right: 0, bottom: 0 }}>
          <Lift source={prize.source} width={prize.width} height={prize.height} />
        </View>
      ) : null}
    </View>
  );
}

const ProgressBar = memo(ProgressBarImpl);
export default ProgressBar;
