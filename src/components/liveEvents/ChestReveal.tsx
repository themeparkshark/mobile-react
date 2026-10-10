import { memo, useEffect, useRef, useState } from 'react';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { EventReward } from '../../api/endpoints/live-events';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { rewardChips } from '../../services/liveEvents/model';
import { BRAND, GameIcon, ICON_SOURCES } from '../../ui';
import type { EventArt } from './eventArt';
import PrizeIcon from './PrizeIcon';

const COINS = 8;

const RAYS = 8;

/** The lid burst: gold rays fan out once behind the chest (UI thread, 8 views, runs once). */
function Rays({ go }: { readonly go: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => { if (go) t.value = withSequence(withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }), withDelay(500, withTiming(0, { duration: 500 }))); }, [go, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.4 + t.value * 0.9 }, { rotate: `${t.value * 20}deg` }] }));
  return (
    <Animated.View style={[styles.rays, style]} pointerEvents="none">
      {Array.from({ length: RAYS }, (_, i) => (
        <View key={i} style={[styles.ray, { transform: [{ rotate: `${(360 / RAYS) * i}deg` }, { translateY: -62 }] }]} />
      ))}
    </Animated.View>
  );
}

/** A number that counts up from 0 (about 0.5 s, 10 steps; instant under reduced motion or skip). */
function CountUp({ to, delay, still }: { readonly to: number; readonly delay: number; readonly still: boolean }) {
  // Small prizes (a Ticket or two) never count: a kid must never read '+0'.
  const instant = still || to <= 10;
  const [n, setN] = useState(instant ? to : Math.max(1, Math.round(to / 10)));
  useEffect(() => {
    if (instant) { setN(to); return; }
    let i = 0;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = setTimeout(() => { id = setInterval(() => { i++; setN(Math.round((to * i) / 10)); if (i >= 10 && id) clearInterval(id); }, 50); }, delay);
    return () => { clearTimeout(start); if (id) clearInterval(id); };
  }, [to, delay, instant]);
  return <>{n}</>;
}

/** One coin flying out of the chest (capped at 8, UI thread, runs once). */
function Burst({ i, go }: { readonly i: number; readonly go: boolean }) {
  const t = useSharedValue(0);
  const angle = (-150 + (i * 120) / (COINS - 1)) * (Math.PI / 180);
  const dist = 90 + (i % 3) * 18;
  useEffect(() => { if (go) t.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }); }, [go, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : 1 - Math.max(0, t.value - 0.7) / 0.3,
    transform: [{ translateX: Math.cos(angle) * dist * t.value }, { translateY: Math.sin(angle) * dist * t.value + 60 * t.value * t.value },
      { rotate: `${t.value * 300}deg` }],
  }));
  return <Animated.View style={[styles.coin, style]}><GameIcon name="coin" size={22} /></Animated.View>;
}

/**
 * The chest opening: it wobbles while the server pays, a flash hides the swap
 * to the open chest, coins burst out, then each prize lands one beat apart
 * with a tick. Only what the server paid is shown.
 */
function ChestReveal({ art, rewards, onDone, title = 'You got', already = false, failed = false, onRetry }: {
  readonly art: EventArt;
  /** The server had already paid this chest (shows "Already opened"). */
  readonly already?: boolean;
  /** The open did not go through: a closed chest and Try again. */
  readonly failed?: 'not_ready' | 'network' | false;
  readonly onRetry?: () => void;
  /** Null while the server is still paying (the chest wobbles). */
  readonly rewards: EventReward | null;
  readonly onDone: () => void;
  readonly title?: string;
}) {
  const reduced = useReducedGameMotion();
  const [open, setOpen] = useState(false);
  /** Tap anywhere once it is open: every prize lands now. */
  const [skip, setSkip] = useState(false);
  const { triggerFly } = useCurrencyFly();
  const stageRef = useRef<View>(null);
  const flown = useRef(false);
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);
  useEffect(() => {
    if (reduced || failed) { cancelAnimation(shake); shake.value = 0; return; }
    shake.value = withRepeat(withSequence(withTiming(1, { duration: 70 }), withTiming(-1, { duration: 140 }), withTiming(0, { duration: 70 }),
      withTiming(0, { duration: 220 })), -1, false);
    return () => cancelAnimation(shake);
  }, [reduced, failed, shake]);
  useEffect(() => {
    if (!rewards) return;
    // Anticipation: the wobble tightens just before the lid pops.
    if (!reduced) shake.value = withRepeat(withSequence(withTiming(1, { duration: 40 }), withTiming(-1, { duration: 80 }), withTiming(0, { duration: 40 })), -1, false);
    const id = setTimeout(() => {
      cancelAnimation(shake);
      shake.value = 0;
      flash.value = withSequence(withTiming(1, { duration: 70 }), withDelay(40, withTiming(0, { duration: 260 })));
      setOpen(true);
      playSfx('win');
      haptic('comboHeavy');
    }, reduced ? 0 : 420);
    return () => clearTimeout(id);
  }, [rewards, reduced, shake, flash]);
  const chips = rewards ? rewardChips(rewards) : [];
  useEffect(() => {
    if (!open) return;
    if (skip) return;
    const ids = chips.map((_, i) => setTimeout(() => { playSfx('tick'); haptic('tickSelection'); }, 350 + i * 260));
    return () => ids.forEach(clearTimeout);
  }, [open, skip]); // eslint-disable-line react-hooks/exhaustive-deps
  /** NICE sends the prizes home: coins and Tickets fly to their counters in the top bar. */
  const done = () => {
    if (!flown.current && rewards && stageRef.current) {
      flown.current = true;
      stageRef.current.measureInWindow((x, y, w, h) => {
        if (!Number.isFinite(x)) return;
        const startX = x + w / 2, startY = y + h / 2;
        if (rewards.coins > 0) triggerFly({ imageSource: ICON_SOURCES.coin, amount: Math.min(8, Math.max(3, Math.round(rewards.coins / 40))), startX, startY, targetPosition: 'coins' });
        if (rewards.tickets > 0) triggerFly({ imageSource: ICON_SOURCES.ticket, amount: Math.min(5, rewards.tickets + 1), startX, startY, targetPosition: 'tickets' });
      });
      haptic('success');
    }
    onDone();
  };
  const chestStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${shake.value * 10}deg` }, { scale: 1 + Math.abs(shake.value) * 0.04 }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const empty = already && !!rewards;

  return (
    <Pressable style={styles.scrim} accessibilityViewIsModal onPress={() => { if (open) setSkip(true); }} accessible={false}>
      <View style={styles.card}>
        <Text style={styles.title}>{failed === 'network' ? 'No signal' : failed ? 'Not ready yet' : !rewards ? 'Opening...' : title}</Text>
        <View style={styles.stage} ref={stageRef} collapsable={false}>
          {!reduced && <Rays go={open} />}
          {!reduced && Array.from({ length: COINS }, (_, i) => <Burst key={i} i={i} go={open} />)}
          {open && <View style={styles.glow} pointerEvents="none" />}
          <Animated.View style={chestStyle}>
            <Image source={open ? art.chestOpen : art.chestClosed} style={styles.chest} contentFit="contain" />
          </Animated.View>
          <Animated.View style={[styles.flash, flashStyle]} pointerEvents="none" />
        </View>
        <View style={styles.chips}>
          {open && chips.map((c, i) => (
            <Animated.View key={c.icon + i} entering={skip || reduced ? FadeIn.delay(skip ? 0 : i * 120) : ZoomIn.delay(350 + i * 260).springify().damping(12)} style={[styles.chip, i === 0 && styles.chipBig]}>
              <PrizeIcon name={c.icon} size={26} />
              <Text style={styles.chipText} numberOfLines={1}>{c.icon === 'gift' ? c.text : <>+<CountUp to={Number(c.text)} delay={skip || reduced ? 0 : 350 + i * 260} still={skip || reduced} /></>}</Text>
            </Animated.View>
          ))}
          {open && empty && <Text style={styles.chipText}>Already opened</Text>}
        </View>
        {failed && (
          <View style={styles.failRow}>
            <Pressable accessibilityRole="button" onPress={onDone} style={[styles.button, styles.quiet]}><Text style={styles.buttonText}>CLOSE</Text></Pressable>
            {onRetry && failed === 'network' && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}><Text style={styles.buttonText}>TRY AGAIN</Text></Pressable>}
          </View>
        )}
        {open && (
          <Animated.View entering={FadeIn.delay(reduced || skip ? 0 : 350 + chips.length * 260)}>
            <Pressable accessibilityRole="button" onPress={done} style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.96 }] }]}>
              <Text style={styles.buttonText}>NICE!</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </Pressable>
  );
}

export default memo(ChestReveal);

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,56,128,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  card: { width: 300, alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: 28, borderWidth: 4, borderColor: BRAND.navy, paddingVertical: 18, paddingHorizontal: 16 },
  title: { fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, zIndex: 5, elevation: 5 },
  stageBelow: { zIndex: 1 },
  stage: { width: 200, height: 160, alignItems: 'center', justifyContent: 'center' },
  chest: { width: 140, height: 140 },
  coin: { position: 'absolute', top: 60, left: 89 },
  glow: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,207,59,0.28)', left: 25, top: 5 },
  chipBig: { transform: [{ scale: 1.3 }], marginHorizontal: 10 },
  rays: { position: 'absolute', width: 1, height: 1, left: 100, top: 80 },
  ray: { position: 'absolute', left: -9, top: -34, width: 18, height: 68, borderRadius: 9, backgroundColor: BRAND.goldLight },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: BRAND.white, borderRadius: 80 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, minHeight: 44 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 2.5, borderColor: BRAND.navy,
    paddingLeft: 4, paddingRight: 10, height: 40, maxWidth: 250 },
  chipText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  button: { marginTop: 14, backgroundColor: BRAND.gold, borderRadius: 18, borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 6,
    borderBottomColor: BRAND.goldLip, paddingHorizontal: 40, paddingVertical: 8, minHeight: 48, justifyContent: 'center' },
  failRow: { flexDirection: 'row', gap: 10 },
  quiet: { backgroundColor: BRAND.white, borderBottomColor: BRAND.creamDeep, paddingHorizontal: 18 },
  buttonText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
});
