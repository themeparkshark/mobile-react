import { memo, useEffect } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { EventChest } from '../../api/endpoints/live-events';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { useEventAmbient } from '../../services/liveEvents/ambient';
import { trackFill } from '../../services/liveEvents/model';
import { BRAND, GameIcon } from '../../ui';
import type { EventArt } from './eventArt';
import PrizeIcon from './PrizeIcon';

const CHEST = 40;

/** A chest you can open now: a small hop, on the UI thread, still under reduced motion. */
function HopChest({ art, size, paused = false }: { readonly art: EventArt; readonly size: number; readonly paused?: boolean }) {
  const reduced = useReducedGameMotion();
  const p = useEventAmbient();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced || !p.ambient || paused) { cancelAnimation(t); t.value = 0; return; }
    t.value = withRepeat(withSequence(
      withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: 900 })), -1, false);
    return () => cancelAnimation(t);
  }, [reduced, p.ambient, paused, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * t.value }, { rotate: `${(t.value - 0.5) * 6}deg` }] }));
  return <Animated.View style={style}><Image source={art.chestClosed} style={{ width: size, height: size }} contentFit="contain" /></Animated.View>;
}

/** "+12" rising off the bar where it fills (others playing). One UI-thread pop, then gone. */
function Tick({ n, left }: { readonly n: number; readonly left: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }); }, [t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value < 0.7 ? 1 : (1 - t.value) / 0.3, transform: [{ translateY: -22 * t.value }] }));
  return <Animated.Text style={[styles.tick, { left: `${Math.max(4, Math.min(88, left * 100))}%` }, style]}>+{n}</Animated.Text>;
}

/**
 * A row of chests on one bar. Chests sit at even steps. Locked chests are
 * dim with a lock, a ready chest hops with a red dot, an opened chest shows
 * open with a green check. Tap a ready chest to open it.
 */
function ChestTrack({ chests, value, art, onOpen, onPeek, opening, label, paused = false, tick = null }: {
  readonly chests: readonly EventChest[];
  readonly value: number;
  readonly art: EventArt;
  readonly onOpen?: (key: string) => void;
  /** Tap a chest that is not ready: show what it holds. */
  readonly onPeek?: (chest: EventChest) => void;
  readonly opening?: string | null;
  /** Screen-reader name of the track ("Your chests"). */
  readonly label: string;
  /** The sheet is hidden or covered: ready chests rest. */
  readonly paused?: boolean;
  /** Others just added points: a '+N' floats up off the bar. */
  readonly tick?: { readonly n: number; readonly at: number } | null;
}) {
  const reduced = useReducedGameMotion();
  const { fill, stops } = trackFill(chests, value);
  const width = useSharedValue(fill);
  useEffect(() => {
    width.value = reduced ? fill : withTiming(fill, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [fill, reduced, width]);
  // scaleX from the left edge: no layout pass per frame.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.03, width.value) }] }));
  return (
    <View style={styles.wrap} accessibilityLabel={`${label}: ${chests.filter(c => c.reached).length} of ${chests.length} chests reached`}>
      {tick && <Tick key={tick.at} n={tick.n} left={fill} />}
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
      {chests.map((chest, i) => {
        const left = `${stops[i] * 100}%` as const;
        const ready = chest.claimable;
        const done = chest.claimed;
        const locked = !chest.reached;
        return (
          <Pressable key={chest.key} disabled={!!opening} onPress={() => (ready ? onOpen?.(chest.key) : onPeek?.(chest))} hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={ready ? 'Chest ready. Open it.' : done ? 'Chest opened. See what it held.' : chest.reached ? 'Chest reached. Help once to open it.' : 'Chest locked. See what is inside.'}
            style={[styles.chestSlot, { left }]}>
            {ready ? <HopChest art={art} size={CHEST} paused={paused} />
              : <Image source={done ? art.chestOpen : art.chestClosed} style={[styles.chest, locked && styles.locked]} contentFit="contain" />}
            {ready && <View style={styles.dot} />}
            {done && <View style={styles.badge}><GameIcon name="check" size={14} /></View>}
            {locked && <View style={styles.badge}><GameIcon name="lock" size={14} /></View>}
            {ready && <Text style={styles.openTag}>OPEN!</Text>}
            {!ready && !done && <View style={styles.prize}><PrizeIcon name={chest.reward.item ? 'gift' : chest.reward.tickets ? 'ticket' : 'coin'} size={20} /></View>}
          </Pressable>
        );
      })}
    </View>
  );
}

export default memo(ChestTrack);

const styles = StyleSheet.create({
  wrap: { height: 62, marginHorizontal: 8, marginRight: 24, justifyContent: 'center' },
  track: { height: 16, borderRadius: 8, backgroundColor: BRAND.sky, borderWidth: 3, borderColor: BRAND.navy, overflow: 'hidden' },
  fill: { width: '100%', height: '100%', backgroundColor: BRAND.gold, transformOrigin: 'left center' },
  chestSlot: { position: 'absolute', top: 2, width: CHEST, height: CHEST + 18, marginLeft: -CHEST / 2, alignItems: 'center' },
  chest: { width: CHEST, height: CHEST },
  locked: {},
  dot: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND.red, borderWidth: 2, borderColor: BRAND.white },
  badge: { position: 'absolute', top: 24, right: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: BRAND.white,
    borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  prize: { marginTop: -4 },
  tick: { position: 'absolute', top: 0, fontFamily: 'Shark', fontSize: 15, color: BRAND.goldLip, zIndex: 3 },
  openTag: { fontFamily: 'Shark', fontSize: 13, color: BRAND.red, marginTop: -3 },
});
