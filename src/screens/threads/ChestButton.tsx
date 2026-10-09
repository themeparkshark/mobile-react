/**
 * The "More" chest in Shark Social's top bar, with a real chest tap
 * (Dustin, Oct 8 2026: "tapping the more chest has no sound effect or cool
 * tap feature"):
 *
 * - Finger down: the chest squashes (wide and low) on the UI thread.
 * - Release: it hops, the lid pops open (Alex's open chest art), it wiggles,
 *   a ring of gold stars bursts out of the lid, a medium haptic, and Chris's
 *   lid clack plus a soft sparkle. The sheet opens a beat later, so the pop
 *   reads first.
 * - The lid stays open while the sheet is up and shuts with a little bump
 *   when it closes.
 * - Reduce Motion: no squash, hop, wiggle or stars; the lid still opens, with
 *   the sound and the haptic.
 * - The stars are one small Skia canvas driven by one shared value; nothing
 *   runs between taps, and a fast second tap restarts the beat cleanly.
 */
import { Canvas, Group, Path, usePathValue } from '@shopify/react-native-skia';
import { useContext, useEffect, useRef, useState } from 'react';
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
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import * as Haptics from '../../helpers/haptics';
import { BRAND, GameIcon } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';

/** Chris's sounds (shipped): the wooden clack as the lid, the twinkle as the sparkle. */
export const CHEST_LID_SOUND = require('../../../assets/sounds/inventory_item_tap.mp3');
export const CHEST_SPARKLE_SOUND = require('../../../assets/sounds/reveal.mp3');
/** The sheet opens this long after the tap, so the lid pop is seen first. */
export const CHEST_OPEN_DELAY_MS = 220;

// Dev captures only: EXPO_PUBLIC_JUICE_SLOWMO=4 plays the tap 4x slower for frame-by-frame review.
const SLOW = __DEV__ ? Math.max(1, Number(process.env.EXPO_PUBLIC_JUICE_SLOWMO) || 1) : 1;
const ms = (t: number) => t * SLOW;
const spring = (c: { damping: number; stiffness: number; mass?: number }) =>
  (SLOW === 1 ? c : { ...c, damping: c.damping / SLOW, stiffness: c.stiffness / (SLOW * SLOW) });

const SIZE = 36;
const OPEN_SIZE = 43;
const FX = 96; // the star canvas, centred on the chest
const STARS = [
  { a: -2.6, d: 30, s: 6.5 },
  { a: -2.05, d: 36, s: 8.5 },
  { a: -1.57, d: 38, s: 7 },
  { a: -1.1, d: 36, s: 9 },
  { a: -0.55, d: 30, s: 6.5 },
  { a: -1.85, d: 22, s: 5 },
  { a: -1.3, d: 24, s: 5 },
];

export default function ChestButton({
  label,
  open,
  onPress,
  accessibilityLabel,
}: {
  /** Short word under the chest ("More" or "VIP"). */
  readonly label: string;
  /** The sheet the chest opens is showing: the lid stays open. */
  readonly open: boolean;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
}) {
  const reduced = useUiReducedMotion();
  const { playSound } = useContext(SoundEffectContext);
  const [lidOpen, setLidOpen] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const lift = useSharedValue(0);
  const tilt = useSharedValue(0);
  const burst = useSharedValue(0);

  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

  // The sheet closed: shut the lid with a small bump.
  const wasOpen = useRef(open);
  useEffect(() => {
    // Under the sheet the chest rests upright (the backdrop covers the tail of the wiggle).
    if (open && !wasOpen.current) {
      for (const v of [lift, tilt]) { cancelAnimation(v); v.value = withTiming(0, { duration: ms(120) }); }
    }
    if (wasOpen.current && !open) {
      setLidOpen(false);
      if (!reduced) {
        sy.value = withSequence(withTiming(0.9, { duration: ms(70) }), withSpring(1, spring({ damping: 7, stiffness: 320 })));
      }
    }
    wasOpen.current = open;
  }, [open, reduced, sy, lift, tilt]);

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
      const x = cx + Math.cos(s.a) * s.d * e;
      const y = cy + Math.sin(s.a) * s.d * e + q * q * 8;
      const r = s.s * Math.sin(Math.min(1, q * 1.15) * Math.PI);
      if (r < 0.6) continue;
      p.moveTo(x, y - r);
      p.quadTo(x, y, x + r, y);
      p.quadTo(x, y, x, y + r);
      p.quadTo(x, y, x - r, y);
      p.quadTo(x, y, x, y - r);
      p.close();
    }
  });

  const pressIn = () => {
    if (reduced) return;
    cancelAnimation(sx);
    cancelAnimation(sy);
    sx.value = withTiming(1.14, { duration: ms(70), easing: Easing.out(Easing.quad) });
    sy.value = withTiming(0.82, { duration: ms(70), easing: Easing.out(Easing.quad) });
  };

  const pressOut = () => {
    if (reduced) return;
    sx.value = withSpring(1, spring({ damping: 6, stiffness: 340, mass: 0.6 }));
    sy.value = withSpring(1, spring({ damping: 6, stiffness: 340, mass: 0.6 }));
  };

  const press = () => {
    void Haptics.impactAsync('medium');
    playSound(CHEST_LID_SOUND, { volume: 0.9, rate: 1.15 });
    playSound(CHEST_SPARKLE_SOUND, { volume: 0.32, rate: 1.2 });
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
    if (pending.current) clearTimeout(pending.current);
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
      accessibilityHint="Opens more Shark fun"
      style={styles.hit}
    >
      <View pointerEvents="none" style={styles.fx}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group>
            <Path path={stars} color={BRAND.gold} />
            <Path path={stars} style="stroke" strokeWidth={1.5} strokeJoin="round" color="#b07800" />
          </Group>
        </Canvas>
      </View>
      <Animated.View style={[styles.chest, chestStyle]}>
        {lidOpen
          // The open art has a taller canvas: drawn larger and lifted so its box matches the closed chest.
          ? <GameIcon name="chestOpen" size={OPEN_SIZE} style={styles.open} />
          : <GameIcon name="chest" size={SIZE} />}
      </Animated.View>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { alignItems: 'center', minWidth: 48 },
  chest: { width: SIZE, height: SIZE },
  open: { position: 'absolute', left: -1, top: -9 },
  fx: { position: 'absolute', width: FX, height: FX, left: 24 - FX / 2, top: SIZE / 2 - FX / 2 },
  text: { fontFamily: 'Shark', fontSize: 11, color: BRAND.white, marginTop: -2, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
});
