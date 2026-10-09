/**
 * TryCard.tsx: the end of a Memory Match try (Ride Challenge).
 *
 * A short, sequenced moment on the 232ms grid the results card uses:
 *   0      card rises (opacity + lift only: a scaled, shadowed layer smears on iOS)
 *   0      gold ribbon slams in with the title, white impact, a hit + haptic
 *   +232   pair pips fill one by one, each a pop, a rising twinkle and a tick;
 *          the last found pip throws a small capped star puff
 *   +232   the line fades in, then TRY AGAIN lands and starts a slow breathe
 * Everything runs on the UI thread; Reduce Motion shows the final state at
 * once with no sound ladder. Nothing loops once the card is gone.
 */

import React, { useEffect, useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GameAudio, Haptic } from '../../gamekit';
import GameIcon from '../../ui/GameIcon';
import { triesLeftLine } from './lossCopy';
import { MM } from './theme';

const BANNER = require('../../assets/games/memory/v8/results_banner.png');
const STAR = require('../../assets/games/memory/studio/coin_alex.png');

export const TRY_BEAT_MS = 232;
/** Gap between pips filling: fast enough that 8 pips take under a second. */
export const PIP_STEP_MS = 95;
/** Stars in the last pip's puff (capped; the brief's particle budget). */
export const PUFF_STARS = 6;

/** When each part of the card lands (ms after it starts to rise). */
export function tryCardSchedule(pairs: number): { pips: number[]; puff: number | null; line: number; button: number } {
  const pips = Array.from({ length: Math.max(0, pairs) }, (_, i) => TRY_BEAT_MS + i * PIP_STEP_MS);
  const afterPips = TRY_BEAT_MS + Math.max(0, pairs) * PIP_STEP_MS;
  return {
    pips,
    puff: pairs > 0 ? pips[pips.length - 1] + 40 : null,
    line: afterPips + 60,
    button: afterPips + TRY_BEAT_MS,
  };
}

export function TryCard({ copy, pairs, total, left, top, enter, reducedMotion, onTryAgain, onDone }: {
  copy: { title: string; line: string };
  pairs: number;
  total: number;
  left: number;
  top: number;
  enter: SharedValue<number>;
  reducedMotion: boolean;
  onTryAgain: () => void;
  onDone: () => void;
}) {
  const canRetry = left > 0;
  const sched = tryCardSchedule(pairs);
  const banner = useSharedValue(reducedMotion ? 1 : 0);
  const impact = useSharedValue(0);
  const line = useSharedValue(reducedMotion ? 1 : 0);
  const button = useSharedValue(reducedMotion ? 1 : 0);
  const breathe = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    banner.value = withSequence(withTiming(1.12, { duration: 150, easing: Easing.in(Easing.quad) }), withSpring(1, { damping: 9, stiffness: 260 }));
    impact.value = withDelay(150, withSequence(withTiming(1, { duration: 16 }), withTiming(0, { duration: 160 })));
    at(150, () => { Haptic.hitMedium(); GameAudio.play('fx.hit', { volume: 0.5 }); });
    sched.pips.forEach((ms, i) => at(ms, () => {
      Haptic.tickSelection();
      GameAudio.playLadder('mm_sharp_twinkle', 2 + i, { volume: 0.6 });
    }));
    if (sched.puff !== null && pairs >= total - 2) at(sched.puff, () => Haptic.hitSoft());
    line.value = withDelay(sched.line, withTiming(1, { duration: 200 }));
    button.value = withDelay(sched.button, withSpring(1, { damping: 10, stiffness: 220 }));
    if (canRetry) {
      breathe.value = withDelay(sched.button + 500, withRepeat(withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.sin) })), -1, false));
    }
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      cancelAnimation(breathe);
    };
    // Runs once per card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardSt = useAnimatedStyle(() => ({ opacity: Math.min(1, enter.value * 1.6), transform: [{ translateY: (1 - enter.value) * 28 }] }));
  const bannerSt = useAnimatedStyle(() => ({
    opacity: banner.value > 0 ? 1 : 0,
    transform: [{ translateY: (1 - Math.min(1, banner.value)) * -34 }, { scale: banner.value || 1 }],
  }));
  const flashSt = useAnimatedStyle(() => ({ opacity: impact.value * 0.85 }));
  const lineSt = useAnimatedStyle(() => ({ opacity: line.value, transform: [{ translateY: (1 - line.value) * 6 }] }));
  const buttonSt = useAnimatedStyle(() => ({
    opacity: Math.min(1, button.value * 1.5),
    transform: [{ scale: (0.7 + button.value * 0.3) * (1 + breathe.value * 0.035) }],
  }));

  return (
    <Animated.View style={[styles.pos, { top }, cardSt]} accessibilityViewIsModal>
      <View style={styles.card}>
        <Animated.View style={[styles.banner, bannerSt]}>
          <Image source={BANNER} style={styles.bannerImg} resizeMode="stretch" />
          <Animated.View style={[styles.bannerFlash, flashSt]} />
          <Text style={styles.bannerText} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">{copy.title}</Text>
        </Animated.View>
        <View style={styles.pips} accessible accessibilityLabel={`${pairs} of ${total} pairs found`}>
          {Array.from({ length: total }, (_, i) => (
            <Pip key={i} on={i < pairs} delay={sched.pips[i] ?? 0} puff={i === pairs - 1 && pairs >= total - 2}
              reducedMotion={reducedMotion} />
          ))}
        </View>
        <Animated.Text style={[styles.line, lineSt]}>{copy.line}</Animated.Text>
        <Animated.View style={[styles.actions, buttonSt]}>
          {canRetry ? (
            <Pressable onPress={onTryAgain} style={({ pressed }) => [styles.btn, pressed && styles.down]}
              accessibilityRole="button" accessibilityLabel={`Try again. ${triesLeftLine(left)}`}>
              <GameIcon name="retry" size={26} />
              <Text style={styles.btnText}>TRY AGAIN</Text>
            </Pressable>
          ) : null}
          <View style={styles.leftRow}>
            <GameIcon name="ticket" size={24} />
            <Text style={styles.leftText}>{triesLeftLine(left)}</Text>
          </View>
          <Pressable onPress={onDone} hitSlop={8} style={({ pressed }) => [canRetry ? styles.done : styles.btn, pressed && styles.down]}
            accessibilityRole="button" accessibilityLabel="Done">
            <Text style={canRetry ? styles.doneText : styles.btnText}>{canRetry ? 'Done' : 'DONE'}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** One pair pip: empty ring, or a gold coin that pops in on its beat. */
function Pip({ on, delay, puff, reducedMotion }: { on: boolean; delay: number; puff: boolean; reducedMotion: boolean }) {
  const fill = useSharedValue(on && reducedMotion ? 1 : 0);
  const burst = useSharedValue(0);
  useEffect(() => {
    if (!on || reducedMotion) return;
    fill.value = withDelay(delay, withSequence(withTiming(1.35, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 8, stiffness: 280 })));
    if (puff) burst.value = withDelay(delay + 40, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [on, delay, puff, reducedMotion, fill, burst]);
  const coinSt = useAnimatedStyle(() => ({ opacity: fill.value > 0.02 ? 1 : 0, transform: [{ scale: fill.value }] }));
  return (
    <View style={styles.pip}>
      {on ? <Animated.Image source={STAR} style={[styles.pipCoin, coinSt]} resizeMode="contain" /> : null}
      {on && puff && !reducedMotion ? Array.from({ length: PUFF_STARS }, (_, k) => <Spark key={k} k={k} t={burst} />) : null}
    </View>
  );
}

function Spark({ k, t }: { k: number; t: SharedValue<number> }) {
  const a = (k / PUFF_STARS) * Math.PI * 2 + 0.3;
  const st = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? 1 - t.value : 0,
    transform: [{ translateX: Math.cos(a) * 26 * t.value }, { translateY: Math.sin(a) * 26 * t.value }, { scale: 1 - t.value * 0.5 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.spark, st]} />;
}

const styles = StyleSheet.create({
  pos: { position: 'absolute', left: 22, right: 22 },
  card: { alignItems: 'center', backgroundColor: '#fffdf4', borderRadius: 24, borderWidth: 3, borderBottomWidth: 6,
    borderColor: MM.ink, paddingTop: 0, paddingBottom: 16, paddingHorizontal: 16, marginTop: 26 },
  banner: { width: '112%', height: 82, marginTop: -30, alignItems: 'center', justifyContent: 'center' },
  bannerImg: { position: 'absolute', width: '100%', height: '100%' },
  bannerFlash: { position: 'absolute', width: '70%', height: '50%', backgroundColor: '#ffffff', borderRadius: 30 },
  bannerText: { fontFamily: 'Shark', fontSize: 32, color: '#ffffff', marginTop: -10, paddingHorizontal: 58,
    textShadowColor: MM.ink, textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 1 },
  pips: { flexDirection: 'row', gap: 5, marginTop: 4, marginBottom: 8 },
  pip: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: '#9cc3e4', backgroundColor: '#e3eff9',
    alignItems: 'center', justifyContent: 'center' },
  pipCoin: { position: 'absolute', width: 30, height: 30 },
  spark: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: MM.gold, borderWidth: 1.5, borderColor: '#ffffff' },
  line: { fontFamily: 'Knockout', fontSize: 19, lineHeight: 23, color: MM.navyText, textAlign: 'center', marginBottom: 12 },
  actions: { alignItems: 'center', alignSelf: 'stretch' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: MM.gold, borderRadius: 18,
    paddingHorizontal: 28, paddingVertical: 13, borderWidth: 3, borderColor: MM.ink, borderBottomWidth: 6,
    borderBottomColor: MM.goldDeep, minWidth: 220 },
  down: { transform: [{ translateY: 2 }, { scale: 0.97 }] },
  btnText: { fontFamily: 'Shark', fontSize: 26, color: '#075083' },
  leftRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  leftText: { fontFamily: 'Knockout', fontSize: 16, color: MM.navyText },
  done: { marginTop: 10, minWidth: 160, minHeight: 44, borderRadius: 14, borderWidth: 2.5, borderColor: MM.ink,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  doneText: { fontFamily: 'Shark', fontSize: 20, color: MM.navyText },
});
