import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, type SharedValue,
} from 'react-native-reanimated';
import { withDelay, withSequence, withSpring, withTiming, momentMs } from './park/momentTime';
import { playMoment } from '../gamekit/audio/playMoment';
import { queueHaptic } from '../gamekit/Haptics';
import { useReduceMotionPreference } from '../hooks/useReducedGameMotion';
import type { ShelfArrivalTarget } from '../hooks/useEarnedShelfArrival';
import { usePowerBudget } from '../power';
import GameIcon from '../ui/GameIcon';
import { GoldBurst } from '../ui/GoldBurst';
import { EASE, GOLD_FX, SPRING, flashPeak, momentParticles } from '../ui/motionEasing';
import { isDimFlashingLightsEnabled } from '../../modules/flash-safety';
import BurstCanvas from './park/BurstCanvas';
import { perfMark } from './park/momentPerf';
import { SHELF_LANDING } from './shelfLanding';

const SOFT = require('../../assets/images/reveal/soft-spot.webp');

/**
 * A new coin goes home. The empty slot it belongs in glows gold twice ("this
 * one is yours"), the coin pops in big with a gold rim glow and spins once
 * while it hovers, then dives face-on into the slot with a short gold trail,
 * slams in (squashed for the 60 ms hit-stop), and the slot flashes white-hot:
 * the veil lifts so the whole shelf brightens, a gold ring and 12 gold and
 * white stars burst from the slot, the plank kicks and the neighbours jiggle
 * like dominoes (ParkScreen, ShelfJiggle) while the header count ticks. About
 * one landing in ten is a shiny one (a second ring, gold rays and a brighter
 * chime). The "clink" and the haptic land on the impact frame. A small caption
 * chip docks above the footer and slips away after a few seconds so the shelf
 * stays the hero. Tap anywhere to place the coin at once.
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
export default function CoinShelfArrival({ target, coinUrl, rideName, parkName, firstCollection, shiny = false, onLand, onInspect, onClose }: {
  target: ShelfArrivalTarget; coinUrl: string; rideName: string; parkName?: string | null; firstCollection: boolean;
  /** The rare shiny landing (about 1 in 10, shinyLanding()). */
  shiny?: boolean;
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
  const spin = useSharedValue(0);
  const squash = useSharedValue(0);
  const lift = useSharedValue(0);
  const rays = useSharedValue(0);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landedSound = useRef(false);
  const [landed, setLanded] = useState(false);
  const alive = useRef(true), completed = useRef(false);
  const callbacks = useRef({ onLand, onInspect, onClose });
  callbacks.current = { onLand, onInspect, onClose };
  const sparkles = momentParticles(SHELF_LANDING.sparkles, budget, reduced);
  const flashTop = flashPeak(isDimFlashingLightsEnabled(), reduced);
  const impact = () => {
    if (!alive.current || completed.current) return;
    perfMark('shelf.impact');
    // The clink and the buzz on the landing frame; the coin holds there one hit-stop frame before it settles.
    playMoment('park.shelfLand');
    if (shiny) playMoment('reward.stamp', { delayMs: 90 });
    queueHaptic(shiny ? 'success' : firstCollection ? 'hitMedium' : 'tapLight');
    if (!reduced) {
      // White-hot in the slot, the coin squashed flat for the hit-stop, the veil lifts: the shelf brightens.
      flash.value = withSequence(withTiming(1, { duration: 30 }), withTiming(1, { duration: SHELF_LANDING.hitStopMs }),
        withTiming(0, { duration: 260, easing: EASE.out }));
      squash.value = 1;
      lift.value = withTiming(1, { duration: 220, easing: EASE.out });
      cancelAnimation(glow); glow.value = withTiming(0, { duration: 160, easing: EASE.in });
      if (shiny) rays.value = withSequence(withTiming(1, { duration: 160, easing: EASE.out }), withDelay(420, withTiming(0, { duration: 420, easing: EASE.in })));
    }
    if (reduced) finish();
    else hitTimer.current = setTimeout(finish, momentMs(SHELF_LANDING.hitStopMs));
  };
  const finish = () => {
    if (!alive.current || completed.current) return;
    completed.current = true; cancelAnimation(progress); progress.value = 1;
    squash.value = 0;
    setLanded(true); callbacks.current.onLand();
    // The caption chip slips away after a while (the coin in its slot already says it all).
    // (One sequence: a separate fade would cancel the chip's own spring in and it would never show.)
    if (!reduced) chip.value = withSequence(withSpring(1, SPRING.settle), withDelay(2600, withTiming(0, { duration: 260, easing: EASE.in })));
    perfMark('shelf.done');
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
      [progress, chip, hover, pulse, glow, puff, flash, spin, squash, lift, rays].forEach(v => cancelAnimation(v));
    };
  }, [progress, chip, hover, pulse, glow, puff, flash, spin, squash, lift, rays]);
  useEffect(() => {
    if (completed.current || !known) return;
    if (reduced) { chip.value = 1; landedSound.current = true; impact(); return; }
    // 1. The empty slot glows gold twice: this one is yours.
    pulse.value = withSequence(
      withTiming(1, { duration: SHELF_LANDING.pulseMs / 4 }), withTiming(0.25, { duration: SHELF_LANDING.pulseMs / 4 }),
      withTiming(1, { duration: SHELF_LANDING.pulseMs / 4 }), withTiming(0, { duration: SHELF_LANDING.pulseMs / 4 }));
    perfMark('shelf.start');
    // 2. The coin pops in big over a gold glow on the first frame and spins once while it hovers, then
    // 3. dives face-on into the slot (it never turns edge-on right before impact: the weight reads).
    hover.value = withSpring(1, SPRING.pop);
    spin.value = withTiming(1, { duration: Math.max(160, plan.dropAt), easing: EASE.out });
    // The glow lives where the coin hovers and fades as it drops (it never trails behind on the shelf).
    glow.value = withSequence(withTiming(firstCollection ? 0.6 : 0.3, { duration: 200, easing: EASE.out }),
      withDelay(Math.max(0, plan.dropAt - 200), withTiming(0, { duration: plan.dropMs * 0.6, easing: EASE.in })));
    progress.value = withDelay(plan.dropAt, withTiming(1, { duration: plan.dropMs, easing: EASE.in },
      ok => { if (ok) runOnJS(onDropDone)(); }));
    chip.value = withDelay(plan.dropAt + plan.dropMs + SHELF_LANDING.hitStopMs, withSpring(1, SPRING.settle));
    const fallback = setTimeout(placeNow, momentMs(plan.dropAt + plan.dropMs + 400));
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
  // Where the coin is at t (0 hover, 1 in the slot): a small hop up first, then down into the slot.
  const coinStyle = useAnimatedStyle(() => {
    const t = progress.value;
    // One spin while it hovers, face-on for the dive.
    const turn = Math.cos(spin.value * Math.PI * 2);
    const sq = squash.value;
    return {
      transform: [
        { translateX: dx * t },
        { translateY: dy * t - (reduced ? 0 : Math.sin(Math.min(1, t * 1.6) * Math.PI) * 36) },
        { scale: (0.3 + 0.7 * Math.min(1, hover.value)) * (1 + (end - 1) * t) },
        { scaleX: (reduced ? 1 : Math.sign(turn || 1) * Math.max(0.12, Math.abs(turn))) * (1 + 0.15 * sq) },
        { scaleY: 1 - 0.2 * sq },
      ],
      opacity: landed ? 0 : Math.min(1, hover.value * 2),
    };
  });
  // A short gold trail behind the diving coin: three fading copies a step behind it.
  const trail = [0.07, 0.14, 0.21].map(lag => ({ lag, alpha: 0.5 - lag * 1.6 }));
  // The veil holds while the coin is in the air and lifts on the hit (the shelf brightens with the landing).
  const dimStyle = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - lift.value) }));
  const brightStyle = useAnimatedStyle(() => ({ opacity: (flashTop > 0 ? 0.16 : 0) * flash.value }));
  const slotStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.6 * pulse.value,
    transform: [{ scale: 1 + 0.12 * pulse.value }],
  }));
  // The white flash in the slot stays at or under the shared cap (flashPeak: 0 with Dim Flashing Lights); the
  // brightness comes from a gold glow that blooms on the hit (a glow, not a flash).
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashTop * flash.value, transform: [{ scale: 0.8 + 0.8 * flash.value }] }));
  // Dim Flashing Lights (or Reduce Motion): no bloom pop at all, like the wash and the flash.
  const bloomStyle = useAnimatedStyle(() => ({ opacity: (flashTop > 0 ? 0.95 : 0) * flash.value, transform: [{ scale: 0.7 + 0.9 * flash.value }] }));
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
    {/* The shelf brightens on the hit (a white wash at most 0.16). */}
    {!reduced && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.bright, brightStyle]} />}
    {/* The slot that is waiting for this coin: a gold ring that glows twice. */}
    {!landed && !reduced && <Animated.View pointerEvents="none" style={[styles.slotRing, {
      left: target.x - 5, top: target.y - 5, width: target.width + 10, height: target.height + 10,
      borderRadius: (target.width + 10) / 2 }, slotStyle]} />}
    {!reduced && <View pointerEvents="none" style={[{ position: 'absolute', left: startX + size / 2, top: startY + size / 2, width: 0, height: 0,
      alignItems: 'center', justifyContent: 'center' }]}>
      <GoldBurst size={size * 2.1} amount={glow} spin={false} reduced={reduced} />
    </View>}
    {!landed && !reduced && trail.map(({ lag, alpha }) => (
      <TrailGhost key={lag} lag={lag} alpha={alpha} progress={progress} hover={hover} dx={dx} dy={dy} end={end}
        left={startX} top={startY} size={size} />
    ))}
    {!landed && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: startX, top: startY, width: size, height: size }, coinStyle]}>
      {/* A gold rim glow: the coin is the brightest thing on the shelf while it flies. */}
      {!reduced && <Image source={SOFT} tintColor={GOLD_FX.glow} contentFit="fill" transition={0}
        style={{ position: 'absolute', left: -size * 0.3, top: -size * 0.3, width: size * 1.6, height: size * 1.6, opacity: 0.95 }} />}
      <Image source={coinUrl} contentFit="contain" onError={placeNow} style={{ width: size, height: size }} transition={0} />
    </Animated.View>}
    {/* On the landing frame: a white-gold flash in the slot, then a gold ring bursts out and sparkles puff wide. */}
    {!reduced && <View pointerEvents="none" style={[styles.at, { left: slotCenter.x, top: slotCenter.y }]}>
      {shiny && <GoldBurst size={target.width * 4.2} amount={rays} spin={false} reduced={reduced}
        style={[styles.raysAt, { left: -target.width * 2.1, top: -target.width * 2.1 }]} />}
      <Animated.View style={[{ position: 'absolute', width: target.width * 2.6, height: target.width * 2.6,
        left: -target.width * 1.3, top: -target.width * 1.3 }, bloomStyle]}>
        <Image source={SOFT} tintColor={GOLD_FX.raysSoft} contentFit="fill" transition={0} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.slotFlash, { width: target.width * 1.5, height: target.width * 1.5, borderRadius: target.width * 0.75,
        left: -target.width * 0.75, top: -target.width * 0.75 }, flashStyle]} />
    </View>}
    {!reduced && <BurstCanvas progress={puff} count={sparkles} radius={target.width * SHELF_LANDING.puffReach}
      ring={target.width * 0.55} starSize={shiny ? 13 : 11} x={slotCenter.x} y={slotCenter.y} />}
    {!reduced && shiny && <BurstCanvas progress={puff} count={0} radius={target.width} ring={target.width * 0.9}
      x={slotCenter.x} y={slotCenter.y} delayed={0.18} />}
    {/* The caption sits at the top of the shelf, over the coins above (never over a section banner such as Coin Guide or
        Limited Coins); only when the slot itself is in that top strip does it go under the slot's plank instead. */}
    <Animated.View style={[styles.chip, target.y > CHIP_CLEAR
      ? { top: 8 } : { top: Math.min(target.frameHeight - 90, target.y + target.height + 34) }, chipStyle]} accessibilityLiveRegion="polite">
      <View style={styles.chipBody}>
      <GameIcon name="coin" size={30} />
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {landed ? 'ON YOUR SHELF' : 'YOUR SOUVENIR HAS A HOME'}
        </Text>
        <Text style={styles.title} numberOfLines={1}>{rideName}</Text>
      </View>
      {/* A picture button (a star and an arrow): see this coin up close. */}
      <Pressable accessibilityRole="button" accessibilityLabel="See this coin up close" style={styles.primary}
        onPress={() => { placeNow(); callbacks.current.onInspect(); }}>
        <GameIcon name="star" size={22} />
        <GameIcon name="arrow" size={18} />
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

/** One step of the coin's gold trail: the same flight, a little behind, fading. */
function TrailGhost({ lag, alpha, progress, hover, dx, dy, end, left, top, size }: {
  readonly lag: number; readonly alpha: number; readonly progress: SharedValue<number>; readonly hover: SharedValue<number>;
  readonly dx: number; readonly dy: number; readonly end: number; readonly left: number; readonly top: number; readonly size: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, progress.value - lag);
    if (progress.value <= lag || progress.value >= 1) return { opacity: 0 };
    return {
      opacity: alpha,
      transform: [
        { translateX: dx * t },
        { translateY: dy * t - Math.sin(Math.min(1, t * 1.6) * Math.PI) * 36 },
        { scale: (0.3 + 0.7 * Math.min(1, hover.value)) * (1 + (end - 1) * t) * 0.92 },
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left, top, width: size, height: size }, style]}>
    <Image source={SOFT} tintColor={GOLD_FX.rays} contentFit="fill" transition={0} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}

/** The caption's own strip at the top of the shelf (its height plus a margin). */
const CHIP_CLEAR = 96;

const styles = StyleSheet.create({
  dim: { backgroundColor: '#05346e' },
  bright: { backgroundColor: '#fffbe8' },
  raysAt: { position: 'absolute' },
  slotRing: { position: 'absolute', borderWidth: 4, borderColor: GOLD_FX.rays },
  at: { position: 'absolute', width: 0, height: 0 },
  slotFlash: { position: 'absolute', backgroundColor: '#fffbe8' },
  // Outer layer carries position and shadow; the body carries the fill so the
  // cream always spans the full chip, close button included.
  chip: { position: 'absolute', left: 14, right: 14, borderRadius: 18, borderBottomWidth: 5,
    borderBottomColor: 'rgba(5,52,110,0.35)', elevation: 8 },
  chipBody: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, paddingLeft: 10, paddingRight: 6,
    borderRadius: 18, borderWidth: 3, borderColor: '#ffffff', backgroundColor: '#fff8e4', overflow: 'hidden' },
  eyebrow: { fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.8, color: '#8a5a00' },
  title: { fontFamily: 'Shark', fontSize: 18, color: '#05346e' },
  primary: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 2, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 12,
    backgroundColor: '#ffcf3b', borderBottomWidth: 3, borderBottomColor: '#d99a00' },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
