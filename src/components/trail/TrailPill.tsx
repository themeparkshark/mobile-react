import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, cancelAnimation } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { boxFraction, headlineBox, milestonesCrossed, missNote, shortSteps, stepsToGo, type TrailState } from '../../services/trail/trailModel';
import { BRAND, SHADOW } from '../../ui';
import TrailBoxArt from './TrailBoxArt';
import { CountUpText } from '../../gamekit/fx/CountUpText';

/**
 * The map's Trail Box pill, in the same capsule language as the Energy pill
 * under it: the box nearest to done rides the left edge, the capsule fills
 * gold as you walk and says how many steps are left. Ready: the capsule turns
 * gold and says OPEN!, and the box hops. A new box earned pops the pill.
 * When a box fills while you watch, the bar sweeps to full and a gold wipe
 * crosses the capsule before OPEN! springs in. At home it reads "3 waiting":
 * home steps never count, so it never says "to go" there.
 */
function TrailPill({ state, active, onPress, inPark = true }: {
  readonly state: TrailState;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly inPark?: boolean;
}) {
  const reduced = useReducedGameMotion();
  const box = headlineBox(state);
  const ready = state.ready.length;
  const fraction = box ? boxFraction(box) : 0;
  const pop = useSharedValue(1);
  const glow = useSharedValue(0);
  const fill = useSharedValue(fraction);
  const count = state.walking.length + state.waiting.length + ready;
  const toGoNow = box && box.status !== 'ready' ? stepsToGo(box) : 0;
  const prev = useRef({ count, fraction, id: box?.id ?? 0, ready, toGo: toGoNow });
  const [sweepSteps, setSweepSteps] = useState<number | null>(null);
  const wipe = useSharedValue(0);
  // What the pill shows as ready: lags behind for the fill-to-full beat.
  const [shownReady, setShownReady] = useState(ready);
  const finishSweep = useCallback((n: number) => {
    setSweepSteps(null);
    setShownReady(n);
    pop.value = withSequence(withTiming(1.22, { duration: 130 }), withSpring(1, { damping: 7, stiffness: 260 }));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, [pop]);

  useEffect(() => {
    const p = prev.current;
    const sameBox = p.id === (box?.id ?? 0);
    const crossed = sameBox ? milestonesCrossed(p.fraction, fraction) : [];
    const earned = count > p.count;
    const newlyReady = ready > p.ready;
    prev.current = { count, fraction, id: box?.id ?? 0, ready, toGo: newlyReady ? p.toGo : toGoNow };
    if (newlyReady && shownReady === 0 && active && !reduced && inPark) {
      // Sweep to full while the number counts down to 0, gold wipe across the capsule, then OPEN! springs in.
      setSweepSteps(p.toGo);
      requestAnimationFrame(() => setSweepSteps(0)); // CountUpText runs 1.1k -> 0 on the UI thread
      fill.value = withTiming(1, { duration: 380 }, () => {
        wipe.value = 0;
        // OPEN! is crossfaded on the UI thread the moment the wipe ends (no JS round trip, no stale frame).
        wipe.value = withTiming(1, { duration: 280 }, done => { if (done) runOnJS(finishSweep)(ready); });
      });
      return;
    }
    if (ready !== shownReady) setShownReady(ready);
    fill.value = reduced ? fraction : withTiming(sameBox ? Math.max(fill.value, fraction) : fraction, { duration: 700 });
    if (!active) return;
    if (earned || newlyReady || crossed.length) {
      if (!reduced) pop.value = withSequence(withTiming(1.18, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 260 }));
      void Haptics.impactAsync(newlyReady ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
  }, [count, fraction, ready, box?.id, active, reduced, pop, fill]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cancelAnimation(glow);
    glow.value = 0;
    if (shownReady && active && !reduced) {
      // About 8 s of pulse, then a steady gold pill (no endless redraw on the map).
      glow.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0, { duration: 650 })), 6);
    }
    return () => cancelAnimation(glow);
  }, [shownReady, active, reduced, glow]);

  const wrapStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.04, Math.min(1, fill.value)) }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.35 + glow.value * 0.65 }));
  const openNowStyle = useAnimatedStyle(() => ({ opacity: wipe.value >= 1 ? 1 : 0 }));
  const wipeStyle = useAnimatedStyle(() => ({ opacity: wipe.value > 0 && wipe.value < 1 ? 1 : 0, transform: [{ translateX: -40 + wipe.value * 160 }, { skewX: '-20deg' }] }));

  const waiting = state.walking.length + state.waiting.length;
  const shown = shownReady ? state.ready.length : 0;
  const home = !inPark && !shown;
  const label = shown ? (shown > 1 ? `OPEN ${shown}` : 'OPEN!') : home ? `${waiting} WAITING` : box && box.status !== 'ready' ? shortSteps(stepsToGo(box)) : box ? shortSteps(prev.current.toGo) : 'Walk';
  const dropped = missNote(state.sync);
  const a11y = home ? `${waiting} Trail ${waiting === 1 ? 'Box waits' : 'Boxes wait'} for your next park day` : dropped && !ready ? `Trail Box: ${box ? stepsToGo(box) : 0} steps to go. Some steps did not count, tap to see why` : ready
    ? `${ready} Trail ${ready === 1 ? 'Box is' : 'Boxes are'} ready to open`
    : box ? `Trail Box: ${stepsToGo(box)} steps to go` : 'Trail Boxes';

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} accessibilityHint="Opens your Trail Boxes"
      hitSlop={6} onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && { transform: [{ scale: 0.96 }] }]}>
      <Animated.View style={[styles.row, wrapStyle]}>
        <View style={[styles.pill, shown ? styles.pillReady : null, home ? styles.pillHome : null]}>
          {!shown && !home && <View style={styles.track}><Animated.View style={[styles.fill, fillStyle]} /></View>}
          {!!shown && <Animated.View style={[StyleSheet.absoluteFill, styles.glow, glowStyle]} />}
          <Animated.View pointerEvents="none" style={[styles.wipe, wipeStyle]} />
          {sweepSteps != null && (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.openNow, openNowStyle]}>
              <Text style={[styles.count, styles.countReady]}>OPEN!</Text>
            </Animated.View>
          )}
          {sweepSteps != null
            ? <CountUpText value={sweepSteps} durationMs={380} punch={1} format="short" style={styles.countUp} />
            : <Text style={[styles.count, shown ? styles.countReady : null, home ? styles.countHome : null]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>}
          {!shown && !home && !!box && <Text style={styles.unit}>steps to go</Text>}
        </View>
        {!!missNote(state.sync) && !shown && !home && <View style={styles.dot} accessibilityElementsHidden />}
        <View style={styles.icon}>
          {box ? <TrailBoxArt tier={box.tier} size={38} fraction={fraction} ready={!!shown} active={active} />
            : <TrailBoxArt tier="blue" size={38} dim active={false} />}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default memo(TrailPill);

const styles = StyleSheet.create({
  wrap: { height: 40, justifyContent: 'center' },
  row: { height: 40, justifyContent: 'center' },
  pill: { height: 30, minWidth: 96, marginLeft: 16, paddingLeft: 26, paddingRight: 10, borderRadius: 15, overflow: 'hidden',
    backgroundColor: BRAND.blueBright, borderWidth: 2.5, borderColor: BRAND.white, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-start', ...SHADOW.card },
  pillReady: { backgroundColor: BRAND.gold, borderColor: BRAND.white },
  pillHome: { backgroundColor: BRAND.blue },
  openNow: { backgroundColor: BRAND.gold, alignItems: 'center', justifyContent: 'center', paddingLeft: 26 },
  countUp: { fontSize: 18, padding: 0, marginBottom: 3, width: 46, textAlign: 'left', fontVariant: ['tabular-nums'], textShadowOffset: { width: 1, height: 2 } },
  countHome: { fontSize: 15 },
  wipe: { position: 'absolute', top: -4, bottom: -4, left: 0, width: 26, backgroundColor: BRAND.goldLight },
  track: { position: 'absolute', left: 24, right: 10, bottom: 3, height: 5, borderRadius: 3, backgroundColor: BRAND.blueLip, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, right: 0, borderRadius: 3, backgroundColor: BRAND.gold, transformOrigin: 'left' },
  glow: { backgroundColor: BRAND.goldLight },
  count: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white, marginBottom: 3, minWidth: 46, textAlign: 'left', fontVariant: ['tabular-nums'],
    textShadowColor: BRAND.navy, textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 0 },
  countReady: { color: BRAND.navy, textShadowColor: BRAND.white, textShadowOffset: { width: 0, height: 1 } },
  unit: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.white, marginLeft: 3, marginBottom: 1 },
  icon: { position: 'absolute', left: -2, top: -1 },
  dot: { position: 'absolute', right: -3, top: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: BRAND.red,
    borderWidth: 2, borderColor: BRAND.white },
});
