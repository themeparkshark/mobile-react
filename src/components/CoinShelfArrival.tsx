import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, PaintStyle, Picture, Skia, TileMode, createPicture, vec } from '@shopify/react-native-skia';
import Animated, {
  cancelAnimation, Easing, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, type SharedValue,
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
import { burstStars, drawBurst } from './park/BurstCanvas';
import { perfMark } from './park/momentPerf';
import { SHELF_LANDING } from './shelfLanding';


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
  // The veil holds while the coin is in the air and lifts on the hit (the shelf brightens with the landing).
  const dimStyle = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - lift.value) }));
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
    {/* Every glow, ring, trail, flash and burst of the landing in ONE Skia canvas (one picture per UI frame). */}
    {!reduced && <ShelfLandingCanvas width={target.frameWidth} height={target.frameHeight} progress={progress} hover={hover}
      pulse={pulse} glow={glow} flash={flash} puff={puff} flashTop={flashTop} sparkles={sparkles} shiny={shiny}
      startX={startX} startY={startY} size={size} dx={dx} dy={dy} end={end} slot={slotCenter} slotWidth={target.width} />}
    {!landed && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: startX, top: startY, width: size, height: size }, coinStyle]}>
      <Image source={coinUrl} contentFit="contain" onError={placeNow} style={{ width: size, height: size }} transition={0} />
    </Animated.View>}
    {/* The rare shiny landing: gold rays behind the slot (about 1 in 10). */}
    {!reduced && shiny && <View pointerEvents="none" style={[styles.at, { left: slotCenter.x, top: slotCenter.y }]}>
      <GoldBurst size={target.width * 4.2} amount={rays} spin={false} reduced={reduced}
        style={[styles.raysAt, { left: -target.width * 2.1, top: -target.width * 2.1 }]} />
    </View>}
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

/**
 * The landing's light, drawn on the UI thread in one canvas: the gold ring that pulses on the
 * empty slot, the gold glow around the hovering coin (it rides the coin), a three-step gold
 * trail behind the dive, the gold bloom and the capped white flash on the hit, and the ring and
 * star burst from the slot (a second ring on a shiny landing). Replaces nine separate animated
 * views and two canvases, so the dive and the hit cost one picture per frame.
 */
function ShelfLandingCanvas({ width, height, progress, hover, pulse, glow, flash, puff, flashTop, sparkles, shiny,
  startX, startY, size, dx, dy, end, slot, slotWidth }: {
  readonly width: number; readonly height: number;
  readonly progress: SharedValue<number>; readonly hover: SharedValue<number>; readonly pulse: SharedValue<number>;
  readonly glow: SharedValue<number>; readonly flash: SharedValue<number>; readonly puff: SharedValue<number>;
  readonly flashTop: number; readonly sparkles: number; readonly shiny: boolean;
  readonly startX: number; readonly startY: number; readonly size: number; readonly dx: number; readonly dy: number;
  readonly end: number; readonly slot: { readonly x: number; readonly y: number }; readonly slotWidth: number;
}) {
  const stars = useMemo(() => burstStars(sparkles, shiny ? 13 : 11), [sparkles, shiny]);
  const gold = useMemo(() => Skia.Color(GOLD_FX.rays), []);
  const picture = useDerivedValue(() => createPicture(canvas => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const t = progress.value;
    const cx0 = startX + size / 2, cy0 = startY + size / 2;
    const at = (k: number) => {
      'worklet';
      return { x: cx0 + dx * k, y: cy0 + dy * k - Math.sin(Math.min(1, k * 1.6) * Math.PI) * 36,
        s: (0.3 + 0.7 * Math.min(1, hover.value)) * (1 + (end - 1) * k) };
    };
    const soft = (x: number, y: number, r: number, color: string, alpha: number) => {
      'worklet';
      if (alpha <= 0.01 || r <= 0.5) return;
      paint.setShader(Skia.Shader.MakeRadialGradient(vec(x, y), r,
        [Skia.Color(color), Skia.Color('rgba(255,207,59,0)')], [0.35, 1], TileMode.Clamp));
      paint.setAlphaf(Math.min(1, alpha));
      canvas.drawCircle(x, y, r, paint);
      paint.setShader(null);
      paint.setAlphaf(1);
    };
    // 1. The empty slot glows gold twice.
    if (t < 1 && pulse.value > 0.001) {
      const ring = Skia.Paint();
      ring.setAntiAlias(true);
      ring.setStyle(PaintStyle.Stroke);
      ring.setStrokeWidth(4);
      ring.setColor(gold);
      ring.setAlphaf(0.3 + 0.6 * pulse.value);
      canvas.drawCircle(slot.x, slot.y, ((slotWidth + 10) / 2) * (1 + 0.12 * pulse.value), ring);
    }
    // 2. The gold glow rides the hovering coin and fades as it dives.
    if (t < 1) {
      const p = at(t);
      soft(p.x, p.y, size * 0.85 * p.s, GOLD_FX.glow, 0.95 * Math.min(1, hover.value * 2) * (1 - 0.6 * t));
      soft(p.x, p.y, size * 1.05 * p.s, GOLD_FX.glow, glow.value);
      // 3. A short gold trail a step behind the dive.
      for (let i = 1; i <= 3; i += 1) {
        const lag = i * 0.07;
        if (t > lag) {
          const q = at(t - lag);
          soft(q.x, q.y, size * 0.5 * q.s * 0.92, GOLD_FX.rays, 0.5 - lag * 1.6);
        }
      }
    }
    // 4. The hit: a gold bloom (a glow, not a flash) and a white flash at or under the shared cap.
    const f = flash.value;
    if (f > 0.001 && flashTop > 0) {
      soft(slot.x, slot.y, slotWidth * 1.3 * (0.7 + 0.9 * f), GOLD_FX.raysSoft, 0.95 * f);
      paint.setColor(Skia.Color('#fffbe8'));
      paint.setAlphaf(flashTop * f);
      canvas.drawCircle(slot.x, slot.y, slotWidth * 0.75 * (0.8 + 0.8 * f), paint);
      paint.setAlphaf(1);
    }
    // 5. The ring and the stars burst from the slot (a second ring on a shiny landing).
    const b = puff.value;
    if (b > 0 && b < 1) {
      drawBurst(canvas, b, slot.x, slot.y, stars, slotWidth * SHELF_LANDING.puffReach, slotWidth * 0.55, 0);
      if (shiny) drawBurst(canvas, b, slot.x, slot.y, [], slotWidth, slotWidth * 0.9, 0.18);
    }
  }, { width, height }));
  return <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas>;
}

/** The caption's own strip at the top of the shelf (its height plus a margin). */
const CHIP_CLEAR = 96;

const styles = StyleSheet.create({
  dim: { backgroundColor: '#05346e' },
  raysAt: { position: 'absolute' },
  at: { position: 'absolute', width: 0, height: 0 },
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
