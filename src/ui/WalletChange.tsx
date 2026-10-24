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
import { flightMs, flyCoins, registerCoinTarget, type Point } from './CoinFlight';
import { lastTouch, freshTouch } from './lastTouch';
import { useScreenFocused } from './AmbientSwim';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring,
  withTiming, type SharedValue } from 'react-native-reanimated';
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
  coinSize: 22,
  /** Coins flown between the chip and the thing you tapped: a handful a kid can see pour in (6 to 10). */
  flightCoins: 8,
  /** A tap this recent is where the coins fly from or to (ms). */
  touchFreshMs: 6000,
  /** A tap closer than this to the chip is a tap on the chip: the coins fan out right there (pt). */
  nearPt: 40,
  /** The pill's squash on each coin hit. */
  hitSquash: 0.13,
  /** A gain this soon after a reward toast's coins landed in the chip just rolls (no second flight, ms). */
  arrivedMs: 4000,
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
  // and the digits follow. Everything that answers the coins (the pill's squash on each coin, the digit
  // roll, the landing bump) runs on the UI thread on the frame a coin lands or leaves, never behind a busy JS thread.
  const shown = useRef(value);
  const wasHeld = useRef(hold);
  // What the digits show: it moves to the new value at once, and the roll waits on `gate` (opened on the UI thread).
  const [released, setReleased] = useState(value);
  const fly = useSharedValue(0);
  const bump = useSharedValue(1);
  const squash = useSharedValue(0);
  /** 1 opens the digit roll (RollingNumber gate). */
  const gate = useSharedValue(1);
  /** Coins that landed in the chip (gains) and left it (spends), counted on the UI thread. */
  const landed = useSharedValue(0);
  const left = useSharedValue(0);
  /** 1 while this change is a spend (the pill answers coins leaving), 0 for a gain (coins landing). */
  const spendSv = useSharedValue(0);
  const spendRef = useRef(true);
  const [local, setLocal] = useState(true);
  const iconRef = useRef<View>(null);
  const gateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measureChip = (done: (p: Point | null) => void) => {
    const node = iconRef.current;
    if (!node) { done(null); return; }
    node.measureInWindow((x, y, w, h) => done(Number.isFinite(x) && w > 0 ? { x: x + w / 2, y: y + h / 2 } : null));
  };
  // Reward toasts send their coins here while this screen is focused: each one squashes the pill as it
  // lands (UI thread), and a gain that shows up while they fly, or just after, rolls under them (no second flight).
  const arrivedAt = useRef(0);
  const incomingUntil = useRef(0);
  const markArrived = () => { arrivedAt.current = Date.now(); };
  useEffect(() => {
    if (!focused) return undefined;
    return registerCoinTarget('wallet', measureChip, {
      landed,
      onIncoming: ms => { incomingUntil.current = Date.now() + ms; },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  // Each coin that lands in (or leaves) the pill squashes it on that frame; the first one opens the roll,
  // and the pill lands with COUNT.finalBump as the roll settles.
  const hit = () => {
    'worklet';
    cancelAnimation(squash);
    squash.value = withSequence(withTiming(1, { duration: 40, easing: EASE.out }), withSpring(0, HUD_BUMP.spring));
    if (gate.value < 1) {
      gate.value = 1;
      cancelAnimation(bump);
      bump.value = withSequence(withTiming(HUD_BUMP.peak, { duration: DURATION.tap, easing: EASE.out }), withSpring(1, HUD_BUMP.spring),
        withDelay(Math.max(0, COUNT.ms - 420), withSequence(
          withTiming(COUNT.finalBump, { duration: DURATION.tap, easing: EASE.out }), withSpring(1, HUD_BUMP.spring))));
    }
  };
  useAnimatedReaction(() => landed.value, (now, before) => {
    if (before === null || now <= before) return;
    if (spendSv.value === 0) hit();
    runOnJS(markArrived)();
  });
  useAnimatedReaction(() => left.value, (now, before) => {
    if (before === null || now <= before) return;
    if (spendSv.value === 1) hit();
  });
  useEffect(() => () => { if (gateTimer.current) clearTimeout(gateTimer.current); }, []);

  useEffect(() => {
    if (hold) { wasHeld.current = true; return; }
    if (value === shown.current) { wasHeld.current = false; return; }
    spendRef.current = value < shown.current;
    shown.current = value;
    const spend = spendRef.current;
    const wait = wasHeld.current ? WALLET_FX.afterHoldMs : 0;
    wasHeld.current = false;
    cancelAnimation(fly); cancelAnimation(bump); cancelAnimation(squash); cancelAnimation(gate);
    fly.value = 0;
    spendSv.value = spend ? 1 : 0;
    if (gateTimer.current) clearTimeout(gateTimer.current);
    /** Never strand the digits: whatever happens to the coins, the roll opens by `ms`. */
    const gateBy = (ms: number) => { gateTimer.current = setTimeout(() => { if (gate.value < 1) gate.value = 1; }, ms); };
    const now = Date.now();
    // Coins a reward toast flew in (or is flying in): no second flight; the roll waits on their next landing.
    if (!spend && (now < incomingUntil.current || now - arrivedAt.current < WALLET_FX.arrivedMs)) {
      const flying = now < incomingUntil.current;
      gate.value = flying ? 0 : 1;
      setReleased(value);
      if (flying) gateBy(incomingUntil.current - now + 300);
      else bump.value = withDelay(COUNT.ms - 40, withSequence(
        withTiming(COUNT.finalBump, { duration: DURATION.tap, easing: EASE.out }), withSpring(1, HUD_BUMP.spring)));
      return;
    }
    const touch = freshTouch(lastTouch(), Date.now(), WALLET_FX.touchFreshMs);
    const playLocal = () => {
      setLocal(true);
      gate.value = 0;
      setReleased(value);
      fly.value = withDelay(wait, withTiming(1, { duration: WALLET_FX.flyMs + 5 * 45, easing: EASE.out }));
      // The local fan: the roll opens as the first coin reaches the pill (a spend: as the first one leaves).
      const first = spend ? 40 : WALLET_FX.flyMs * 0.6;
      gate.value = withDelay(wait + Math.min(first, WALLET_FX.rollAfterMs + 40), withTiming(1, { duration: 0 }));
      bump.value = withDelay(wait + first, withSequence(
        withTiming(HUD_BUMP.peak, { duration: DURATION.tap, easing: EASE.out }), withSpring(1, HUD_BUMP.spring),
        withDelay(Math.max(0, COUNT.ms - 360), withSequence(
          withTiming(COUNT.finalBump, { duration: DURATION.tap, easing: EASE.out }), withSpring(1, HUD_BUMP.spring)))));
      gateBy(wait + WALLET_FX.flyMs + 400);
    };
    if (reduced || flightN <= 0 || !touch) { playLocal(); return; }
    // The digits are armed on the new number now and roll on the frame the first coin lands (or leaves).
    gate.value = 0;
    setReleased(value);
    measureChip(chip => {
      const path = chip ? walletFlight(chip, touch, spend) : null;
      if (!path) { playLocal(); return; }
      setLocal(false);
      const go = () => {
        const flew = flyCoins({ from: path.from, to: path.to, count: flightN, landed: spend ? undefined : landed,
          left: spend ? left : undefined, sparkleEnd: !spend });
        if (!flew) { playLocal(); return; }
        gateBy(flightMs(flightN) + 600);
      };
      if (wait > 0) setTimeout(go, wait); else go();
    });
  }, [value, hold, fly, bump, squash, gate, landed, left, spendSv, reduced, flightN]);

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
      <RollingNumber value={released} format={format} style={textStyle} hold={hold} gate={gate} celebrate />
    </Animated.View>
  );
}

export default memo(WalletChange);
