import { memo, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { EventReward } from '../../api/endpoints/live-events';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { rewardChips } from '../../services/liveEvents/model';
import { BRAND, GameIcon } from '../../ui';
import type { EventArt } from './eventArt';

const COINS = 8;

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
function ChestReveal({ art, rewards, onDone, title = 'You got' }: {
  readonly art: EventArt;
  /** Null while the server is still paying (the chest wobbles). */
  readonly rewards: EventReward | null;
  readonly onDone: () => void;
  readonly title?: string;
}) {
  const reduced = useReducedGameMotion();
  const [open, setOpen] = useState(false);
  /** Tap anywhere once it is open: every prize lands now. */
  const [skip, setSkip] = useState(false);
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    shake.value = withRepeat(withSequence(withTiming(1, { duration: 70 }), withTiming(-1, { duration: 140 }), withTiming(0, { duration: 70 }),
      withTiming(0, { duration: 220 })), -1, false);
  }, [reduced, shake]);
  useEffect(() => {
    if (!rewards) return;
    const id = setTimeout(() => {
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
  const chestStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${shake.value * 7}deg` }, { scale: 1 + Math.abs(shake.value) * 0.04 }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const empty = !!rewards && chips.length === 0;

  return (
    <Pressable style={styles.scrim} accessibilityViewIsModal onPress={() => { if (open) setSkip(true); }} accessible={false}>
      <View style={styles.card}>
        <Text style={styles.title}>{!rewards ? 'Opening...' : title}</Text>
        <View style={styles.stage}>
          {!reduced && Array.from({ length: COINS }, (_, i) => <Burst key={i} i={i} go={open} />)}
          <Animated.View style={chestStyle}>
            <Image source={open ? art.chestOpen : art.chestClosed} style={styles.chest} contentFit="contain" />
          </Animated.View>
          <Animated.View style={[styles.flash, flashStyle]} pointerEvents="none" />
        </View>
        <View style={styles.chips}>
          {open && chips.map((c, i) => (
            <Animated.View key={c.icon + i} entering={skip || reduced ? FadeIn.delay(skip ? 0 : i * 120) : ZoomIn.delay(350 + i * 260).springify().damping(12)} style={styles.chip}>
              <GameIcon name={c.icon} size={28} />
              <Text style={styles.chipText} numberOfLines={1}>{c.icon === 'gift' ? c.text : `+${c.text}`}</Text>
            </Animated.View>
          ))}
          {open && empty && <Text style={styles.chipText}>Already opened</Text>}
        </View>
        {open && (
          <Animated.View entering={FadeIn.delay(reduced || skip ? 0 : 350 + chips.length * 260)}>
            <Pressable accessibilityRole="button" onPress={onDone} style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.96 }] }]}>
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
  title: { fontFamily: 'Shark', fontSize: 24, color: BRAND.navy },
  stage: { width: 200, height: 160, alignItems: 'center', justifyContent: 'center' },
  chest: { width: 140, height: 140 },
  coin: { position: 'absolute', top: 60, left: 89 },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: BRAND.white, borderRadius: 80 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, minHeight: 44 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 2.5, borderColor: BRAND.navy,
    paddingLeft: 4, paddingRight: 10, height: 40, maxWidth: 250 },
  chipText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  button: { marginTop: 14, backgroundColor: BRAND.gold, borderRadius: 18, borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 6,
    borderBottomColor: BRAND.goldLip, paddingHorizontal: 40, paddingVertical: 8, minHeight: 48, justifyContent: 'center' },
  buttonText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
});
