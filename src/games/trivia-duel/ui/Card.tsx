/**
 * Question card (design 3 / 11.3): round label, the live speed ticker (UI
 * thread, the exact value you would lock), question text (19pt 800, navy,
 * max 3 lines), the gold read-lock progress line, and the 52pt timer ring
 * (blue, gold at 50%, coral in the last 3 seconds, pulsing).
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import Animated, {
  interpolateColor,
  Easing, useAnimatedProps, useAnimatedStyle, useDerivedValue, useSharedValue, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { C } from '../art';

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

interface Props {
  roundLabel: string;
  question: string;
  ticker: SharedValue<number>;
  tickerOn: boolean;
  readProgress: SharedValue<number>;
  remain: SharedValue<number>;
  frozen: boolean;
  dropKey: number;
  flip3d: boolean;
  faceDown: boolean;
  reducedMotion: boolean;
  width: number;
  children?: React.ReactNode;
}

const RING = 52;
const ringPath = (() => {
  const p = Skia.Path.Make();
  p.addArc({ x: 5, y: 5, width: RING - 10, height: RING - 10 }, -90, 359.9);
  return p;
})();

export const QuestionCard = React.memo(function QuestionCard({
  roundLabel, question, ticker, tickerOn, readProgress, remain, frozen, dropKey, flip3d, faceDown, reducedMotion, width, children,
}: Props) {
  const y = useSharedValue(0);
  const rx = useSharedValue(0);
  const o = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) {
      o.value = 0;
      o.value = withTiming(1, { duration: 200 });
      return;
    }
    if (flip3d) {
      rx.value = 90;
      rx.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.back(1.2)) });
    } else {
      y.value = -24;
      o.value = 0;
      y.value = withSpring(0, { damping: 11, stiffness: 320, mass: 0.6 });
      o.value = withTiming(1, { duration: 120 });
    }
  }, [dropKey, flip3d, reducedMotion, y, rx, o]);
  const st = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ perspective: 800 }, { translateY: y.value }, { rotateX: `${rx.value}deg` }],
  }));

  const tickText = useAnimatedProps(() => ({ text: `+${Math.round(ticker.value)}` } as never));
  // D9: a continuous colour drain (gold -> amber -> blue -> navy) as speed falls, and
  // a blip only when the value crosses a tier edge (95 / 70 / 35), never every 5 points.
  const tickerColor = useDerivedValue(() => {
    const s = ticker.value - 100;
    return interpolateColor(s, [0, 35, 70, 95, 100], [C.navy, C.blue, '#e8a800', C.goldDeep, C.goldDeep]);
  });
  const tickStyle = useAnimatedStyle(() => ({ color: tickerColor.value }));
  const blip = useSharedValue(1);
  const lastTier = useSharedValue(-1);
  useDerivedValue(() => {
    const s = Math.round(ticker.value) - 100;
    const tier = s >= 95 ? 3 : s >= 70 ? 2 : s >= 35 ? 1 : 0;
    if (tier !== lastTier.value) {
      const crossed = lastTier.value >= 0;
      lastTier.value = tier;
      if (crossed) blip.value = withSequence(withTiming(1.08, { duration: 30 }), withTiming(1, { duration: 30 }));
    }
  });
  const blipStyle = useAnimatedStyle(() => ({ transform: [{ scale: blip.value }] }));

  const readStyle = useAnimatedStyle(() => ({ width: `${Math.min(1, readProgress.value) * 100}%`, opacity: readProgress.value >= 1 ? 0 : 1 }));
  const ringEnd = useDerivedValue(() => Math.max(0, Math.min(1, remain.value)));
  const ringColor = useDerivedValue(() => (frozen ? '#8fd8ff' : remain.value > 0.5 ? C.blue : remain.value > 0.25 ? C.gold : C.coral));
  const pulse = useAnimatedStyle(() => {
    const low = remain.value < 0.25 && remain.value > 0;
    const k = low ? 1 + 0.12 * Math.abs(Math.sin(remain.value * 40)) : 1;
    return { transform: [{ scale: k }] };
  });

  return (
    <Animated.View style={[styles.card, { width }, st]}>
      <View style={styles.head}>
        <Text style={styles.round}>{roundLabel}</Text>
        {tickerOn ? (
          <Animated.View style={blipStyle}>
            <AnimatedInput editable={false} underlineColorAndroid="transparent" style={[styles.ticker, tickStyle]} animatedProps={tickText} defaultValue="+200" />
          </Animated.View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={[styles.q, faceDown && { opacity: 0.25 }]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.84} accessibilityRole="header">
          {faceDown ? 'Paused' : question}
        </Text>
        <Animated.View style={[styles.ringWrap, pulse]}>
          <Canvas style={{ width: RING, height: RING }}>
            <Circle cx={RING / 2} cy={RING / 2} r={RING / 2 - 3} color={C.cream} />
            <Path path={ringPath} color="#dfeaf2" style="stroke" strokeWidth={7} />
            <Path path={ringPath} color={ringColor} style="stroke" strokeWidth={7} strokeCap="round" start={0} end={ringEnd} />
            <Circle cx={RING / 2} cy={RING / 2} r={RING / 2 - 1.5} color={C.ink} style="stroke" strokeWidth={3} />
          </Canvas>
        </Animated.View>
      </View>
      <View style={styles.readTrack}>
        <Animated.View style={[styles.readFill, readStyle]} />
      </View>
      {children}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center', backgroundColor: '#ffffff', borderRadius: 20, borderWidth: 3, borderColor: C.ink,
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, borderBottomWidth: 7,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 26 },
  round: { fontFamily: 'Knockout', fontSize: 15, color: C.blue, letterSpacing: 0.5 },
  ticker: { fontFamily: 'Knockout', fontSize: 22, padding: 0, margin: 0, minWidth: 60, textAlign: 'right' },
  body: { flexDirection: 'row', alignItems: 'center', minHeight: 72 },
  q: { flex: 1, fontSize: 19, lineHeight: 24, fontWeight: '800', color: C.navy, paddingRight: 8 },
  ringWrap: { width: RING, height: RING },
  readTrack: { height: 5, borderRadius: 3, backgroundColor: '#f1ead6', marginTop: 4, overflow: 'hidden' },
  readFill: { height: 5, backgroundColor: C.gold },
});
