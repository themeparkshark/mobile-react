/**
 * The trade-complete moment. Your pin and the board pin lift, orbit each
 * other and cross with a flash; your pin flies up to the board while the new
 * one spirals in, lands big with a bounce, a gold sunburst, confetti and a
 * shine. Sound and haptics fire on the same SWAP_TIMELINE marks the motion
 * uses: whoosh + light tap on lift, pop + medium hit at the cross, the
 * pin-swap jingle + success at the land.
 *
 * Everything moves on the UI thread from two shared values. Reduced motion:
 * the final card fades in still (no orbit, rays or confetti); the sound and
 * the success haptic still play.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { queueHaptic } from '../../gamekit/Haptics';
import type { ItemType } from '../../models/item-type';
import { BRAND, FONT, GameButton, SPACE } from '../../ui';
import { textPreset } from '../../ui/TextPresets';
import { Confetti, Sunburst } from '../stampbook/SlamFx';
import EnamelPin from './EnamelPin';
import type { SlotRect } from './PinTradeParts';
import { PIN_TRADE_COPY as COPY, pinName, SWAP_TIMELINE as T } from './pinTradeModel';

const SKY = ['#123f80', '#0a2a5c'] as const;
const SND_WHOOSH = require('../../../assets/sounds/whoosh.mp3');
const SND_POP = require('../../../assets/sounds/firework_pop.mp3');
const SND_COMPLETE = require('../../../assets/sounds/pin_swap_complete.mp3');

export default function SwapCelebration({ got, gave, from, still, onDone }: {
  got: ItemType; gave: ItemType; still: boolean; onDone: () => void;
  /** Where the two pins sat on the trade sheet (window space), so the moment starts right there. */
  from?: { get?: SlotRect; give?: SlotRect };
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { playSound } = useContext(SoundEffectContext);
  const swap = useSharedValue(still ? 1 : 0);
  const land = useSharedValue(still ? 1 : 0);
  const hit = useSharedValue(0);
  const flash = useSharedValue(0);
  const shine = useSharedValue(0);
  const bg = useSharedValue(still ? 1 : 0);
  const startSize = Math.min(120, width * 0.3);
  const bigSize = Math.min(210, width * 0.52);
  const cx = width / 2;
  const cy = height * 0.42;
  const R = Math.min(110, width * 0.27);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    AccessibilityInfo.announceForAccessibility(`${COPY.doneTitle} ${COPY.doneMessage(pinName(got))}`);
    if (still) {
      playSound(SND_COMPLETE);
      queueHaptic('success', 3);
      return () => timers.forEach(clearTimeout);
    }
    bg.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
    playSound(SND_WHOOSH, { volume: 0.7 });
    queueHaptic('tapLight', 1);
    swap.value = withTiming(1, { duration: T.land, easing: Easing.inOut(Easing.cubic) });
    hit.value = withDelay(T.cross, withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }));
    flash.value = withDelay(T.cross, withSequence(withTiming(1, { duration: 70 }), withTiming(0, { duration: 260 })));
    land.value = withDelay(T.land, withSequence(withTiming(1.12, { duration: 120, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 7, stiffness: 260, mass: 0.6 })));
    shine.value = withDelay(T.land + 220, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }));
    at(T.cross, () => { playSound(SND_POP, { volume: 0.8 }); queueHaptic('hitMedium', 2); });
    at(T.land, () => { playSound(SND_COMPLETE); queueHaptic('success', 3); });
    return () => {
      timers.forEach(clearTimeout);
      [swap, hit, flash, land, shine, bg].forEach(v => cancelAnimation(v));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start points: the sheet's slots when measured, else a mirrored pair under the centre.
  const g0 = from?.get ?? { x: cx - R, y: cy + 70, size: startSize };
  const v0 = from?.give ?? { x: cx + R, y: cy + 70, size: startSize };
  // Both pins meet at M at the cross mark (t = 0.5): the board pin arcs over, yours swings under.
  const mx = (g0.x + v0.x) / 2;
  const my = (g0.y + v0.y) / 2 - 10;
  const arc = Math.min(110, Math.abs(v0.x - g0.x) * 0.45);

  // The board pin (yours now): over the top to M, then into the centre, growing.
  const gotStyle = useAnimatedStyle(() => {
    const t = swap.value;
    let x: number; let y: number;
    if (t < 0.5) {
      const u = t / 0.5;
      x = g0.x + (mx - g0.x) * u;
      y = g0.y + (my - g0.y) * u - Math.sin(u * Math.PI) * arc;
    } else {
      const u = (t - 0.5) / 0.5;
      x = mx + (cx - mx) * u;
      y = my + (cy - my) * u - Math.sin(u * Math.PI) * arc * 0.35;
    }
    const grow = g0.size + (bigSize - g0.size) * t * t;
    const s = (grow / bigSize) * (land.value === 0 ? 1 : land.value);
    return { transform: [{ translateX: x - bigSize / 2 }, { translateY: y - bigSize / 2 }, { scale: s }, { rotate: `${Math.sin(t * Math.PI) * -14}deg` }] };
  });
  // Your old pin: under to M, then up and away to the board, shrinking and fading.
  const gaveStyle = useAnimatedStyle(() => {
    const t = swap.value;
    let x: number; let y: number;
    if (t < 0.5) {
      const u = t / 0.5;
      x = v0.x + (mx - v0.x) * u;
      y = v0.y + (my - v0.y) * u + Math.sin(u * Math.PI) * arc * 0.6;
    } else {
      const u = (t - 0.5) / 0.5;
      x = mx + (g0.x - mx) * u * 0.6;
      y = my - u * u * (my + v0.size);
    }
    const s = (v0.size / startSize) * (t < 0.5 ? 1 + Math.sin(t * 2 * Math.PI) * 0.06 : 1 - (t - 0.5) * 1.1);
    return {
      opacity: t >= 1 ? 0 : t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
      transform: [{ translateX: x - startSize / 2 }, { translateY: y - startSize / 2 }, { scale: s }, { rotate: `${t * 50}deg` }],
    };
  });
  const ringStyle = useAnimatedStyle(() => ({
    opacity: hit.value === 0 ? 0 : Math.max(0, 1 - hit.value * 1.3),
    transform: [{ scale: 0.35 + hit.value * 1.1 }],
  }));
  const bgStyle = useAnimatedStyle(() => ({ opacity: bg.value }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.55, transform: [{ scale: 0.5 + flash.value * 0.7 }] }));
  const raysStyle = useAnimatedStyle(() => ({ opacity: land.value === 0 ? 0 : Math.min(1, land.value), transform: [{ scale: 0.6 + Math.min(1, land.value) * 0.4 }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: land.value === 0 ? 0 : 1, transform: [{ translateY: land.value === 0 ? 14 : 0 }] }));

  const confettiSeed = useMemo(() => got.id * 31 + gave.id, [got.id, gave.id]);
  const name = pinName(got);

  return (
    <Animated.View entering={still ? FadeIn.duration(180) : undefined} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, { zIndex: 50 }]}
      accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, bgStyle]}><LinearGradient colors={SKY} style={StyleSheet.absoluteFill} /></Animated.View>
      {!still && (
        <Animated.View pointerEvents="none" style={[styles.abs, { left: cx, top: cy }, raysStyle]}>
          <Sunburst size={bigSize * 1.75} color={BRAND.gold} running />
        </Animated.View>
      )}
      {still && <View pointerEvents="none" style={[styles.glow, { width: bigSize * 1.6, height: bigSize * 1.6, borderRadius: bigSize * 0.8, left: cx - bigSize * 0.8, top: cy - bigSize * 0.8 }]} />}
      {!still && (
        <Animated.View pointerEvents="none"
          style={[styles.ring, { left: mx - bigSize * 0.6, top: my - bigSize * 0.6, width: bigSize * 1.2, height: bigSize * 1.2, borderRadius: bigSize * 0.6 }, ringStyle]} />
      )}

      {!still && <ConfettiAtLand width={width} height={height} seed={confettiSeed} />}

      {!still && (
        <Animated.View pointerEvents="none" style={[styles.flash, { left: mx - 90, top: my - 90 }, flashStyle]} />
      )}
      {!still && (
        <Animated.View pointerEvents="none" style={[styles.pin, { width: startSize, height: startSize }, gaveStyle]}>
          <EnamelPin uri={gave.icon_url} size={startSize} recyclingKey={`cele-gave-${gave.id}`} />
        </Animated.View>
      )}
      <Animated.View pointerEvents="none"
        style={[styles.pin, { width: bigSize, height: bigSize }, still ? { transform: [{ translateX: cx - bigSize / 2 }, { translateY: cy - bigSize / 2 }] } : gotStyle]}>
        <EnamelPin uri={got.icon_url} size={bigSize} tilt={-4} shine={still ? undefined : shine} recyclingKey={`cele-got-${got.id}`} />
      </Animated.View>

      <Animated.View style={[styles.copy, { top: cy + bigSize * 0.92 }, still ? undefined : textStyle]}>
        <Text maxFontSizeMultiplier={1.2} style={[textPreset('hero', 'onBlue'), styles.title]}>{COPY.doneTitle}</Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.sub}>{COPY.doneMessage(name)}</Text>
      </Animated.View>
      <Animated.View entering={still ? FadeIn.duration(180) : FadeIn.delay(T.button).duration(220)}
        style={[styles.cta, { bottom: Math.max(insets.bottom, SPACE.lg) + SPACE.xl }]}>
        <GameButton label={COPY.doneAction} icon="check" onPress={onDone} />
      </Animated.View>
    </Animated.View>
  );
}

/** Confetti's clock starts on mount, so it mounts at the land mark and never rains under the orbit. */
function ConfettiAtLand({ width, height, seed }: { width: number; height: number; seed: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setOn(true), T.land);
    return () => clearTimeout(id);
  }, []);
  return on ? <Confetti width={width} height={height} seed={seed} count={30} /> : null;
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', width: 0, height: 0 },
  pin: { position: 'absolute', left: 0, top: 0 },
  flash: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: '#ffffff' },
  ring: { position: 'absolute', borderWidth: 6, borderColor: '#ffe07a' },
  glow: { position: 'absolute', backgroundColor: 'rgba(255,224,122,0.18)' },
  copy: { position: 'absolute', left: SPACE.xl, right: SPACE.xl, alignItems: 'center', gap: SPACE.xs },
  title: { textAlign: 'center', color: BRAND.white },
  sub: { fontFamily: FONT.display, fontSize: 22, lineHeight: 27, color: '#ffe07a', textAlign: 'center' },
  cta: { position: 'absolute', left: SPACE.xl, right: SPACE.xl, alignItems: 'center' },
});
