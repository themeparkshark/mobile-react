/**
 * The "More" button in Shark Social's top bar, with a real tap (Dustin, Oct 8 2026: "tapping the
 * more chest has no sound effect or cool tap feature"). Fix w3 T147: it used to be a chest, but a
 * chest means Rewards only, so it now wears the map's menu button (Alex's round blue FAB with three
 * bars). The file keeps its name for history.
 *
 * - Finger down: the button squashes (wide and low) on the UI thread.
 * - Release: it hops and wiggles, the middle bar tucks in while the sheet is up, a medium haptic
 *   and Chris's wooden clack. The sheet opens a beat later, so the pop reads first. One tap owns
 *   the beat: taps are ignored until the sheet closes, so sounds never stack.
 * - It settles with a little bump, a soft tick and a light haptic when the sheet closes.
 * - Reduce Motion: no squash, hop or wiggle; the sound and the haptic stay.
 */
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
import { BRAND } from '../../ui';
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

/** The map's menu button (Alex's round blue button, the Quick Access Menu FAB): More opens a menu. */
const MENU_ART = require('../../../assets/images/alex-ui/fab-blue.webp');
const SIZE = 38;

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
      {/* Fix w3 T147: the chest means Rewards only, so More wears the map's own menu button (Alex's round
          blue button with three bars). The squash, hop, sound and haptic stay; the payout stars do not. */}
      <Animated.View style={[styles.chest, chestStyle, dimStyle]}>
        <Image source={MENU_ART} style={StyleSheet.absoluteFill} contentFit="contain" />
        <View style={styles.bars}>
          {[0, 1, 2].map(line => <View key={line} style={[styles.bar, lidOpen && line === 1 && styles.barOpen]} />)}
        </View>
      </Animated.View>
      <Text style={styles.text} maxFontSizeMultiplier={1.2}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { alignItems: 'center', minWidth: 48 },
  chest: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  bars: { alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: -4 },
  bar: { width: 18, height: 4, borderRadius: 2, backgroundColor: BRAND.white, borderWidth: 1, borderColor: '#0b3f78' },
  barOpen: { width: 14 },
  text: { fontFamily: 'Shark', fontSize: 11, color: BRAND.white, marginTop: -2, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
});
