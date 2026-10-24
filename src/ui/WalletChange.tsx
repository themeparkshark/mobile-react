/**
 * <WalletChange>: a coin chip that shows where coins went.
 *
 *   <WalletChange value={coins} hold={sheetOpen} style={styles.chip} textStyle={styles.coinsText} />
 *
 * When the balance changes (and nothing covers the chip), the chip answers in the four small beats
 * of src/ui/motion.ts: the coins move first (a spend throws a few coins out of the chip that tumble
 * away and fade; a gain flies a few coins in that land in it), the chip bumps to HUD_BUMP.peak, and the
 * number rolls (RollingNumber, celebrate) with a tick when a gain lands. A 7-year-old sees the coins
 * leave the wallet without reading a number.
 * `hold` keeps the old number and holds the coins while a sheet covers the chip; when it lifts the
 * whole beat plays where the kid can see it.
 * Coins go through momentParticles (power budget; none with Reduce Motion), at most 6.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
  type SharedValue } from 'react-native-reanimated';
import { usePowerBudget } from '../power/PowerProvider';
import GameIcon from './GameIcon';
import RollingNumber from './RollingNumber';
import { DURATION, EASE, HUD_BUMP, momentParticles } from './motionEasing';
import useUiReducedMotion from './useUiReducedMotion';

/** The coin beat (pure data, unit tested). */
export const WALLET_FX = {
  /** Coins thrown or caught per change, before the power budget. */
  coins: 5,
  /** The coins move this long (ms). */
  flyMs: 620,
  /** The number starts rolling this long after the coins start (the coins lead the eye). */
  rollAfterMs: 160,
  /** A held change waits this long after the hold lifts (the sheet finishes leaving). */
  afterHoldMs: 220,
  coinSize: 16,
} as const;

/** Where coin i of n flies: spends tumble down and out, gains come up from below. Pure. */
export function walletCoinPath(i: number, n: number, spend: boolean): { dx: number; dy: number; spin: number; delay: number } {
  const t = n > 1 ? i / (n - 1) : 0.5;
  const dx = -46 + 64 * t + (i % 2 ? 6 : -6);
  const dy = spend ? 34 + (i % 3) * 10 : 46 + (i % 3) * 8;
  return { dx, dy, spin: (i % 2 ? 1 : -1) * (160 + 40 * (i % 3)), delay: i * 45 };
}

function Coin({ progress, i, n, spend }: { readonly progress: SharedValue<number>; readonly i: number; readonly n: number; readonly spend: boolean }) {
  const path = walletCoinPath(i, n, spend);
  const share = path.delay / (WALLET_FX.flyMs + 5 * 45);
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (progress.value - share) / (1 - share)));
    if (p <= 0 || p >= 1) return { opacity: 0 };
    if (spend) {
      // Pops up out of the chip, then tumbles down and away with gravity, fading.
      const x = path.dx * p;
      const y = -18 * Math.sin(p * Math.PI * 0.9) + path.dy * p * p;
      return { opacity: p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3,
        transform: [{ translateX: x }, { translateY: y }, { rotate: `${path.spin * p}deg` }, { scale: 1 - 0.3 * p }] };
    }
    // A gain: flies up from below on an arc and drops into the chip.
    const q = 1 - p;
    return { opacity: p < 0.15 ? p / 0.15 : p > 0.9 ? (1 - p) / 0.1 : 1,
      transform: [{ translateX: path.dx * q }, { translateY: path.dy * q - 22 * Math.sin(p * Math.PI) }, { rotate: `${path.spin * q}deg` },
        { scale: 0.8 + 0.2 * p }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 4, top: 4 }, style]}>
      <GameIcon name="coin" size={WALLET_FX.coinSize} />
    </Animated.View>
  );
}

export interface WalletChangeProps {
  readonly value: number;
  readonly format?: (value: number) => string;
  /** Hold the old number and the coin beat while something covers the chip. */
  readonly hold?: boolean;
  /** The chip (layout and look). */
  readonly style?: StyleProp<ViewStyle>;
  readonly textStyle?: StyleProp<TextStyle>;
  readonly iconSize?: number;
  readonly accessibilityLabel?: string;
}

function WalletChange({ value, format, hold = false, style, textStyle, iconSize = 20, accessibilityLabel }: WalletChangeProps) {
  const reduced = useUiReducedMotion();
  const budget = usePowerBudget();
  const n = Math.min(6, momentParticles(WALLET_FX.coins, budget, reduced));
  // The value the coins last answered. A new value waits (held number) until its coins have started.
  const shown = useRef(value);
  const wasHeld = useRef(hold);
  const [rolling, setRolling] = useState(false);
  const pending = value !== shown.current;
  const fly = useSharedValue(0);
  const bump = useSharedValue(1);
  const spendRef = useRef(true);

  useEffect(() => {
    if (hold) { wasHeld.current = true; return undefined; }
    if (value === shown.current) { wasHeld.current = false; return undefined; }
    spendRef.current = value < shown.current;
    shown.current = value;
    const wait = wasHeld.current ? WALLET_FX.afterHoldMs : 0;
    wasHeld.current = false;
    setRolling(true);
    cancelAnimation(fly); cancelAnimation(bump);
    fly.value = 0;
    fly.value = withDelay(wait, withTiming(1, { duration: WALLET_FX.flyMs + 5 * 45, easing: EASE.out }));
    // The chip bumps as the coins leave (or as the first one lands).
    bump.value = withDelay(wait + (spendRef.current ? 40 : WALLET_FX.flyMs * 0.6),
      withSequence(withTiming(HUD_BUMP.peak, { duration: DURATION.tap, easing: EASE.out }), withSpring(1, HUD_BUMP.spring)));
    const t = setTimeout(() => setRolling(false), wait + WALLET_FX.rollAfterMs);
    return () => clearTimeout(t);
  }, [value, hold, fly, bump]);

  const chipStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const spend = spendRef.current;
  return (
    <Animated.View style={[style, chipStyle]} accessible accessibilityLabel={accessibilityLabel}>
      <View>
        <GameIcon name="coins" size={iconSize} />
        {Array.from({ length: n }, (_, i) => <Coin key={`${spend ? 's' : 'g'}${i}`} progress={fly} i={i} n={n} spend={spend} />)}
      </View>
      <RollingNumber value={value} format={format} style={textStyle} hold={hold || pending || rolling} celebrate />
    </Animated.View>
  );
}

export default memo(WalletChange);
