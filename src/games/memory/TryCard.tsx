/**
 * TryCard.tsx: the end of a Memory Match try (Ride Challenge).
 *
 * It wears the one results look every game shares: the blue card with a
 * white border, Alex's ribbon over its top edge, the gold TRY AGAIN and a
 * white DONE inside the card. Pictures, not sentences: the pair coins say how
 * far you got (the words are spoken), and the tries on this Ticket are three
 * shells, the used ones faded (no "tries on this Ticket" sentence).
 *
 * A short, sequenced moment on the 232ms grid the results card uses:
 *   0      card rises (opacity + lift only: a scaled, shadowed layer smears on iOS)
 *   0      Alex's ribbon slams in with the title, a hit + haptic
 *   +232   pair pips fill one by one, each a pop, a rising twinkle and a tick;
 *          the last found pip throws a small capped star puff
 *   +232   TRY AGAIN lands (with a dot per try left inside it) and starts a slow breathe
 * Everything runs on the UI thread; Reduce Motion shows the final state at
 * once with no sound ladder. Nothing loops once the card is gone.
 */

import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { ResultsRibbon } from '../../gamekit/results/ResultsRibbon';

const STAR = require('../../assets/games/memory/studio/coin_alex.png');
/** One shell per try on this Ticket (core loop 5.3: tries as three shells, not words). */
const SHELL = require('../../assets/games/current-quest/conch.png');

export const TRY_BEAT_MS = 232;
/** A Ticket buys this many Memory tries (MemoryGame RIDE_TRIES). */
export const RIDE_TRY_SHELLS = 3;
/** Gap between pips filling: fast enough that 8 pips take under a second. */
export const PIP_STEP_MS = 95;
/** Sparks per pip puff (capped; the brief's particle budget). The last found pip gets double. */
export const PUFF_STARS = 3;
export const LAST_PUFF_STARS = 6;

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

export function TryCard({ copy, pairs, total, left, bottom, compact = false, enter, reducedMotion, onTryAgain, onDone }: {
  copy: { title: string; line: string };
  pairs: number;
  total: number;
  left: number;
  /** Anchored to the board's bottom edge, so it never runs off a short phone. */
  bottom: number;
  /** Short screens (SE-size): tighter spacing, same parts. */
  compact?: boolean;
  enter: SharedValue<number>;
  reducedMotion: boolean;
  onTryAgain: () => void;
  onDone: () => void;
}) {
  const canRetry = left > 0;
  const sched = tryCardSchedule(pairs);
  const button = useSharedValue(reducedMotion ? 1 : 0);
  const breathe = useSharedValue(0);
  // Press and hold the card to peek at the board behind it.
  const peek = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    // The ribbon slams on its own (ResultsRibbon); the hit lands with it.
    at(150, () => { Haptic.hitMedium(); GameAudio.play('fx.hit', { volume: 0.5 }); });
    // Every coin that fills is a small reward; the last one lands with the match chime.
    sched.pips.forEach((ms, i) => at(ms, () => {
      Haptic.tickSelection();
      GameAudio.playLadder('mm_sharp_twinkle', 2 + i, { volume: 0.6 });
    }));
    if (sched.puff !== null) at(sched.puff, () => { Haptic.hitSoft(); GameAudio.playLadder('mm_match', Math.min(7, 2 + pairs), { volume: 0.7 }); });
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

  const cardSt = useAnimatedStyle(() => ({ opacity: Math.min(1, enter.value * 1.6) * (1 - peek.value * 0.85), transform: [{ translateY: (1 - enter.value) * 28 }] }));
  const buttonSt = useAnimatedStyle(() => ({
    opacity: Math.min(1, button.value * 1.5),
    transform: [{ scale: (0.7 + button.value * 0.3) * (1 + breathe.value * 0.035) }],
  }));

  return (
    <Animated.View style={[styles.pos, { bottom }, cardSt]} accessibilityViewIsModal>
      <Pressable style={[styles.card, compact && styles.cardCompact]} delayLongPress={220}
        onLongPress={() => { peek.value = withTiming(1, { duration: 140 }); Haptic.tickSelection(); }}
        onPressOut={() => { peek.value = withTiming(0, { duration: 180 }); }}
        accessibilityHint="Press and hold to see the board">
        <ResultsRibbon title={copy.title} reducedMotion={reducedMotion} style={styles.ribbon} />
        <View style={styles.pips} accessible accessibilityLabel={`${pairs} of ${total} pairs found. ${copy.line}`}>
          {Array.from({ length: total }, (_, i) => (
            <Pip key={i} on={i < pairs} delay={sched.pips[i] ?? 0} sparks={i === pairs - 1 ? LAST_PUFF_STARS : PUFF_STARS}
              reducedMotion={reducedMotion} />
          ))}
        </View>
        {/* Three shells: one per try on this Ticket, the used ones faded (the words are spoken). */}
        <View style={styles.shells} accessible accessibilityLabel={triesLeftLine(left)}>
          {Array.from({ length: RIDE_TRY_SHELLS }, (_, i) => (
            <Animated.Image key={i} source={SHELL} resizeMode="contain"
              style={[styles.shell, i >= left && styles.shellUsed]} />
          ))}
        </View>
        <Animated.View style={[styles.actions, buttonSt]}>
          {canRetry ? (
            <Pressable onPress={onTryAgain} style={({ pressed }) => [styles.btn, compact && styles.btnCompact, pressed && styles.down]}
              accessibilityRole="button" accessibilityLabel={`Try again. ${triesLeftLine(left)}`}>
              <GameIcon name="retry" size={26} />
              <Text style={styles.btnText}>TRY AGAIN</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onDone} hitSlop={8} style={({ pressed }) => [canRetry ? [styles.done, compact && styles.doneCompact] : styles.btn, pressed && styles.down]}
            accessibilityRole="button" accessibilityLabel="Done">
            <Text style={canRetry ? styles.doneText : styles.btnText}>DONE</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** One pair pip: empty ring, or a gold coin that pops in on its beat. */
function Pip({ on, delay, sparks, reducedMotion }: { on: boolean; delay: number; sparks: number; reducedMotion: boolean }) {
  const fill = useSharedValue(on && reducedMotion ? 1 : 0);
  const burst = useSharedValue(0);
  useEffect(() => {
    if (!on || reducedMotion) return;
    fill.value = withDelay(delay, withSequence(withTiming(1.35, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 8, stiffness: 280 })));
    burst.value = withDelay(delay + 40, withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) }));
  }, [on, delay, reducedMotion, fill, burst]);
  const coinSt = useAnimatedStyle(() => ({ opacity: fill.value > 0.02 ? 1 : 0, transform: [{ scale: fill.value }] }));
  return (
    <View style={styles.pip}>
      {on ? <Animated.Image source={STAR} style={[styles.pipCoin, coinSt]} resizeMode="contain" /> : null}
      {on && !reducedMotion ? Array.from({ length: sparks }, (_, k) => <Spark key={k} k={k} n={sparks} t={burst} />) : null}
    </View>
  );
}

function Spark({ k, n, t }: { k: number; n: number; t: SharedValue<number> }) {
  const a = (k / n) * Math.PI * 2 + 0.3;
  const st = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? 1 - t.value : 0,
    transform: [{ translateX: Math.cos(a) * 26 * t.value }, { translateY: Math.sin(a) * 26 * t.value }, { scale: 1 - t.value * 0.5 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.spark, st]} />;
}

const styles = StyleSheet.create({
  pos: { position: 'absolute', left: 22, right: 22 },
  // The shared results card: blue, white border, the ribbon over its top edge.
  card: { alignItems: 'center', backgroundColor: '#0768b9', borderRadius: 24, borderWidth: 4,
    borderColor: '#ffffff', paddingTop: 46, paddingBottom: 16, paddingHorizontal: 16, marginTop: 34 },
  ribbon: { position: 'absolute', top: -34, left: -14, right: -14 },
  pips: { flexDirection: 'row', gap: 5, marginTop: 4, marginBottom: 14 },
  pip: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: '#9cc3e4', backgroundColor: '#e3eff9',
    alignItems: 'center', justifyContent: 'center' },
  pipCoin: { position: 'absolute', width: 30, height: 30 },
  spark: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: MM.gold, borderWidth: 1.5, borderColor: '#ffffff' },
  cardCompact: { paddingBottom: 10 },
  btnCompact: { paddingVertical: 9 },
  doneCompact: { marginTop: 6 },
  actions: { alignItems: 'center', alignSelf: 'stretch' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ffcf3b', borderRadius: 14,
    paddingHorizontal: 28, paddingVertical: 14, borderWidth: 3, borderColor: '#05346e', borderBottomWidth: 6,
    alignSelf: 'stretch' },
  down: { transform: [{ translateY: 2 }, { scale: 0.97 }] },
  btnText: { fontFamily: 'Shark', fontSize: 24, color: '#05346e' },
  shells: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -4, marginBottom: 12 },
  shell: { width: 30, height: 30 },
  shellUsed: { opacity: 0.28 },
  done: { marginTop: 10, alignSelf: 'stretch', minHeight: 48, borderRadius: 14, borderWidth: 3, borderColor: '#05346e', borderBottomWidth: 5,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  doneText: { fontFamily: 'Shark', fontSize: 20, color: '#05346e' },
});
