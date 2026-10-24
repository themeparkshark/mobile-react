import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown, FadeOutUp, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { AuthContext } from '../../context/AuthProvider';
import { queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import useAmbientLoop from '../../power/useAmbientLoop';
import { NEXT_UP_FX, nextUpTease } from '../../services/retention/loopMotion';
import { COUNT, SPRING } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import { experienceProgress } from '../Experience';
import { getNextUp, type NextUpAction, type NextUpItem } from '../../api/endpoints/live-events/nextUp';
import { haptic } from '../../gamekit/Haptics';
import useLivePoll from '../../hooks/useLivePoll';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { Image } from 'expo-image';
import { BRAND, GameIcon, isGameIconName } from '../../ui';
import { eventArt } from '../liveEvents/eventArt';

/** Every 3 minutes while the map is focused and awake (the host also refreshes after a chest opens or a sheet closes); slower when the server has nothing. */
export const NEXT_UP_POLL_MS = 180_000;
export const NEXT_UP_IDLE_MS = 10 * 60_000;

/**
 * The "what now" rail: one row, one next thing, one GO. The server ranks every
 * system that is on (chests first, then today's Star Ride, then the core
 * action), so the map never shows a pile of buttons asking for attention.
 * The host decides what each action opens (onAction).
 */
export function useNextUp(parkId: number | null, focused: boolean, enabled = true) {
  const [item, setItem] = useState<NextUpItem | null>(null);
  const [idle, setIdle] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const load = useCallback(() => getNextUp(parkId, Intl.DateTimeFormat().resolvedOptions().timeZone)
    .then(r => { if (alive.current) { setItem(r.item); setIdle(!r.item); } })
    .catch(() => { if (alive.current) setIdle(true); }), [parkId]);
  useLivePoll(load, idle ? NEXT_UP_IDLE_MS : NEXT_UP_POLL_MS, { enabled, focused, key: parkId ?? 'home' });
  return { item, refresh: load };
}

function NextUpRail({ item, onAction }: { readonly item: NextUpItem | null; readonly onAction: (action: NextUpAction) => void }) {
  const reduced = useReducedGameMotion();
  if (!item) return null;
  const icon = isGameIconName(item.icon) ? item.icon : 'arrow';
  const go = () => { haptic('tapLight'); onAction(item.action); };
  return (
    <Animated.View key={item.kind + item.title} entering={reduced ? undefined : FadeInDown.duration(220)} exiting={reduced ? undefined : FadeOutUp.duration(160)}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Next: ${item.title}. Go.`} onPress={go}
        style={({ pressed }) => [styles.rail, pressed && styles.pressed]}>
        <View style={styles.iconWell}>
          {item.kind.startsWith('event') ? <Image source={eventArt(null).chestClosed} style={{ width: 34, height: 34 }} contentFit="contain" />
            : <GameIcon name={icon} size={30} />}
        </View>
        <View style={styles.mid}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <NextChestBar reduced={reduced} />
        </View>
        <View style={styles.go}><Text style={styles.goText}>GO</Text></View>
      </Pressable>
    </Animated.View>
  );
}

export default memo(NextUpRail);

const LEVEL_CHEST = require('../../../assets/images/retention/level-chest-closed.png');

/**
 * Always one step from something: a gold bar filling toward the next level
 * chest (its number on it), from the player's real XP. Close (80 percent):
 * a shine sweeps the bar every 5 s and the chest peeks and bobs. Very close
 * (90 percent): the chest wiggles twice every 3 s. A gain surges the gold in
 * (650 ms) with a tick; reaching it pops the chest and the bar starts the next
 * level. Ambient loops rest when idle, in the background and with Reduce Motion.
 */
function NextChestBar({ reduced }: { readonly reduced: boolean }) {
  const { player } = useContext(AuthContext);
  const xp = player ? experienceProgress(player) : null;
  const pct = xp && xp.needed > 0 ? xp.current / xp.needed : 0;
  const level = xp?.level ?? 1;
  const tease = nextUpTease(pct);
  const fill = useSharedValue(pct);
  const pop = useSharedValue(1);
  const bob = useSharedValue(0);
  const wiggle = useSharedValue(0);
  const shine = useSharedValue(0);
  const [w, setW] = useState(0);
  const last = useRef<{ pct: number; level: number } | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = { pct, level };
    if (!prev || reduced) { fill.value = pct; return; }
    if (level > prev.level) {
      // Reached it: the bar fills to the end, the chest pops, then the next level's bar starts.
      fill.value = withSequence(withTiming(1, { duration: COUNT.ms * 0.6, easing: EASE.out }), withDelay(260, withTiming(0, { duration: 0 })),
        withTiming(pct, { duration: COUNT.ms, easing: EASE.out }));
      pop.value = withDelay(COUNT.ms * 0.6, withSequence(withTiming(NEXT_UP_FX.reachPop, { duration: 120, easing: EASE.out }), withSpring(1, SPRING.pop)));
      const t = setTimeout(() => { queueHaptic('hitMedium'); playSfx(NEXT_UP_FX.reachCue, 0.8); }, COUNT.ms * 0.6);
      return () => clearTimeout(t);
    }
    if (pct > prev.pct + 0.001) {
      fill.value = withTiming(pct, { duration: COUNT.ms, easing: EASE.out });
      queueHaptic('tickSelection');
      playSfx(NEXT_UP_FX.surgeCue, 0.6);
    } else fill.value = pct;
  }, [pct, level, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  useAmbientLoop(() => {
    if (tease === 'far') return;
    shine.value = 0;
    shine.value = withRepeat(withSequence(withDelay(NEXT_UP_FX.shineEveryMs - 700, withTiming(1, { duration: 700 })), withTiming(0, { duration: 0 })), -1);
    bob.value = withRepeat(withSequence(withTiming(-3, { duration: 800, easing: EASE.inOut }), withTiming(0, { duration: 800, easing: EASE.inOut })), -1);
    if (tease === 'veryClose') {
      wiggle.value = withRepeat(withSequence(withDelay(NEXT_UP_FX.wiggleEveryMs - 560, withTiming(1, { duration: 140 })),
        withTiming(-1, { duration: 140 }), withTiming(1, { duration: 140 }), withTiming(0, { duration: 140 })), -1);
    }
  }, () => { cancelAnimation(shine); cancelAnimation(bob); cancelAnimation(wiggle); shine.value = 0; bob.value = 0; wiggle.value = 0; },
  !reduced && tease !== 'far');
  const fillStyle = useAnimatedStyle(() => {
    const f = Math.max(0.04, Math.min(1, fill.value));
    return { transform: [{ translateX: -w / 2 * (1 - f) }, { scaleX: f }] };
  });
  const shineStyle = useAnimatedStyle(() => ({ opacity: shine.value > 0 && shine.value < 1 ? 1 : 0,
    transform: [{ translateX: -40 + (w + 80) * shine.value }, { rotate: '20deg' }] }));
  const chestStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }, { rotate: `${wiggle.value * 6}deg` }, { scale: pop.value }] }));
  if (!xp || xp.needed <= 0) return null;
  return (
    <View style={styles.barRow} accessibilityLabel={`${Math.round(pct * 100)} percent of the way to the Level ${level + 1} chest`}>
      <View style={styles.track} onLayout={e => setW(e.nativeEvent.layout.width)}>
        <Animated.View style={[styles.fill, fillStyle]} />
        <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]}>
          <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
      <Animated.View style={[styles.chest, chestStyle]}>
        <Image source={LEVEL_CHEST} style={{ width: 26, height: 26 }} contentFit="contain" />
        <View style={styles.lv}><Text style={styles.lvText} allowFontScaling={false}>{level + 1}</Text></View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 54, borderRadius: 18, backgroundColor: BRAND.cream,
    borderWidth: 3, borderColor: BRAND.navy, paddingVertical: 4, paddingLeft: 5, paddingRight: 5,
    shadowColor: BRAND.shadow, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  pressed: { transform: [{ scale: 0.97 }] },
  iconWell: { width: 42, height: 42, borderRadius: 21, backgroundColor: BRAND.sky, borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, gap: 2 },
  title: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  track: { flex: 1, height: 9, borderRadius: 5, backgroundColor: '#cfe9fb', borderWidth: 1.5, borderColor: BRAND.navy, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: BRAND.gold },
  shine: { position: 'absolute', top: -6, width: 22, height: 22 },
  chest: { width: 30, height: 26, alignItems: 'center', justifyContent: 'center' },
  lv: { position: 'absolute', right: -4, bottom: -4, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: BRAND.white, borderWidth: 1.5,
    borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  lvText: { fontFamily: 'Shark', fontSize: 9, color: BRAND.navy, marginTop: 1 },
  go: { backgroundColor: BRAND.gold, borderRadius: 12, borderWidth: 2.5, borderColor: BRAND.white, borderBottomWidth: 5, borderBottomColor: BRAND.goldLip,
    paddingHorizontal: 16, minHeight: 42, justifyContent: 'center' },
  goText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
});
