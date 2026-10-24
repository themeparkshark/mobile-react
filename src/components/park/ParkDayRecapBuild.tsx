/**
 * The park day recap builds itself in front of you, like a day being added
 * up: the header sky warms from day blue to a gold-and-sky sunset, the title
 * stamps in, each stat is a picture (a ride, a coin, a level-up star) that
 * pops while a little gold coin flies into it, and its number stamps down (a
 * small day) or counts up (a big one), a tick each, the ladder climbing. The
 * best coin of the day drops in like a polaroid, a big gold-rimmed stamp lands
 * with a sparkle burst ("Great day at Disneyland!") and a Tomorrow chip points
 * at the next goal (today's Daily 3 streak, honest, no timer). A tap anywhere
 * on the card skips to the end.
 *
 * One-shot UI-thread animations, one build per park day per card (never a
 * loop). The haptics and ticks fire from the UI clock on their frames. The
 * build waits until the card is on screen, checked only when the shelf scrolls
 * (notifyRecapViewport), never by polling. Reduce Motion: everything is simply
 * there; the closing haptic stays.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { CountUpText } from '../../gamekit/fx/CountUpText';
import { playHaptic, queueHaptic } from '../../gamekit/Haptics';
import { playMoment } from '../../gamekit/audio/playMoment';
import { useReduceMotionPreference } from '../../hooks/useReducedGameMotion';
import { usePowerBudget } from '../../power';
import { SparkleBurst } from '../../ui/GoldBurst';
import GameIcon, { type GameIconName } from '../../ui/GameIcon';
import { DURATION, EASE, GOLD_FX, SPRING, momentParticles } from '../../ui/motionEasing';
import { SLAM_SQUASH } from '../../ui/motion';
import { BRAND } from '../../ui/tokens';
import { RECAP_BUILD, recapStatAt, statStamps } from './recapBuildPlan';

export interface RecapBuild {
  /** Changes once per build; null when there is nothing to build (or it already played). */
  readonly key: string | null;
  /** The kid tapped to skip, or Reduce Motion: show the end state. */
  readonly instant: boolean;
  /** Waiting for the card to scroll into view: hold the first frame. */
  readonly hold: boolean;
  readonly skip: () => void;
}

const played = new Set<string>();
if (__DEV__) {
  // QA: let the next recap card build again (lane.sh eval 'globalThis.__tpsRecapReset()').
  (globalThis as Record<string, unknown>).__tpsRecapReset = () => { played.clear(); return 'reset'; };
}
const VISIBLE_WAIT_MS = 120_000;

/** Listeners that want to know when the shelf scrolled (the recap waits to be seen). */
const viewportListeners = new Set<() => void>();
/** The shelf calls this from its scroll events: any waiting recap card checks once whether it is on screen. */
export function notifyRecapViewport(): void {
  viewportListeners.forEach(listener => listener());
}

/**
 * One build per park day per app run: coming back to the shelf shows the finished card.
 * The build waits until the card is actually on screen (the recap sits under the shelf): it looks once at
 * mount and then only when the shelf scrolls (no polling), for at most VISIBLE_WAIT_MS.
 */
export function useRecapBuild(dayKey: string | null, cardRef?: RefObject<View | null>): RecapBuild {
  const preference = useReduceMotionPreference();
  const { height } = useWindowDimensions();
  const [key, setKey] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  useEffect(() => {
    if (!dayKey || preference === null) return undefined;
    if (played.has(dayKey)) { setKey(current => (current === dayKey ? current : null)); return undefined; }
    let active = true;
    const start = () => {
      if (!active || played.has(dayKey)) return;
      active = false;
      viewportListeners.delete(look);
      clearTimeout(giveUp);
      played.add(dayKey);
      setSkipped(false);
      setKey(dayKey);
    };
    function look() {
      if (!active) return;
      cardRef?.current?.measureInWindow((_x, y, _w, h) => {
        if (active && Number.isFinite(y) && h > 0 && y < height - 140 && y + h > 120) start();
      });
    }
    if (!cardRef) { start(); return undefined; }
    viewportListeners.add(look);
    const giveUp = setTimeout(() => { active = false; viewportListeners.delete(look); setGaveUp(dayKey); }, VISIBLE_WAIT_MS);
    // One look once the card has laid out (it may already be on screen).
    const first = setTimeout(look, 120);
    return () => { active = false; viewportListeners.delete(look); clearTimeout(giveUp); clearTimeout(first); };
  }, [dayKey, preference, cardRef, height]);
  const skip = useCallback(() => setSkipped(true), []);
  // Today's build has not started yet (not seen, or the Reduce Motion answer is still coming): the card holds its
  // starting frame from its very first render, so it never flashes the finished card and then empties.
  // A tap still shows it all; a card never scrolled to within VISIBLE_WAIT_MS simply shows.
  const pending = !!dayKey && key !== dayKey && gaveUp !== dayKey && !played.has(dayKey);
  const hold = pending && !skipped;
  return { key, hold, instant: !hold && (preference === true || skipped || key === null), skip };
}

/** A one-shot beat on the UI clock: `run` fires on JS on the frame `at` ms after the build starts. */
function useBeat(build: RecapBuild, at: number, run: (() => void) | undefined) {
  const beat = useSharedValue(0);
  const runRef = useRef(run); runRef.current = run;
  const fire = useCallback(() => runRef.current?.(), []);
  useEffect(() => {
    if (build.instant || build.hold || !runRef.current) return undefined;
    beat.value = 0;
    beat.value = withDelay(at, withTiming(1, { duration: 16 }, ok => { if (ok) runOnJS(fire)(); }));
    return () => cancelAnimation(beat);
  }, [build.key, build.instant, build.hold, at, beat, fire]);
}

/** The header sky: day blue warming into a gold sunset. */
export function RecapSky({ build }: { readonly build: RecapBuild }) {
  const t = useSharedValue(build.instant ? 1 : 0);
  useEffect(() => {
    if (build.instant) { cancelAnimation(t); t.value = 1; return undefined; }
    t.value = 0;
    if (build.hold) return undefined;
    t.value = withTiming(1, { duration: RECAP_BUILD.skyMs, easing: EASE.inOut });
    return () => cancelAnimation(t);
  }, [build.key, build.instant, build.hold, t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.9 * t.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
    <LinearGradient colors={['#0875c9', '#3f9be0', '#ffd96b', GOLD_FX.rays]} locations={[0, 0.4, 0.82, 1]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}

/** A label that stamps down from oversize with a little squash. */
export function RecapStamp({ build, at, from = 1.6, children, onLand }: {
  readonly build: RecapBuild; readonly at: number; readonly from?: number; readonly children: ReactNode;
  readonly onLand?: () => void;
}) {
  const p = useSharedValue(build.instant ? 1 : 0);
  const squash = useSharedValue(0);
  useBeat(build, at + DURATION.slam, onLand);
  useEffect(() => {
    if (build.instant) { cancelAnimation(p); p.value = 1; squash.value = 0; return undefined; }
    p.value = 0;
    if (build.hold) return undefined;
    p.value = withDelay(at, withTiming(1, { duration: DURATION.slam, easing: EASE.in }));
    squash.value = withDelay(at + DURATION.slam, withSequence(withTiming(1, { duration: 40 }), withSpring(0, SPRING.stamp)));
    return () => { cancelAnimation(p); cancelAnimation(squash); };
  }, [build.key, build.instant, build.hold, at, p, squash]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 3),
    transform: [{ scale: from - (from - 1) * p.value }, { scaleX: 1 + SLAM_SQUASH * squash.value }, { scaleY: 1 - SLAM_SQUASH * squash.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * One stat as a picture: the icon pops (SPRING.pop, past full size) as a little gold coin flies into it,
 * then the number stamps down (a small day: 0 to 3) or counts up (a bigger one), with a tick that climbs
 * the coin ladder one step per stat.
 */
export function RecapStat({ build, index, value, label, icon, valueStyle, labelStyle }: {
  readonly build: RecapBuild; readonly index: number; readonly value: number; readonly label: string;
  readonly icon: GameIconName;
  readonly valueStyle?: StyleProp<TextStyle>; readonly labelStyle?: StyleProp<TextStyle>;
}) {
  const at = recapStatAt(index);
  const stamp = statStamps(value);
  const pop = useSharedValue(build.instant ? 1 : 0);
  const fly = useSharedValue(build.instant ? 1 : 0);
  const num = useSharedValue(build.instant ? 1 : 0);
  const squash = useSharedValue(0);
  const [shown, setShown] = useState(build.instant ? value : 0);
  useBeat(build, at, () => {
    if (!stamp) setShown(value);
    queueHaptic('tickSelection');
    playMoment('ui.counterTick', { step: index * 2 });
  });
  useEffect(() => {
    if (build.instant) { [pop, fly, num].forEach(v => { cancelAnimation(v); v.value = 1; }); setShown(value); return undefined; }
    pop.value = 0; fly.value = 0; num.value = 0;
    setShown(stamp ? value : 0);
    if (build.hold) return undefined;
    fly.value = withDelay(Math.max(0, at - RECAP_BUILD.flyInMs), withTiming(1, { duration: RECAP_BUILD.flyInMs, easing: EASE.in }));
    pop.value = withDelay(at, withSpring(1, SPRING.pop));
    num.value = withDelay(at + 90, withTiming(1, { duration: DURATION.slam, easing: EASE.in }));
    squash.value = withDelay(at + 90 + DURATION.slam, withSequence(withTiming(1, { duration: 40 }), withSpring(0, SPRING.stamp)));
    return () => { [pop, fly, num, squash].forEach(v => cancelAnimation(v)); };
  }, [build.key, build.instant, build.hold, at, value, stamp, pop, fly, num, squash]);
  const iconStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 2),
    transform: [{ scale: Math.max(0, pop.value) }],
  }));
  const coinStyle = useAnimatedStyle(() => {
    const t = fly.value;
    if (t <= 0 || t >= 1) return { opacity: 0 };
    return { opacity: 1, transform: [{ translateX: -26 * (1 - t) }, { translateY: -40 * (1 - t) + -18 * Math.sin(t * Math.PI) }, { scale: 0.6 + 0.4 * t }] };
  });
  const numStyle = useAnimatedStyle(() => (stamp ? {
    opacity: Math.min(1, num.value * 3),
    transform: [{ scale: 1.8 - 0.8 * num.value }, { scaleX: 1 + SLAM_SQUASH * squash.value }, { scaleY: 1 - SLAM_SQUASH * squash.value }],
  } : { opacity: 1 }));
  return <View style={styles.stat} accessible accessibilityLabel={`${value} ${label.toLowerCase()}`}>
    <View style={styles.statIconSlot}>
      <Animated.View style={iconStyle}><GameIcon name={icon} size={30} /></Animated.View>
      <Animated.View pointerEvents="none" style={[styles.flyCoin, coinStyle]}><GameIcon name="coin" size={16} /></Animated.View>
    </View>
    <Animated.View style={numStyle}>
      {stamp
        ? <Text style={valueStyle} allowFontScaling={false}>{value}</Text>
        : <CountUpText value={shown} durationMs={DURATION.count} reducedMotion={build.instant} punch={1.12} style={valueStyle} />}
    </Animated.View>
    <Text style={labelStyle}>{label}</Text>
  </View>;
}

/** The best coin of the day dropping in like a polaroid. */
export function RecapPolaroid({ build, coinUrl, isNew }: { readonly build: RecapBuild; readonly coinUrl: string; readonly isNew: boolean }) {
  const t = useSharedValue(build.instant ? 1 : 0);
  useEffect(() => {
    if (build.instant) { cancelAnimation(t); t.value = 1; return undefined; }
    t.value = 0;
    if (build.hold) return undefined;
    t.value = withDelay(RECAP_BUILD.polaroidAt, withSpring(1, SPRING.land));
    return () => cancelAnimation(t);
  }, [build.key, build.instant, build.hold, t]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 3),
    transform: [{ translateY: -46 * (1 - t.value) }, { rotate: `${-4 + 6 * t.value}deg` }, { scale: 0.7 + 0.3 * t.value }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.polaroid, style]}>
    <View style={styles.photo}>
      <Image source={coinUrl} style={styles.coin} contentFit="contain" transition={0} />
    </View>
    {isNew && <View style={styles.newTag}><Text style={styles.newText}>NEW</Text></View>}
  </Animated.View>;
}

/** The closing stamp: "Great day at Disneyland!" lands big with a gold rim, a sparkle burst and the golden haptic. */
export function RecapClosingStamp({ build, parkName }: { readonly build: RecapBuild; readonly parkName: string }) {
  const reduced = useReduceMotionPreference() === true;
  const budget = usePowerBudget();
  const burst = useSharedValue(build.instant ? 1 : 0);
  const sparkles = momentParticles(RECAP_BUILD.stampSparkles, budget, reduced || build.instant);
  const onLand = useCallback(() => {
    playHaptic('golden');
    playMoment('game.win');
    burst.value = 0;
    burst.value = withTiming(1, { duration: DURATION.sparkle });
  }, [burst]);
  return <View pointerEvents="none" style={styles.closing}>
    <RecapStamp build={build} at={RECAP_BUILD.stampAt} from={1.8} onLand={build.instant ? undefined : onLand}>
      <View style={styles.stampRim}>
        <View style={styles.stampBody}>
          <GameIcon name="star" size={22} />
          <Text style={styles.stampText} numberOfLines={1} adjustsFontSizeToFit>{`Great day at ${parkName}!`}</Text>
        </View>
      </View>
    </RecapStamp>
    <View style={styles.stampBurst}><SparkleBurst progress={burst} count={sparkles} radius={120} /></View>
  </View>;
}

/** What comes next, honest and with no timer: tomorrow's Daily 3 day (the flame) or nothing at all. */
export function RecapTomorrow({ build, line }: { readonly build: RecapBuild; readonly line: string | null }) {
  const t = useSharedValue(build.instant ? 1 : 0);
  useEffect(() => {
    if (build.instant) { cancelAnimation(t); t.value = 1; return undefined; }
    t.value = 0;
    if (build.hold) return undefined;
    t.value = withDelay(RECAP_BUILD.tomorrowAt, withSpring(1, SPRING.settle));
    return () => cancelAnimation(t);
  }, [build.key, build.instant, build.hold, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateY: 12 * (1 - t.value) }] }));
  if (!line) return null;
  return <Animated.View style={[styles.tomorrow, style]}>
    <GameIcon name="streak" size={24} />
    <Text style={styles.tomorrowText} numberOfLines={2}>{line}</Text>
  </Animated.View>;
}

const styles = StyleSheet.create({
  stat: { flex: 1, alignItems: 'center' },
  statIconSlot: { width: 36, height: 34, alignItems: 'center', justifyContent: 'center' },
  flyCoin: { position: 'absolute', right: -2, top: 0 },
  polaroid: { position: 'absolute', right: 8, top: 8, width: 66, padding: 5, paddingBottom: 12, backgroundColor: BRAND.white,
    borderRadius: 4, shadowColor: '#05346e', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  photo: { height: 56, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center' },
  coin: { width: 48, height: 48 },
  newTag: { position: 'absolute', bottom: -8, alignSelf: 'center', backgroundColor: BRAND.gold, borderRadius: 8,
    borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 6 },
  newText: { fontFamily: 'Shark', fontSize: 10, color: BRAND.navy },
  closing: { alignItems: 'center', marginTop: 8, marginBottom: 2 },
  stampRim: { borderRadius: 16, borderWidth: 3, borderColor: GOLD_FX.rays, padding: 2, transform: [{ rotate: '-3deg' }],
    backgroundColor: BRAND.white, shadowColor: GOLD_FX.glow, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  stampBody: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.gold, borderRadius: 12, borderWidth: 3,
    borderColor: BRAND.navy, paddingHorizontal: 14, paddingVertical: 6 },
  stampText: { fontFamily: 'Shark', fontSize: 21, color: BRAND.navy, flexShrink: 1 },
  stampBurst: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  tomorrow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, backgroundColor: BRAND.blue, borderRadius: 14,
    borderWidth: 3, borderColor: BRAND.white, paddingHorizontal: 12, paddingVertical: 7 },
  tomorrowText: { flex: 1, fontFamily: 'Shark', fontSize: 15, color: BRAND.white },
});
