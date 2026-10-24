/**
 * <WalletChange>: a coin chip that shows where coins went.
 *
 *   <WalletChange value={coins} hold={sheetOpen} style={styles.chip} textStyle={styles.coinsText} />
 *
 * When the balance changes (and nothing covers the chip), the chip answers in the four small beats
 * of src/ui/motion.ts: the coins move first and fly to where they go (CoinFlight): a gain arcs coins
 * from the thing you just tapped into the chip, a spend throws them out of the chip into the thing
 * you bought. The pill squashes on every coin that lands in it (or leaves it), and the number rolls
 * (RollingNumber, celebrate) while they land, then bumps once when it settles. A 7-year-old can point
 * to where the coins went without reading a number. With no fresh tap to fly to (or a tap on the chip
 * itself) the coins fan out of or into the chip right there.
 * The chip is also the place reward toasts send their coins (registerCoinTarget) while its screen is focused.
 * `hold` keeps the old number and holds the coins while a sheet covers the chip; when it lifts the
 * whole beat plays where the kid can see it.
 * Coins go through momentParticles (power budget; none with Reduce Motion), at most 6.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { COIN_FLIGHT, flyCoins, registerCoinTarget, type Point } from './CoinFlight';
import { lastTouch, freshTouch } from './lastTouch';
import { useScreenFocused } from './AmbientSwim';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
  type SharedValue } from 'react-native-reanimated';
import { usePowerBudget } from '../power/PowerProvider';
import GameIcon from './GameIcon';
import RollingNumber from './RollingNumber';
import { COUNT, DURATION, EASE, HUD_BUMP, momentParticles } from './motionEasing';
import useUiReducedMotion from './useUiReducedMotion';

/** The coin beat (pure data, unit tested). */
export const WALLET_FX = {
  /** Coins thrown or caught per change, before the power budget. */
  coins: 6,
  /** The coins move this long (ms). */
  flyMs: 620,
  /** The number starts rolling this long after the coins start (the coins lead the eye). */
  rollAfterMs: 160,
  /** A held change waits this long after the hold lifts (the sheet finishes leaving). */
  afterHoldMs: 220,
  /** Big enough to read as coins on a phone (18 to 22 pt). */
  coinSize: 20,
  /** Coins flown between the chip and the thing you tapped (3 to 5). */
  flightCoins: 5,
  /** A tap this recent is where the coins fly from or to (ms). */
  touchFreshMs: 6000,
  /** A tap closer than this to the chip is a tap on the chip: the coins fan out right there (pt). */
  nearPt: 40,
  /** The pill's squash on each coin hit. */
  hitSquash: 0.13,
} as const;

/** Where the coins fly: from the tap to the chip (gain) or the chip to the tap (spend), or null to fan locally. Pure. */
export function walletFlight(chip: Point, touch: Point | null, spend: boolean): { from: Point; to: Point } | null {
  if (!touch) return null;
  if (Math.hypot(touch.x - chip.x, touch.y - chip.y) < WALLET_FX.nearPt) return null;
  return spend ? { from: chip, to: touch } : { from: touch, to: chip };
}

/** Where coin i of n flies: spends tumble down and out, gains come up from below. Pure. */
export function walletCoinPath(i: number, n: number, spend: boolean): { dx: number; dy: number; spin: number; delay: number } {
  const t = n > 1 ? i / (n - 1) : 0.5;
  const dx = -64 + 96 * t + (i % 2 ? 8 : -8);
  const dy = spend ? 46 + (i % 3) * 14 : 56 + (i % 3) * 10;
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
      const y = -28 * Math.sin(p * Math.PI * 0.9) + path.dy * p * p;
      return { opacity: p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3,
        transform: [{ translateX: x }, { translateY: y }, { rotate: `${path.spin * p}deg` }, { scale: 1.1 - 0.35 * p }] };
    }
    // A gain: flies up from below on an arc and drops into the chip.
    const q = 1 - p;
    return { opacity: p < 0.15 ? p / 0.15 : p > 0.9 ? (1 - p) / 0.1 : 1,
      transform: [{ translateX: path.dx * q }, { translateY: path.dy * q - 22 * Math.sin(p * Math.PI) }, { rotate: `${path.spin * q}deg` },
        { scale: 0.8 + 0.2 * p }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
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
  const focused = useScreenFocused();
  const n = Math.min(6, momentParticles(WALLET_FX.coins, budget, reduced));
  const flightN = Math.min(WALLET_FX.flightCoins, momentParticles(WALLET_FX.flightCoins, budget, reduced));
  // While held, nothing moves. When the hold lifts (or the value changes in view) the coins go first
  // and the digits follow, all timed on the UI thread (no JS timers).
  const shown = useRef(value);
  const wasHeld = useRef(hold);
  const lead = useRef<number>(WALLET_FX.rollAfterMs);
  // What the digits show: it moves to the new value only when the coins say so (then it rolls).
  const [released, setReleased] = useState(value);
  const fly = useSharedValue(0);
  const bump = useSharedValue(1);
  const squash = useSharedValue(0);
  const spendRef = useRef(true);
  const [local, setLocal] = useState(true);
  const iconRef = useRef<View>(null);

  const measureChip = (done: (p: Point | null) => void) => {
    const node = iconRef.current;
    if (!node) { done(null); return; }
    node.measureInWindow((x, y, w, h) => done(Number.isFinite(x) && w > 0 ? { x: x + w / 2, y: y + h / 2 } : null));
  };
  // Reward toasts send their coins here while this screen is focused.
  useEffect(() => {
    if (!focused) return undefined;
    return registerCoinTarget('wallet', measureChip);
  }, [focused]);

  useEffect(() => {
    if (hold) { wasHeld.current = true; return; }
    if (value === shown.current) { wasHeld.current = false; return; }
    spendRef.current = value < shown.current;
    shown.current = value;
    const spend = spendRef.current;
    const wait = wasHeld.current ? WALLET_FX.afterHoldMs : 0;
    wasHeld.current = false;
    cancelAnimation(fly); cancelAnimation(bump); cancelAnimation(squash);
    fly.value = 0;
    const touch = freshTouch(lastTouch(), Date.now(), WALLET_FX.touchFreshMs);
    const playLocal = () => {
      setLocal(true);
      fly.value = withDelay(wait, withTiming(1, { duration: WALLET_FX.flyMs + 5 * 45, easing: EASE.out }));
      const first = spend ? 40 : WALLET_FX.flyMs * 0.6;
      const landAt = WALLET_FX.rollAfterMs + COUNT.ms;
      bump.value = withDelay(wait + first, withSequence(
        withTiming(HUD_BUMP.peak, { duration: DURATION.tap, easing: EASE.out }), withSpring(1, HUD_BUMP.spring),
        withDelay(Math.max(0, landAt - first - 360), withSequence(
          withTiming(COUNT.finalBump, { duration: DURATION.tap, easing: EASE.out }), withSpring(1, HUD_BUMP.spring)))));
    };
    if (reduced || flightN <= 0 || !touch) { lead.current = wait + WALLET_FX.rollAfterMs; setReleased(value); playLocal(); return; }
    // The digits keep the old number until the coins are on their way, then roll under them.
    measureChip(chip => {
      const path = chip ? walletFlight(chip, touch, spend) : null;
      if (!path) { lead.current = WALLET_FX.rollAfterMs; setReleased(value); playLocal(); return; }
      setLocal(false);
      const go = () => {
        const flew = flyCoins({ from: path.from, to: path.to, count: flightN });
        if (!flew) { lead.current = WALLET_FX.rollAfterMs; setReleased(value); playLocal(); return; }
        // The pill squashes on each coin: as each one leaves (spend) or lands (gain).
        const hits = Array.from({ length: flightN }, (_, i) => i * COIN_FLIGHT.staggerMs + (spend ? 30 : COIN_FLIGHT.flyMs));
        const seq: number[] = [];
        let t = 0;
        hits.forEach(at => { seq.push(at - t); t = at + 60; });
        squash.value = withSequence(...hits.flatMap((_, i) => [
          withDelay(Math.max(0, seq[i]), withTiming(1, { duration: 30, easing: EASE.out })),
          withTiming(0, { duration: 30, easing: EASE.in }),
        ]), withSpring(0, HUD_BUMP.spring));
        // The digits start rolling with the first hit and land a beat after the last coin.
        lead.current = hits[0];
        setReleased(value);
        const settleAt = hits[0] + COUNT.ms;
        bump.value = withDelay(settleAt - 40, withSequence(
          withTiming(COUNT.finalBump, { duration: DURATION.tap, easing: EASE.out }), withSpring(1, HUD_BUMP.spring)));
      };
      if (wait > 0) setTimeout(go, wait); else go();
    });
  }, [value, hold, fly, bump, squash, reduced, flightN]);

  const chipStyle = useAnimatedStyle(() => ({ transform: [
    { scaleX: bump.value * (1 + WALLET_FX.hitSquash * squash.value) },
    { scaleY: bump.value * (1 - WALLET_FX.hitSquash * 0.8 * squash.value) },
  ] }));
  const spend = spendRef.current;
  return (
    <Animated.View style={[style, chipStyle]} accessible accessibilityLabel={accessibilityLabel}>
      <View ref={iconRef} collapsable={false}>
        <GameIcon name="coins" size={iconSize} />
        {local && Array.from({ length: n }, (_, i) => <Coin key={`${spend ? 's' : 'g'}${i}`} progress={fly} i={i} n={n} spend={spend} />)}
      </View>
      <RollingNumber value={released} format={format} style={textStyle} hold={hold}
        startDelayMs={lead.current} celebrate />
    </Animated.View>
  );
}

export default memo(WalletChange);
