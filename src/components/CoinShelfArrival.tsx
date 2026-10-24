import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { playSfx } from '../gamekit/SFX';
import { useReduceMotionPreference } from '../hooks/useReducedGameMotion';
import type { ShelfArrivalTarget } from '../hooks/useEarnedShelfArrival';
import { usePowerBudget } from '../power';
import GameIcon from '../ui/GameIcon';
import { GoldBurst, SparkleBurst } from '../ui/GoldBurst';
import { EASE, GOLD_FX, SPRING, momentParticles } from '../ui/motionEasing';
import { SHELF_LANDING } from './shelfLanding';

/**
 * A new coin goes home. The empty slot it belongs in glows gold twice ("this
 * one is yours"), the coin floats in big over a soft gold glow, then drops into
 * the slot turning on its edge, lands with a squash, and 8 sparkles puff from
 * the slot rim while its neighbours jiggle like dominoes (ParkScreen,
 * ShelfJiggle) and the header count ticks. The "clink" and a light haptic land
 * on the same frame. A small caption chip replaces the old bottom-third card
 * so the shelf stays the hero. Tap anywhere to place the coin at once.
 *
 * A repeat catch (not the first of this coin) skips the hover and drops
 * straight in. Reduce Motion: the coin is simply in its slot.
 */
export default function CoinShelfArrival({ target, coinUrl, rideName, parkName, firstCollection, onLand, onInspect, onClose }: {
  target: ShelfArrivalTarget; coinUrl: string; rideName: string; parkName?: string | null; firstCollection: boolean;
  onLand: () => void; onInspect: () => void; onClose: () => void;
}) {
  // Null until iOS answers: the landing waits for it, so it never skips itself by starting in "reduced" mode.
  const preference = useReduceMotionPreference();
  const known = preference !== null;
  const reduced = preference === true;
  const budget = usePowerBudget();
  const plan = firstCollection ? SHELF_LANDING.first : SHELF_LANDING.repeat;
  const hover = useSharedValue(0);
  const progress = useSharedValue(0);
  const pulse = useSharedValue(0);
  const glow = useSharedValue(0);
  const puff = useSharedValue(0);
  const chip = useSharedValue(0);
  const [landed, setLanded] = useState(false);
  const alive = useRef(true), completed = useRef(false);
  const callbacks = useRef({ onLand, onInspect, onClose });
  callbacks.current = { onLand, onInspect, onClose };
  const sparkles = momentParticles(SHELF_LANDING.sparkles, budget, reduced);
  const finish = () => {
    if (!alive.current || completed.current) return;
    completed.current = true; cancelAnimation(progress); progress.value = 1;
    setLanded(true); callbacks.current.onLand();
    playSfx('coin', 0.8);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (!reduced) {
      // The puff and the ring burst start on the landing frame.
      puff.value = 0;
      puff.value = withTiming(1, { duration: SHELF_LANDING.puffMs, easing: Easing.linear });
      glow.value = withTiming(0, { duration: 260, easing: EASE.in });
    }
  };
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; [progress, chip, hover, pulse, glow, puff].forEach(v => cancelAnimation(v)); };
  }, [progress, chip, hover, pulse, glow, puff]);
  useEffect(() => {
    if (completed.current || !known) return;
    if (reduced) { chip.value = 1; finish(); return; }
    // 1. The empty slot glows gold twice: this one is yours.
    pulse.value = withSequence(
      withTiming(1, { duration: SHELF_LANDING.pulseMs / 2 }), withTiming(0.25, { duration: SHELF_LANDING.pulseMs / 2 }),
      withTiming(1, { duration: SHELF_LANDING.pulseMs / 2 }), withTiming(0, { duration: SHELF_LANDING.pulseMs / 2 }));
    // 2. The coin pops in big over a soft gold glow, then 3. drops into the slot, turning on its edge.
    hover.value = withSpring(1, SPRING.pop);
    glow.value = withTiming(firstCollection ? 0.45 : 0.25, { duration: 260, easing: EASE.out });
    progress.value = withDelay(plan.dropAt, withTiming(1, { duration: plan.dropMs, easing: EASE.in },
      ok => { if (ok) runOnJS(finish)(); }));
    chip.value = withDelay(plan.dropAt + plan.dropMs, withSpring(1, SPRING.settle));
    const fallback = setTimeout(finish, plan.dropAt + plan.dropMs + 300);
    return () => { clearTimeout(fallback); cancelAnimation(progress); };
  }, [known, reduced, firstCollection, progress, chip]);

  const size = Math.min(150, target.frameWidth * 0.4);
  const startX = (target.frameWidth - size) / 2;
  const startY = Math.max(24, Math.min(target.frameHeight * 0.3, target.y - size - 70));
  const dx = target.x + target.width / 2 - (startX + size / 2);
  const dy = target.y + target.height / 2 - (startY + size / 2);
  const end = target.width / size;
  const slotCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const coinStyle = useAnimatedStyle(() => {
    const t = progress.value;
    // Edge spin: one and a half turns on the way down, face-on in the slot.
    const turn = Math.cos(t * Math.PI * 3);
    return {
      transform: [
        { translateX: dx * t },
        // A small hop up first, then down into the slot.
        { translateY: dy * t - (reduced ? 0 : Math.sin(Math.min(1, t * 1.6) * Math.PI) * 36) },
        { scale: (0.3 + 0.7 * Math.min(1, hover.value)) * (1 + (end - 1) * t) },
        { scaleX: reduced ? 1 : Math.sign(turn || 1) * Math.max(0.12, Math.abs(turn)) },
      ],
      opacity: landed ? 0 : Math.min(1, hover.value * 2),
    };
  });
  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dx * progress.value }, { translateY: dy * progress.value }, { scale: 1 - 0.55 * progress.value }],
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - progress.value) }));
  const slotStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.6 * pulse.value,
    transform: [{ scale: 1 + 0.12 * pulse.value }],
  }));
  const ringStyle = useAnimatedStyle(() => {
    const t = puff.value;
    return { opacity: t <= 0 || t >= 1 ? 0 : 1 - t, transform: [{ scale: 1 + 0.9 * t }] };
  });
  const chipStyle = useAnimatedStyle(() => ({
    opacity: chip.value,
    transform: [{ translateY: (1 - chip.value) * 30 }, { scale: 0.9 + chip.value * 0.1 }],
  }));

  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {!landed && <Pressable style={StyleSheet.absoluteFill} onPress={finish}
      accessibilityRole="button" accessibilityLabel={`Place ${rideName} coin on its shelf now`}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} />
    </Pressable>}
    {/* The slot that is waiting for this coin: a gold ring that glows twice. */}
    {!landed && !reduced && <Animated.View pointerEvents="none" style={[styles.slotRing, {
      left: target.x - 5, top: target.y - 5, width: target.width + 10, height: target.height + 10,
      borderRadius: (target.width + 10) / 2 }, slotStyle]} />}
    {!reduced && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: startX + size / 2, top: startY + size / 2, width: 0, height: 0,
      alignItems: 'center', justifyContent: 'center' }, glowStyle]}>
      <GoldBurst size={size * 2.1} amount={glow} spin={false} reduced={reduced} />
    </Animated.View>}
    {!landed && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: startX, top: startY, width: size, height: size }, coinStyle]}>
      <Image source={coinUrl} contentFit="contain" onError={finish} style={{ width: size, height: size }} />
    </Animated.View>}
    {/* On the landing frame: a gold ring bursts out of the slot and 8 sparkles puff from its rim. */}
    {!reduced && <View pointerEvents="none" style={[styles.at, { left: slotCenter.x, top: slotCenter.y }]}>
      <Animated.View style={[styles.burstRing, { width: target.width + 8, height: target.width + 8, borderRadius: (target.width + 8) / 2,
        left: -(target.width + 8) / 2, top: -(target.width + 8) / 2 }, ringStyle]} />
      <SparkleBurst progress={puff} count={sparkles} radius={target.width * 1.05} />
    </View>}
    <Animated.View style={[styles.chip, chipStyle]} accessibilityLiveRegion="polite">
      <View style={styles.chipBody}>
      <GameIcon name="coin" size={30} />
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {landed ? 'ON YOUR SHELF' : 'YOUR SOUVENIR HAS A HOME'}
        </Text>
        <Text style={styles.title} numberOfLines={1}>{rideName}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="View coin mastery" style={styles.primary}
        onPress={() => { finish(); callbacks.current.onInspect(); }}>
        <Text style={styles.primaryText}>Mastery</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Keep exploring this shelf" hitSlop={8}
        style={styles.close} onPress={() => { finish(); callbacks.current.onClose(); }}>
        <GameIcon name="close" size={28} />
      </Pressable>
      </View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  dim: { backgroundColor: '#05346e' },
  slotRing: { position: 'absolute', borderWidth: 4, borderColor: GOLD_FX.rays,
    shadowColor: GOLD_FX.glow, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  at: { position: 'absolute', width: 0, height: 0 },
  burstRing: { position: 'absolute', borderWidth: 4, borderColor: GOLD_FX.raysSoft },
  // Outer layer carries position and shadow; the body carries the fill so the
  // cream always spans the full chip, close button included.
  chip: { position: 'absolute', bottom: 118, left: 14, right: 14, borderRadius: 18,
    shadowColor: '#05346e', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  chipBody: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, paddingLeft: 10, paddingRight: 6,
    borderRadius: 18, borderWidth: 3, borderColor: '#ffffff', backgroundColor: '#fff8e4', overflow: 'hidden' },
  eyebrow: { fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.8, color: '#8a5a00' },
  title: { fontFamily: 'Shark', fontSize: 18, color: '#05346e' },
  primary: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 12,
    backgroundColor: '#ffcf3b', borderBottomWidth: 3, borderBottomColor: '#d99a00' },
  primaryText: { fontFamily: 'Shark', fontSize: 14, color: '#05346e' },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
