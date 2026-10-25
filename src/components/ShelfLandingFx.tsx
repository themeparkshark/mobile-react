/**
 * The shelf around a coin that just landed: its neighbours jiggle outward like
 * dominoes, and a full row celebrates: a gold-and-white light bar sweeps
 * across it, each coin hops as the bar reaches it with a tick that climbs the
 * coin ladder, the plank glows gold for a beat, and a five-pip "row done"
 * badge pops on the plank's end (pictures only). One-shot UI-thread animations
 * keyed to the landing (nothing loops, nothing runs at rest). Reduce Motion:
 * no travel; the badge simply shows and the chime and buzz stay.
 */
import { Canvas, Picture, Skia, TileMode, createPicture, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue,
} from 'react-native-reanimated';
import { withDelay, withSequence, withSpring, withTiming } from './park/momentTime';
import { queueHaptic } from '../gamekit/Haptics';
import { playMoment } from '../gamekit/audio/playMoment';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import GameIcon from '../ui/GameIcon';
import { Easing } from 'react-native-reanimated';
import { EASE, SPRING } from '../ui/motionEasing';
import { SHELF_LANDING, jiggleAmount, jiggleDelay, jiggleDirection, rowBarTiming, rowHopDelay } from './shelfLanding';

/** One rung of the row's tick ladder: the sound climbs one step per coin, a light tick in the hand. */
function rowTick(step: number) {
  playMoment('ui.counterTick', { step });
  queueHaptic('tickSelection');
}

/**
 * Wraps one shelf slot. `landingKey` changes when a coin lands in this row; `distance` is slots from it.
 * `rowWaveKey` (a completed row) makes every coin hop in turn as the light bar passes, `index` left to right.
 */
export function ShelfJiggle({ landingKey, distance, rowWaveKey, index = 0, children }: {
  readonly landingKey?: string | null; readonly distance: number; readonly rowWaveKey?: string | null; readonly index?: number;
  readonly children: ReactNode;
}) {
  const reduced = useReducedGameMotion();
  const tip = useSharedValue(0);
  const hop = useSharedValue(0);
  const wave = useSharedValue(0);
  const delay = jiggleDelay(distance);
  useEffect(() => {
    if (!landingKey || delay === null || reduced) return undefined;
    const dir = jiggleDirection(distance);
    const { deg, hop: lift } = jiggleAmount(distance);
    tip.value = withDelay(delay, withSequence(
      withTiming(dir * deg, { duration: 90, easing: EASE.out }),
      withSpring(0, SPRING.stamp)));
    hop.value = withDelay(delay, withSequence(withTiming(lift, { duration: 90, easing: EASE.out }), withSpring(0, SPRING.land)));
    return () => { cancelAnimation(tip); cancelAnimation(hop); };
  }, [landingKey, delay, distance, reduced, tip, hop]);
  useEffect(() => {
    if (!rowWaveKey || reduced) return undefined;
    // The hop and its tick start on the same UI frame (the tick rides the hop's first step).
    // A real arc you can see on every coin: up (EASE.out), down (EASE.in), a small squash on the plank, settle.
    wave.value = withDelay(rowHopDelay(index), withSequence(
      withTiming(1, { duration: SHELF_LANDING.rowHopUpMs, easing: EASE.out }, ok => { if (ok) runOnJS(rowTick)(index); }),
      withTiming(-0.12, { duration: SHELF_LANDING.rowHopDownMs, easing: EASE.in }),
      withSpring(0, SPRING.land)));
    return () => cancelAnimation(wave);
  }, [rowWaveKey, index, reduced, wave]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -hop.value - SHELF_LANDING.rowHopPt * Math.max(0, wave.value) },
      { rotate: `${tip.value + 6 * Math.max(0, wave.value) * (index % 2 ? 1 : -1)}deg` },
      { scaleX: 1 + 0.12 * Math.max(0, wave.value) + 0.8 * Math.max(0, -wave.value) },
      { scaleY: 1 + 0.12 * Math.max(0, wave.value) - 0.8 * Math.max(0, -wave.value) },
    ],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** The shelf plank under a landing coin kicks down a couple of points and springs back (the weight of the coin). */
export function ShelfKick({ landingKey, children }: { readonly landingKey?: string | null; readonly children: ReactNode }) {
  const reduced = useReducedGameMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!landingKey || reduced) return undefined;
    y.value = withSequence(withTiming(SHELF_LANDING.kickPt, { duration: 50, easing: EASE.out }), withSpring(0, SPRING.stamp));
    return () => cancelAnimation(y);
  }, [landingKey, reduced, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** The row is full: a tier-up chime and the win buzz on the frame the shine starts (from the UI clock). */
function rowCompleteCue() {
  queueHaptic('success');
  playMoment('reward.levelUp');
}

/**
 * A just-completed row celebrates, over the coins: one bright gold-and-white light bar sweeps across it,
 * the plank glows gold for a beat, and a five-pip "row done" pill pops onto the plank (inside the shelf
 * panel) with one shine across it. The bar and the plank glow are one small Skia canvas (one picture per
 * frame). It mounts with the shelf (`armed`, hidden) so nothing new mounts on the landing frame.
 */
export function RowShine({ landingKey, armed = false, width, height, slots = 5 }: {
  readonly landingKey?: string | null;
  /** Mount early (hidden) when this row will complete with the arriving coin. */
  readonly armed?: boolean;
  readonly width: number;
  /** The row's height (the canvas covers the coins and the plank). */
  readonly height: number;
  readonly slots?: number;
}) {
  const reduced = useReducedGameMotion();
  const t = useSharedValue(0);
  const glow = useSharedValue(0);
  const badge = useSharedValue(0);
  const gleam = useSharedValue(0);
  const spark = useSharedValue(0);
  const band = Math.max(70, width * 0.3);
  // The bar crosses the whole plank at an even speed and passes each coin on the top of its hop (rowBarTiming).
  const bar = rowBarTiming(width, slots, band);
  useEffect(() => {
    if (!landingKey) return undefined;
    if (reduced) { rowCompleteCue(); badge.value = 1; return undefined; }
    t.value = 0;
    t.value = withDelay(bar.startAt, withTiming(1, { duration: bar.durationMs, easing: Easing.linear }));
    glow.value = withDelay(SHELF_LANDING.shineAfterMs, withSequence(withTiming(1, { duration: 200, easing: EASE.out }),
      withDelay(SHELF_LANDING.plankGlowMs - 400, withTiming(0, { duration: 400, easing: EASE.in }))));
    badge.value = withDelay(SHELF_LANDING.badgeAt, withSpring(1, SPRING.pop));
    gleam.value = withDelay(SHELF_LANDING.badgeAt + 160, withTiming(1, { duration: 420, easing: EASE.inOut }));
    spark.value = withDelay(SHELF_LANDING.badgeAt + 90, withTiming(1, { duration: 460, easing: EASE.out }));
    return () => { cancelAnimation(t); cancelAnimation(glow); cancelAnimation(badge); cancelAnimation(gleam); cancelAnimation(spark); };
    // The bar timing follows the row's size, fixed for a landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landingKey, reduced, t, glow, badge, gleam, spark]);
  // The cue rides the same UI clock as the band: it fires when the band first moves.
  const started = useSharedValue(0);
  useEffect(() => {
    if (!landingKey || reduced) return undefined;
    started.value = 0;
    started.value = withDelay(bar.startAt, withTiming(1, { duration: 16 }, ok => { if (ok) runOnJS(rowCompleteCue)(); }));
    return () => cancelAnimation(started);
  }, [landingKey, reduced, started, bar.startAt]);
  // The plank glow and the light bar are built once (paints, gradients and the bar's shape); each frame only moves
  // the bar and sets an alpha.
  const art = useMemo(() => {
    const plank = Skia.Paint();
    plank.setAntiAlias(true);
    plank.setShader(Skia.Shader.MakeLinearGradient(vec(0, height - 34), vec(0, height),
      [Skia.Color('rgba(255,207,59,0)'), Skia.Color('rgba(255,207,59,0.9)'), Skia.Color('rgba(255,246,207,0.95)')],
      [0, 0.55, 1], TileMode.Clamp));
    const light = Skia.Paint();
    light.setAntiAlias(true);
    light.setShader(Skia.Shader.MakeLinearGradient(vec(0, 0), vec(band, 0),
      [Skia.Color('rgba(255,236,150,0)'), Skia.Color('rgba(255,236,150,0.7)'), Skia.Color('rgba(255,255,255,1)'),
        Skia.Color('rgba(255,236,150,0.7)'), Skia.Color('rgba(255,236,150,0)')], [0, 0.3, 0.5, 0.7, 1], TileMode.Clamp));
    const path = Skia.Path.Make();
    const skew = height * 0.32;
    path.moveTo(skew, 0); path.lineTo(band + skew, 0); path.lineTo(band - skew, height); path.lineTo(-skew, height);
    path.close();
    return { plank, light, path, plankRect: Skia.XYWHRect(0, height - 34, width, 34) };
  }, [band, height, width]);
  const picture = useDerivedValue(() => createPicture(canvas => {
    const g = glow.value, p = t.value;
    if (g > 0.01) {
      // The plank glows gold under the coins.
      art.plank.setAlphaf(0.85 * g);
      canvas.drawRect(art.plankRect, art.plank);
    }
    if (p > 0 && p < 1) {
      // One skewed gold-and-white bar of light sweeping across the whole row, left to right.
      canvas.save();
      canvas.translate(-band + (width + band) * p, 0);
      canvas.drawPath(art.path, art.light);
      canvas.restore();
    }
  }, { width, height }));
  // The pill springs up from small with one overshoot (SPRING.pop) and a sparkle twinkles on its corner.
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, badge.value * 2.5),
    transform: [{ scale: reduced ? 1 : 0.35 + 0.65 * badge.value }],
  }));
  const sparkStyle = useAnimatedStyle(() => {
    const k = spark.value;
    if (k <= 0 || k >= 1) return { opacity: 0 };
    return { opacity: k < 0.7 ? 1 : (1 - k) / 0.3, transform: [{ scale: k < 0.3 ? 1.3 * (k / 0.3) : 1.3 - 0.6 * ((k - 0.3) / 0.7) }, { rotate: `${120 * k}deg` }] };
  });
  const gleamStyle = useAnimatedStyle(() => ({
    opacity: gleam.value > 0 && gleam.value < 1 ? 1 : 0,
    transform: [{ translateX: -24 + 160 * gleam.value }, { rotate: '18deg' }],
  }));
  if (!landingKey && !armed) return null;
  return <>
    {!reduced && <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}><Picture picture={picture} /></Canvas>}
    {/* "Row done" with zero words: five gold pips on a gold-rimmed pill sitting on the plank. */}
    <Animated.View pointerEvents="none" style={[styles.badge, badgeStyle]} accessible={!!landingKey}
      accessibilityLabel={`Row complete, ${slots} of ${slots}`}>
      {Array.from({ length: slots }, (_, i) => <View key={i} style={styles.pip} />)}
      {!reduced && <Animated.View style={[styles.gleam, gleamStyle]} />}
    </Animated.View>
    {!reduced && <Animated.View pointerEvents="none" style={[styles.spark, sparkStyle]}><GameIcon name="sparkle" size={30} /></Animated.View>}
  </>;
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', borderRadius: 14 },
  // On the plank, inside the shelf panel: cream with a gold rim (never a dark tab hanging off the edge).
  // Wave 5 round 2: 1.5x the old pill (14 pt pips), so "row done" reads at a glance.
  badge: { position: 'absolute', right: 8, bottom: 4, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 16, backgroundColor: '#fff8e4', borderWidth: 3, borderColor: '#e9a800', overflow: 'hidden',
    shadowColor: '#05346e', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 3 }, shadowRadius: 0 },
  pip: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#ffcf3b', borderWidth: 2, borderColor: '#c88a00' },
  gleam: { position: 'absolute', top: -8, bottom: -8, width: 16, backgroundColor: 'rgba(255,255,255,0.85)' },
  spark: { position: 'absolute', right: -2, bottom: 26 },
});
