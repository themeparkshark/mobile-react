/**
 * The "More" chest in Shark Social's top bar, with a real chest tap
 * (Dustin, Oct 8 2026: "tapping the more chest has no sound effect or cool
 * tap feature"):
 *
 * - Finger down: the chest squashes (wide and low) on the UI thread.
 * - Release: it hops, the lid pops open (an empty, softly lit chest: it opens
 *   a menu, not a payout), it wiggles, a few small stars puff out of the lid,
 *   a medium haptic and Chris's wooden clack. The sheet opens a beat later,
 *   so the pop reads first. One tap owns the beat: taps are ignored until the
 *   sheet closes, so sounds never stack.
 * - The lid stays open while the sheet is up and shuts with a little bump, a
 *   soft tick and a light haptic when it closes.
 * - Reduce Motion: no squash, hop, wiggle or stars; the lid still opens, with
 *   the sound and the haptic.
 * - The stars are one small Skia canvas driven by one shared value; nothing
 *   runs between taps, and a fast second tap restarts the beat cleanly.
 */
import { Canvas, Group, Path, usePathValue } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from '../../helpers/haptics';
import { playSfx } from '../../gamekit/SFX';
import { BRAND, GameIcon } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';

/** Chris's cues (chrisBank, preloaded by useSocialSounds): the wooden clack as the lid opens, a soft tick as it shuts. */
export const CHEST_OPEN_CUE = 'fx.hit';
export const CHEST_SHUT_CUE = 'ui.select';
/** If the sheet never shows (a permission prompt, a slow device), the chest answers taps again after this. */
const LOCK_RELEASE_MS = 1500;
/** The sheet opens this long after the tap, so the lid pop is seen first. */
export const CHEST_OPEN_DELAY_MS = 220;

// Dev captures only: EXPO_PUBLIC_JUICE_SLOWMO=4 plays the tap 4x slower for frame-by-frame review.
const SLOW = __DEV__ ? Math.max(1, Number(process.env.EXPO_PUBLIC_JUICE_SLOWMO) || 1) : 1;
const ms = (t: number) => t * SLOW;
const spring = (c: { damping: number; stiffness: number; mass?: number }) =>
  (SLOW === 1 ? c : { ...c, damping: c.damping / SLOW, stiffness: c.stiffness / (SLOW * SLOW) });

/** Alex's chest, open and empty (it opens a menu, not a payout). GPT Image from chest_closed.png; see juice/art/ART_QA.md. */
const OPEN_ART = require('../../../assets/images/social/chest_open_empty.png');
const SIZE = 36;
const OPEN_SIZE = 35;
const FX = 96; // the star canvas, centred on the chest
const STARS = [
  { a: -2.75, d: 14, s: 6 },
  { a: -2.15, d: 12, s: 7 },
  { a: -1.57, d: 10, s: 7.5 },
  { a: -1.0, d: 12, s: 7 },
  { a: -0.4, d: 14, s: 6 },
];
/** Stars start this far out from the lid and spread before they grow, so they never stack. */
const STAR_START = 8;

export default function ChestButton({
  label,
  open,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  quietClose = false,
}: {
  /** Short word under the chest ("More" or "VIP"). */
  readonly label: string;
  /** The sheet the chest opens is showing: the lid stays open. */
  readonly open: boolean;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string;
  /** The sheet is closing because a shortcut was picked (that tap already clicked): shut without a sound. */
  readonly quietClose?: boolean;
}) {
  const reduced = useUiReducedMotion();
  const [lidOpen, setLidOpen] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One tap owns one beat: further taps are ignored until the sheet closes.
  const locked = useRef(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const lift = useSharedValue(0);
  const tilt = useSharedValue(0);
  const burst = useSharedValue(0);
  const dim = useSharedValue(1);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));

  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
    if (lockTimer.current) clearTimeout(lockTimer.current);
  }, []);

  // The sheet closed: shut the lid with a small bump.
  const wasOpen = useRef(open);
  useEffect(() => {
    // Under the sheet the chest rests upright (the backdrop covers the tail of the wiggle).
    if (open && !wasOpen.current) {
      for (const v of [lift, tilt]) { cancelAnimation(v); v.value = withTiming(0, { duration: ms(120) }); }
    }
    if (open && lockTimer.current) { clearTimeout(lockTimer.current); lockTimer.current = null; }
    if (wasOpen.current && !open) {
      locked.current = false;
      setLidOpen(false);
      if (!quietClose) {
        playSfx(CHEST_SHUT_CUE, 0.6);
        void Haptics.impactAsync('light');
      }
      if (!reduced) {
        sy.value = withSequence(withTiming(0.9, { duration: ms(70) }), withSpring(1, spring({ damping: 7, stiffness: 320 })));
      }
    }
    wasOpen.current = open;
  }, [open, reduced, sy, lift, tilt, quietClose]);

  const chestStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: lift.value + (1 - sy.value) * SIZE * 0.5 },
      { rotate: `${tilt.value}deg` },
      { scaleX: sx.value },
      { scaleY: sy.value },
    ],
  }));

  const stars = usePathValue((p) => {
    'worklet';
    const q = burst.value;
    if (q <= 0 || q >= 1) return;
    const cx = FX / 2;
    const cy = FX / 2 - 8;
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      const e = 1 - (1 - q) * (1 - q);
      const reach = STAR_START + s.d * e;
      const x = cx + Math.cos(s.a) * reach;
      const y = cy + Math.sin(s.a) * reach + q * q * 8;
      const grow = Math.min(1, Math.max(0, (q - 0.06) * 1.8));
      const r = s.s * Math.sin(grow * Math.PI * 0.5) * (1 - Math.max(0, q - 0.65) / 0.35);
      if (r < 3.5) continue;
      p.moveTo(x, y - r);
      p.quadTo(x, y, x + r, y);
      p.quadTo(x, y, x, y + r);
      p.quadTo(x, y, x - r, y);
      p.quadTo(x, y, x, y - r);
      p.close();
    }
  });

  const pressIn = () => {
    if (locked.current) return;
    if (reduced) { dim.value = withTiming(0.7, { duration: 60 }); return; }
    cancelAnimation(sx);
    cancelAnimation(sy);
    sx.value = withTiming(1.14, { duration: ms(70), easing: Easing.out(Easing.quad) });
    sy.value = withTiming(0.82, { duration: ms(70), easing: Easing.out(Easing.quad) });
  };

  const pressOut = () => {
    if (reduced) { dim.value = withTiming(1, { duration: 120 }); return; }
    sx.value = withSpring(1, spring({ damping: 6, stiffness: 340, mass: 0.6 }));
    sy.value = withSpring(1, spring({ damping: 6, stiffness: 340, mass: 0.6 }));
  };

  const press = () => {
    if (locked.current) return;
    locked.current = true;
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => {
      lockTimer.current = null;
      if (!wasOpen.current) { locked.current = false; setLidOpen(false); }
    }, ms(LOCK_RELEASE_MS));
    void Haptics.impactAsync('medium');
    playSfx(CHEST_OPEN_CUE);
    setLidOpen(true);
    if (!reduced) {
      lift.value = withSequence(
        withTiming(-9, { duration: ms(110), easing: Easing.out(Easing.quad) }),
        withSpring(0, spring({ damping: 7, stiffness: 260 })),
      );
      tilt.value = withSequence(
        withTiming(-11, { duration: ms(70) }),
        withTiming(9, { duration: ms(90) }),
        withTiming(-5, { duration: ms(80) }),
        withSpring(0, spring({ damping: 8, stiffness: 300 })),
      );
      burst.value = 0;
      burst.value = withTiming(1, { duration: ms(620), easing: Easing.linear });
    }
    pending.current = setTimeout(() => { pending.current = null; onPress(); }, reduced ? 60 : ms(CHEST_OPEN_DELAY_MS));
  };

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={press}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={styles.hit}
    >
      <View pointerEvents="none" style={styles.fx}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group>
            <Path path={stars} color={BRAND.gold} />
            <Path path={stars} style="stroke" strokeWidth={1.8} strokeJoin="round" color="#9a6400" />
          </Group>
        </Canvas>
      </View>
      <Animated.View style={[styles.chest, chestStyle, dimStyle]}>
        {lidOpen
          // The open art has a taller canvas: drawn larger and lifted so its box matches the closed chest.
          ? <Image source={OPEN_ART} style={[styles.open, { width: OPEN_SIZE, height: OPEN_SIZE }]} contentFit="contain" />
          : <GameIcon name="chest" size={SIZE} />}
      </Animated.View>
      <Text style={styles.text} maxFontSizeMultiplier={1.2}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { alignItems: 'center', minWidth: 48 },
  chest: { width: SIZE, height: SIZE },
  open: { position: 'absolute', left: 1, top: -2 },
  fx: { position: 'absolute', width: FX, height: FX, left: 24 - FX / 2, top: SIZE / 2 - FX / 2 },
  text: { fontFamily: 'Shark', fontSize: 11, color: BRAND.white, marginTop: -2, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
});
