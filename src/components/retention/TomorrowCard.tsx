import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import useAmbientLoop from '../../power/useAmbientLoop';
import { LOOP_CUES, PRESS, type TomorrowPrize } from '../../services/retention/loopMotion';
import { BRAND, GameIcon } from '../../ui';
import { GOLD_FX, SPRING } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import FlameArt from './FlameArt';

const FINN_WAVE = require('../../assets/games/banana-basket/v2/shark_cheer.png');

const DIAL_W = 92;
const DIAL_H = 58;
const DIAL_R = 36;

/**
 * Come back tomorrow: the last beat of a finished Daily 3. A picture of what is
 * waiting, never a timer: tomorrow's real present (its ribbon wiggles), a
 * little sun-and-moon dial with the moon rising (no numbers), tomorrow's
 * flame as a ghost outline with its number, and Finn waving goodbye.
 */
export default function TomorrowCard({ prize, reducedMotion, onDone }: {
  readonly prize: TomorrowPrize;
  readonly reducedMotion: boolean;
  readonly onDone: () => void;
}) {
  const enter = useSharedValue(reducedMotion ? 1 : 0);
  const wiggle = useSharedValue(0);
  const moon = useSharedValue(reducedMotion ? 1 : 0);
  const wave = useSharedValue(0);
  const press = useSharedValue(1);
  useEffect(() => {
    queueHaptic('tickSelection');
    playSfx(LOOP_CUES.tomorrow.fallback, 0.8);
    if (reducedMotion) return;
    enter.value = withSpring(1, SPRING.settle);
    moon.value = withDelay(200, withTiming(1, { duration: 900, easing: EASE.inOut }));
    wave.value = withDelay(350, withRepeat(withSequence(withTiming(1, { duration: 220 }), withTiming(-1, { duration: 220 })), 4, true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The present's ribbon wiggles 6 degrees, twice, every 3 s (ambient: rests when idle or reduced).
  useAmbientLoop(() => {
    wiggle.value = withRepeat(withSequence(
      withDelay(2200, withTiming(1, { duration: 110 })), withTiming(-1, { duration: 140 }),
      withTiming(1, { duration: 140 }), withTiming(0, { duration: 110 }),
    ), -1);
  }, () => { cancelAnimation(wiggle); wiggle.value = 0; }, !reducedMotion);

  const arc = useMemo(() => {
    const p = Skia.Path.Make();
    p.addArc(Skia.XYWHRect(DIAL_W / 2 - DIAL_R, DIAL_H - DIAL_R - 4, DIAL_R * 2, DIAL_R * 2), 180, 180);
    return p;
  }, []);
  const horizon = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(4, DIAL_H - 4); p.lineTo(DIAL_W - 4, DIAL_H - 4);
    return p;
  }, []);
  // The sun sets on the left as the moon rises on the right (one shared value, no numbers).
  const sunX = useDerivedValue(() => DIAL_W / 2 + DIAL_R * Math.cos(Math.PI * (1.25 - 0.2 * moon.value)));
  const sunY = useDerivedValue(() => DIAL_H - 4 + DIAL_R * Math.sin(Math.PI * (1.25 - 0.2 * moon.value)));
  const moonX = useDerivedValue(() => DIAL_W / 2 + DIAL_R * Math.cos(Math.PI * (2 - 0.3 * moon.value)));
  const moonY = useDerivedValue(() => DIAL_H - 4 + DIAL_R * Math.sin(Math.PI * (2 - 0.3 * moon.value)));
  const moonCutX = useDerivedValue(() => moonX.value + 4);
  const moonCutY = useDerivedValue(() => moonY.value - 3);

  const cardStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, enter.value * 2), transform: [{ translateY: (1 - enter.value) * 70 }] }));
  const giftStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wiggle.value * 6}deg` }, { scale: 1 + Math.abs(wiggle.value) * 0.04 }] }));
  const finnStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wave.value * 8}deg` }] }));
  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  return (
    <Animated.View style={[styles.card, cardStyle]}>
      <View style={styles.row}>
        <View style={styles.dialBox} accessibilityLabel="Tomorrow">
          <Canvas style={{ width: DIAL_W, height: DIAL_H }}>
            <Path path={arc} style="stroke" strokeWidth={4} color="#cfe9fb" strokeCap="round" />
            <Path path={horizon} style="stroke" strokeWidth={3} color="#cfe9fb" strokeCap="round" />
            <Circle cx={sunX} cy={sunY} r={10} color={GOLD_FX.rays} />
            <Circle cx={sunX} cy={sunY} r={10} color={BRAND.white} style="stroke" strokeWidth={2} />
            <Circle cx={moonX} cy={moonY} r={10} color="#fff6d6" />
            <Circle cx={moonCutX} cy={moonCutY} r={8} color={BRAND.blue} />
          </Canvas>
        </View>
        <Animated.View style={[styles.gift, giftStyle]}>
          <GameIcon name="gift" size={104} />
          {prize.kind === 'gear' && <View style={styles.gearChip}><Text style={styles.gearText}>NEW GEAR</Text></View>}
        </Animated.View>
        <View style={styles.ghost} accessibilityLabel={`Tomorrow's flame: day ${prize.flameNext}`}>
          <View style={{ opacity: 0.42 }}><FlameArt days={prize.flameNext} size={64} reducedMotion still /></View>
          <View style={styles.ghostNum}><Text style={styles.ghostNumText} allowFontScaling={false}>{prize.flameNext}</Text></View>
        </View>
      </View>
      {prize.chips.length > 0 && (
        <View style={styles.chips}>
          {prize.chips.map(c => (
            <View key={c.icon} style={styles.chip}><GameIcon name={c.icon} size={20} /><Text style={styles.chipText}>{c.n}</Text></View>
          ))}
        </View>
      )}
      <Text style={styles.line}>{prize.line}</Text>
      <View style={styles.bottom}>
        <Animated.View style={[styles.finn, finnStyle]} pointerEvents="none">
          <Image source={FINN_WAVE} style={{ width: 70, height: 70 }} contentFit="contain" />
        </Animated.View>
        <Animated.View style={[{ flex: 1 }, buttonStyle]}>
          <Pressable onPress={onDone} accessibilityRole="button" style={styles.button}
            onPressIn={() => { press.value = withTiming(PRESS.scale, { duration: PRESS.inMs }); }}
            onPressOut={() => { press.value = withSpring(1, PRESS.spring); }}>
            <Text style={styles.buttonText}>SEE YOU TOMORROW!</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 22, paddingBottom: 14, paddingHorizontal: 12, alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: 2 },
  dialBox: { width: DIAL_W, height: DIAL_H, alignItems: 'center', marginBottom: 10 },
  gift: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  gearChip: { position: 'absolute', bottom: 0, backgroundColor: BRAND.gold, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 2, borderColor: BRAND.white },
  gearText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy, marginTop: 1 },
  ghost: { width: 78, alignItems: 'center', marginBottom: 6 },
  ghostNum: { marginTop: -12, minWidth: 30, height: 28, borderRadius: 14, paddingHorizontal: 6, backgroundColor: BRAND.white,
    borderWidth: 2, borderColor: BRAND.navySoft, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  ghostNumText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.navy, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white, marginTop: 1 },
  line: { fontFamily: 'Shark', fontSize: 22, color: BRAND.white, textAlign: 'center', marginTop: 2 },
  bottom: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 6, marginTop: 4 },
  finn: { width: 70, height: 70 },
  button: { backgroundColor: BRAND.gold, borderRadius: 16, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 4,
    borderBottomColor: BRAND.goldLip },
  buttonText: { fontFamily: 'Shark', fontSize: 19, color: '#075083' },
});

