/**
 * The park day recap builds itself in front of you, like a day being added
 * up: the header sky warms from day blue to a gold sunset, the title stamps
 * in, each stat pops and counts up one after another (a tick each), the best
 * coin of the day drops in like a polaroid, and a closing stamp lands:
 * "Great day at Disneyland!". A tap anywhere on the card skips to the end.
 *
 * One-shot UI-thread animations, one build per park day per card (never a
 * loop). Reduce Motion: everything is simply there; the closing haptic stays.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { CountUpText } from '../../gamekit/fx/CountUpText';
import { playHaptic, queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { useReduceMotionPreference } from '../../hooks/useReducedGameMotion';
import { DURATION, EASE, GOLD_FX, SPRING } from '../../ui/motionEasing';
import { SLAM_SQUASH } from '../../ui/motion';
import { BRAND } from '../../ui/tokens';
import { RECAP_BUILD, recapStatAt } from './recapBuildPlan';

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
const VISIBLE_POLL_MS = 350;
const VISIBLE_WAIT_MS = 120_000;

/**
 * One build per park day per app run: coming back to the shelf shows the finished card.
 * The build waits until the card is actually on screen (the recap sits under the shelf), checking
 * its place a few times a second only until then, and for at most VISIBLE_WAIT_MS.
 */
export function useRecapBuild(dayKey: string | null, cardRef?: RefObject<View | null>): RecapBuild {
  const preference = useReduceMotionPreference();
  const { height } = useWindowDimensions();
  const [key, setKey] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!dayKey || preference === null) { setWaiting(false); return undefined; }
    if (played.has(dayKey)) { setKey(null); setWaiting(false); return undefined; }
    const start = () => {
      if (timer) clearTimeout(timer);
      active = false;
      if (played.has(dayKey)) return;
      played.add(dayKey);
      setWaiting(false);
      setSkipped(false);
      setKey(dayKey);
    };
    if (!cardRef) { start(); return undefined; }
    setWaiting(true);
    let active = true;
    const began = Date.now();
    const check = () => {
      if (!active) return;
      if (Date.now() - began > VISIBLE_WAIT_MS) { setWaiting(false); return; }
      // The next look is booked first, so a measure that never answers cannot stall the build.
      timer = setTimeout(check, VISIBLE_POLL_MS);
      cardRef.current?.measureInWindow((_x, y, _w, h) => {
        if (__DEV__ && process.env.EXPO_PUBLIC_PARK_ARRIVAL_DEBUG === '1') console.log('[recap] seen?', y, h, height);
        if (active && Number.isFinite(y) && h > 0 && y < height - 140 && y + h > 120) start();
      });
    };
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(check, 120);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [dayKey, preference, cardRef, height]);
  const skip = useCallback(() => setSkipped(true), []);
  // While waiting to be seen, the card holds its starting frame (nothing counted yet); a tap still shows it all.
  const hold = waiting && !skipped;
  return { key, hold, instant: !hold && (preference === true || skipped || key === null), skip };
}

/** The header sky: day blue warming into a gold sunset. */
export function RecapSky({ build }: { readonly build: RecapBuild }) {
  const t = useSharedValue(build.key ? 0 : 1);
  useEffect(() => {
    if (build.instant) { cancelAnimation(t); t.value = 1; return undefined; }
    t.value = 0;
    if (build.hold) return undefined;
    t.value = withTiming(1, { duration: RECAP_BUILD.skyMs, easing: EASE.inOut });
    return () => cancelAnimation(t);
  }, [build.key, build.instant, build.hold, t]);
  const style = useAnimatedStyle(() => ({ opacity: 0.9 * t.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
    <LinearGradient colors={['#0875c9', '#3f8fd6', '#ffb347', GOLD_FX.rays]} locations={[0, 0.35, 0.8, 1]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}

/** A label that stamps down from oversize with a little squash. */
export function RecapStamp({ build, at, from = 1.6, children, onLand }: {
  readonly build: RecapBuild; readonly at: number; readonly from?: number; readonly children: ReactNode;
  readonly onLand?: () => void;
}) {
  const p = useSharedValue(build.key ? 0 : 1);
  const squash = useSharedValue(0);
  const landRef = useRef(onLand); landRef.current = onLand;
  useEffect(() => {
    if (build.instant) { cancelAnimation(p); p.value = 1; squash.value = 0; return undefined; }
    p.value = 0;
    if (build.hold) return undefined;
    p.value = withDelay(at, withTiming(1, { duration: DURATION.slam, easing: EASE.in }));
    squash.value = withDelay(at + DURATION.slam, withSequence(withTiming(1, { duration: 40 }), withSpring(0, SPRING.stamp)));
    const timer = setTimeout(() => landRef.current?.(), at + DURATION.slam);
    return () => { clearTimeout(timer); cancelAnimation(p); cancelAnimation(squash); };
  }, [build.key, build.instant, build.hold, at, p, squash]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 3),
    transform: [{ scale: from - (from - 1) * p.value }, { scaleX: 1 + SLAM_SQUASH * squash.value }, { scaleY: 1 - SLAM_SQUASH * squash.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** One stat: pops to 1.2 and back, then its number counts up from zero with a tick. */
export function RecapStat({ build, index, value, label, valueStyle, labelStyle }: {
  readonly build: RecapBuild; readonly index: number; readonly value: number; readonly label: string;
  readonly valueStyle?: StyleProp<TextStyle>; readonly labelStyle?: StyleProp<TextStyle>;
}) {
  const at = recapStatAt(index);
  const pop = useSharedValue(build.key ? 0 : 1);
  const [shown, setShown] = useState(build.instant ? value : 0);
  useEffect(() => {
    if (build.instant) { cancelAnimation(pop); pop.value = 1; setShown(value); return undefined; }
    pop.value = 0;
    setShown(0);
    if (build.hold) return undefined;
    pop.value = withDelay(at, withSpring(1, SPRING.pop));
    const timer = setTimeout(() => {
      setShown(value);
      queueHaptic('tickSelection');
      playSfx('fx.coin', 0.45);
    }, at + 60);
    return () => { clearTimeout(timer); cancelAnimation(pop); };
  }, [build.key, build.instant, build.hold, at, value, pop]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 2),
    transform: [{ scale: Math.max(0, pop.value) }],
  }));
  return <Animated.View style={[styles.stat, style]}>
    <CountUpText value={shown} durationMs={DURATION.count} reducedMotion={build.instant} punch={1.12} style={valueStyle} />
    <Text style={labelStyle}>{label}</Text>
  </Animated.View>;
}

/** The best coin of the day dropping in like a polaroid. */
export function RecapPolaroid({ build, coinUrl, isNew }: { readonly build: RecapBuild; readonly coinUrl: string; readonly isNew: boolean }) {
  const t = useSharedValue(build.key ? 0 : 1);
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

/** The closing stamp: "Great day at Disneyland!" with the golden haptic. */
export function RecapClosingStamp({ build, parkName }: { readonly build: RecapBuild; readonly parkName: string }) {
  const onLand = useCallback(() => { playHaptic('golden'); playSfx('fx.reward', 0.8); }, []);
  return <View pointerEvents="none" style={styles.closing}>
    <RecapStamp build={build} at={RECAP_BUILD.stampAt} from={1.8} onLand={build.instant ? undefined : onLand}>
      <View style={styles.stampBody}>
        <Text style={styles.stampText} numberOfLines={1} adjustsFontSizeToFit>{`Great day at ${parkName}!`}</Text>
      </View>
    </RecapStamp>
  </View>;
}

const styles = StyleSheet.create({
  stat: { flex: 1, alignItems: 'center' },
  polaroid: { position: 'absolute', right: 8, top: 8, width: 66, padding: 5, paddingBottom: 12, backgroundColor: BRAND.white,
    borderRadius: 4, shadowColor: '#05346e', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  photo: { height: 56, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center' },
  coin: { width: 48, height: 48 },
  newTag: { position: 'absolute', bottom: -8, alignSelf: 'center', backgroundColor: BRAND.gold, borderRadius: 8,
    borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 6 },
  newText: { fontFamily: 'Shark', fontSize: 10, color: BRAND.navy },
  closing: { alignItems: 'flex-start', marginTop: 6 },
  stampBody: { backgroundColor: BRAND.gold, borderRadius: 12, borderWidth: 3, borderColor: BRAND.white, paddingHorizontal: 12,
    paddingVertical: 4, transform: [{ rotate: '-3deg' }], shadowColor: '#05346e', shadowOpacity: 0.25, shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 } },
  stampText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
});
