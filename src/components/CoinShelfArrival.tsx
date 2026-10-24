import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { playMoment } from '../gamekit/audio/playMoment';
import { queueHaptic } from '../gamekit/Haptics';
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
 * The coin is on screen from the first frame (no dead start: the Reduce Motion
 * answer is cached app-wide and the coin art is prefetched before the shelf
 * opens). The landing holds one 60 ms frame (hit-stop) before the slot coin
 * squashes, the shelf plank kicks 2 pt and the neighbours tip; the haptic and
 * the clink fire from the UI clock on that frame.
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
  const flash = useSharedValue(0);
  const chip = useSharedValue(0);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landedSound = useRef(false);
  const [landed, setLanded] = useState(false);
  const alive = useRef(true), completed = useRef(false);
  const callbacks = useRef({ onLand, onInspect, onClose });
  callbacks.current = { onLand, onInspect, onClose };
  const sparkles = momentParticles(SHELF_LANDING.sparkles, budget, reduced);
  const impact = () => {
    if (!alive.current || completed.current) return;
    // The clink and the buzz on the landing frame; the coin holds there one hit-stop frame before it settles.
    playMoment('park.shelfLand');
    queueHaptic(firstCollection ? 'hitMedium' : 'tapLight');
    if (!reduced) {
      flash.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 220, easing: EASE.out }));
      cancelAnimation(glow); glow.value = withTiming(0, { duration: 160, easing: EASE.in });
    }
    if (reduced) finish();
    else hitTimer.current = setTimeout(finish, SHELF_LANDING.hitStopMs);
  };
  const finish = () => {
    if (!alive.current || completed.current) return;
    completed.current = true; cancelAnimation(progress); progress.value = 1;
    setLanded(true); callbacks.current.onLand();
    if (!reduced) {
      // The puff and the ring burst start as the slot coin squashes.
      puff.value = 0;
      puff.value = withTiming(1, { duration: SHELF_LANDING.puffMs, easing: Easing.linear });
    }
  };
  // A tap places the coin at once (with its clink).
  const placeNow = () => {
    if (completed.current) return;
    if (hitTimer.current) clearTimeout(hitTimer.current);
    if (!landedSound.current) { landedSound.current = true; playMoment('park.shelfLand'); queueHaptic('tapLight'); }
    finish();
  };
  const onDropDone = () => { landedSound.current = true; impact(); };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (hitTimer.current) clearTimeout(hitTimer.current);
      [progress, chip, hover, pulse, glow, puff, flash].forEach(v => cancelAnimation(v));
    };
  }, [progress, chip, hover, pulse, glow, puff, flash]);
  useEffect(() => {
    if (completed.current || !known) return;
    if (reduced) { chip.value = 1; landedSound.current = true; impact(); return; }
    // 1. The empty slot glows gold twice: this one is yours.
    pulse.value = withSequence(
      withTiming(1, { duration: SHELF_LANDING.pulseMs / 4 }), withTiming(0.25, { duration: SHELF_LANDING.pulseMs / 4 }),
      withTiming(1, { duration: SHELF_LANDING.pulseMs / 4 }), withTiming(0, { duration: SHELF_LANDING.pulseMs / 4 }));
    // 2. The coin pops in big over a gold glow on the first frame, then 3. drops into the slot, turning on its edge.
    hover.value = withSpring(1, SPRING.pop);
    // The glow lives where the coin hovers and fades as it drops (it never trails behind on the shelf).
    glow.value = withSequence(withTiming(firstCollection ? 0.6 : 0.3, { duration: 200, easing: EASE.out }),
      withDelay(Math.max(0, plan.dropAt - 200), withTiming(0, { duration: plan.dropMs * 0.6, easing: EASE.in })));
    progress.value = withDelay(plan.dropAt, withTiming(1, { duration: plan.dropMs, easing: EASE.in },
      ok => { if (ok) runOnJS(onDropDone)(); }));
    chip.value = withDelay(plan.dropAt + plan.dropMs + SHELF_LANDING.hitStopMs, withSpring(1, SPRING.settle));
    const fallback = setTimeout(placeNow, plan.dropAt + plan.dropMs + 400);
    return () => { clearTimeout(fallback); cancelAnimation(progress); };
    // Runs once the preference is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const dimStyle = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - progress.value) }));
  const slotStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.6 * pulse.value,
    transform: [{ scale: 1 + 0.12 * pulse.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: 0.85 * flash.value, transform: [{ scale: 0.8 + 0.5 * flash.value }] }));
  const ringStyle = useAnimatedStyle(() => {
    const t = puff.value;
    return { opacity: t <= 0 || t >= 1 ? 0 : 1 - t, transform: [{ scale: 1 + 0.9 * t }] };
  });
  const chipStyle = useAnimatedStyle(() => ({
    opacity: chip.value,
    transform: [{ translateY: (1 - chip.value) * 30 }, { scale: 0.9 + chip.value * 0.1 }],
  }));

  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {!known ? null : <>
    {!landed && <Pressable style={StyleSheet.absoluteFill} onPress={placeNow}
      accessibilityRole="button" accessibilityLabel={`Place ${rideName} coin on its shelf now`}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} />
    </Pressable>}
    {/* The slot that is waiting for this coin: a gold ring that glows twice. */}
    {!landed && !reduced && <Animated.View pointerEvents="none" style={[styles.slotRing, {
      left: target.x - 5, top: target.y - 5, width: target.width + 10, height: target.height + 10,
      borderRadius: (target.width + 10) / 2 }, slotStyle]} />}
    {!reduced && <View pointerEvents="none" style={[{ position: 'absolute', left: startX + size / 2, top: startY + size / 2, width: 0, height: 0,
      alignItems: 'center', justifyContent: 'center' }]}>
      <GoldBurst size={size * 2.1} amount={glow} spin={false} reduced={reduced} />
    </View>}
    {!landed && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: startX, top: startY, width: size, height: size }, coinStyle]}>
      <Image source={coinUrl} contentFit="contain" onError={placeNow} style={{ width: size, height: size }} transition={0} />
    </Animated.View>}
    {/* On the landing frame: a white-gold flash in the slot, then a gold ring bursts out and sparkles puff wide. */}
    {!reduced && <View pointerEvents="none" style={[styles.at, { left: slotCenter.x, top: slotCenter.y }]}>
      <Animated.View style={[styles.slotFlash, { width: target.width * 1.5, height: target.width * 1.5, borderRadius: target.width * 0.75,
        left: -target.width * 0.75, top: -target.width * 0.75 }, flashStyle]} />
      <Animated.View style={[styles.burstRing, { width: target.width + 8, height: target.width + 8, borderRadius: (target.width + 8) / 2,
        left: -(target.width + 8) / 2, top: -(target.width + 8) / 2 }, ringStyle]} />
      <SparkleBurst progress={puff} count={sparkles} radius={target.width * SHELF_LANDING.puffReach} />
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
        onPress={() => { placeNow(); callbacks.current.onInspect(); }}>
        <Text style={styles.primaryText}>Mastery</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Keep exploring this shelf" hitSlop={8}
        style={styles.close} onPress={() => { placeNow(); callbacks.current.onClose(); }}>
        <GameIcon name="close" size={28} />
      </Pressable>
      </View>
    </Animated.View>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  dim: { backgroundColor: '#05346e' },
  slotRing: { position: 'absolute', borderWidth: 4, borderColor: GOLD_FX.rays,
    shadowColor: GOLD_FX.glow, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  at: { position: 'absolute', width: 0, height: 0 },
  burstRing: { position: 'absolute', borderWidth: 5, borderColor: GOLD_FX.raysSoft },
  slotFlash: { position: 'absolute', backgroundColor: '#fff6cf' },
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
