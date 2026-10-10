/**
 * After a reveal: the pins you got shrink and arc from the stage into their slots
 * on the series card, one after another, each landing with a tick (game-feel r4/r5).
 * Pure decoration on the UI thread; the card's own ZoomIn + gold ring finish the landing.
 * Reduce Motion: nothing flies (the slots still pop in place).
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { queueHaptic } from '../../gamekit/Haptics';

export type Landing = { readonly key: string; readonly icon: string; readonly toX: number; readonly toY: number };

function Flyer({ icon, toX, toY, delay, last, onDone }: { icon: string; toX: number; toY: number; delay: number; last: boolean; onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(0);
  const fromX = width / 2;
  const fromY = height * 0.45;
  const land = () => {
    try { GameAudio.play('fx.coinTick', { pitch: 1.2 + delay / 1000, volume: 0.7 }); } catch { /* decoration */ }
    queueHaptic('tickSelection', 1);
    if (last) onDone();
  };
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 520, easing: Easing.inOut(Easing.cubic) }, done => { if (done) runOnJS(land)(); }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => {
    const x = fromX + (toX - fromX) * t.value;
    // A little arc up before it drops into the slot.
    const y = fromY + (toY - fromY) * t.value - Math.sin(t.value * Math.PI) * 90;
    const size = 120 - 80 * t.value;
    return { opacity: t.value >= 1 ? 0 : 1, width: size, height: size, transform: [{ translateX: x - size / 2 }, { translateY: y - size / 2 }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.flyer, style]}>
      <Image source={icon} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
    </Animated.View>
  );
}

export default function PinsLanding({ pins, onDone }: { pins: readonly Landing[]; onDone: () => void }) {
  if (!pins.length) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pins.map((p, i) => <Flyer key={p.key} icon={p.icon} toX={p.toX} toY={p.toY} delay={i * 110} last={i === pins.length - 1} onDone={onDone} />)}
    </View>
  );
}

const styles = StyleSheet.create({ flyer: { position: 'absolute', left: 0, top: 0 } });
