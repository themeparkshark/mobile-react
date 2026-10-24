import { useEffect, useMemo, useRef, useState, createContext, useContext, useCallback, ReactNode } from 'react';
import { PanResponder, StyleSheet, Text, View, TouchableOpacity, Dimensions } from 'react-native';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring,
  withTiming } from 'react-native-reanimated';
import { queueHaptic, type HapticIntent } from '../gamekit/Haptics';
import { DURATION, EASE, SPRING } from '../ui/motionEasing';
import SparkleBurst from '../ui/SparkleBurst';
import GoldCheck from '../ui/GoldCheck';
import { flightMs, flyCoins, measureCoinTarget, type CoinTargetAnswer, type Point } from '../ui/CoinFlight';
import { momentParticles } from '../ui/motion';
import { usePowerBudget } from '../power/PowerProvider';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { colors, shadows, borderRadius, spacing, typography } from '../design-system';
import { onToast } from '../utils/toast';
import { BRAND, FONT, GameIcon, GameRichText, iconForEmoji, resolveIconName, type GameIconName } from '../ui';

// Toast types
type ToastType = 'success' | 'error' | 'warning' | 'info' | 'reward';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  /** A GameIcon name. Legacy emoji are mapped to art (or ignored); they are never rendered. */
  icon?: string;
  duration?: number;
  action?: {
    label: string;
    onPress: () => void;
  };
}

// Toast Context
interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType>({} as ToastContextType);

export const useToast = () => useContext(ToastContext);

/**
 * Toast Provider - wrap your app with this
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Dev only: the lane captures fire toasts over the debugger.
  useEffect(() => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) (globalThis as { __showToast?: typeof showToast }).__showToast = showToast;
  }, [showToast]);

  // Bridge: listen for global toast events from non-React code (e.g. axios interceptor)
  useEffect(() => {
    const unsub = onToast((event) => {
      showToast({
        type: event.type,
        message: event.message,
        icon: event.icon,
        duration: event.duration,
      });
    });
    return unsub;
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <ToastContainer toasts={toasts} onHide={hideToast} />
    </ToastContext.Provider>
  );
}

/** Toast timing (src/ui/motion.ts language): one at a time, a short gap, a calm wait. */
export const TOAST_MOTION = {
  /** Auto-dismiss after this long when the toast names no duration. */
  showMs: 2600,
  /** Gap before the next queued toast comes in. */
  gapMs: 120,
  /** The icon pops a beat after the card lands. */
  iconPopAt: 120,
  /** A swipe this far (pt) toward the edge dismisses it. */
  swipePt: 24,
  /** How big the icon pops: a reward pops bigger than a plain win or a note. */
  iconPop: 1.25,
  rewardPop: 1.35,
  /** Star sparkles off a win's icon (before the power budget). */
  winSparkles: 5,
  rewardSparkles: 7,
  /** A shine sweeps across a win's card this long after it lands. */
  shineAt: 260,
  shineMs: 520,
  /** The card springs up from the footer: it starts this much smaller and this far below. */
  enterScale: 0.9,
  enterFromPt: 110,
  /** The icon hops this high as it pops (pt). */
  iconHopPt: 10,
  /** Bigger icon: the picture leads, the words follow. */
  iconPt: 36,
  /** A "+25 coins" toast flies coins from its icon into the wallet chip on screen (if there is one). */
  coinFlyAt: 260,
  coinFlyMax: 6,
  coinFlyMin: 4,
  /** A coin toast leads with the picture: a bigger coin stack and the amount in big gold numbers. */
  coinIconPt: 44,
  amountPt: 30,
} as const;

/** The coin amount a toast's message names ("+25 coins" gives 25), or 0. Pure (unit tested). */
export function toastCoinAmount(message: string): number {
  const m = /\+\s*([\d,]+)\s*coins?\b/i.exec(message);
  if (!m) return 0;
  const amount = Number(m[1].replace(/,/g, ''));
  return amount > 0 ? amount : 0;
}

/** How many coins a toast's message is worth flying ("+25 coins" gives 5; no amount gives 0). Pure (unit tested). */
export function toastCoinCount(message: string): number {
  const amount = toastCoinAmount(message);
  if (!(amount > 0)) return 0;
  return Math.min(TOAST_MOTION.coinFlyMax, Math.max(TOAST_MOTION.coinFlyMin, Math.ceil(amount / 5)));
}

/** The words left after the "+25 coins" a coin toast shows as a picture ("+25 coins for your first ride" gives "for your first ride"). */
export function toastCoinCaption(message: string): string {
  return message.replace(/\+\s*[\d,]+\s*coins?\b[!.]?/i, '').replace(/\s{2,}/g, ' ').trim();
}

/** The haptic a toast plays when it shows: a win buzzes, info ticks, a problem is a soft bump (never an error buzz). */
export function toastHaptic(type: ToastType): HapticIntent {
  if (type === 'success' || type === 'reward') return 'hitMedium';
  if (type === 'error') return 'hitSoft';
  return 'tickSelection';
}

/**
 * Toast Container - shows one toast at a time; the next waits its turn.
 */
function ToastContainer({
  toasts,
  onHide,
}: {
  toasts: Toast[];
  onHide: (id: string) => void;
}) {
  const current = toasts[0];
  // Which toast is on screen. The next one waits a short breath after the last left, so two never overlap.
  const [shownId, setShownId] = useState<string | null>(null);
  const hadOne = useRef(false);
  useEffect(() => {
    if (!current) { if (shownId !== null) { setShownId(null); hadOne.current = true; } return undefined; }
    if (current.id === shownId) return undefined;
    const wait = hadOne.current || shownId !== null ? TOAST_MOTION.gapMs : 0;
    const t = setTimeout(() => { hadOne.current = false; setShownId(current.id); }, wait);
    return () => clearTimeout(t);
  }, [current, shownId]);
  return (
    <View style={styles.container} pointerEvents="box-none">
      {current && current.id === shownId && (
        <ToastItem
          key={current.id}
          toast={current}
          index={0}
          onHide={() => onHide(current.id)}
        />
      )}
    </View>
  );
}

/**
 * Single Toast Item: rises into place on the settle spring, its icon pops a beat later
 * (with three gold sparkles for a win), it waits, then drops away faster than it came.
 * A flick down sends it away early. Reduce Motion: a quick fade.
 */
function ToastItem({
  toast,
  index,
  onHide,
}: {
  toast: Toast;
  index: number;
  onHide: () => void;
}) {
  const reduced = useUiReducedMotion();
  const enter = useSharedValue(0);
  const drag = useSharedValue(0);
  const iconPop = useSharedValue(1);
  const iconHop = useSharedValue(0);
  const iconRef = useRef<View>(null);
  const budget = usePowerBudget();
  const sparkle = useSharedValue(0);
  const shine = useSharedValue(0);
  const hiding = useRef(false);
  const win = toast.type === 'success' || toast.type === 'reward';
  const reward = toast.type === 'reward';
  const coinAmount = toastCoinAmount(toast.message);
  const coinCaption = toastCoinCaption(toast.message);
  const amountPop = useSharedValue(reduced || coinAmount === 0 ? 1 : 0.4);

  const flyFromIcon = (target: Point, coins: number, answer?: CoinTargetAnswer) => {
    if (!iconRef.current) return;
    iconRef.current.measureInWindow((x, y, w, h) => {
      if (!Number.isFinite(x) || !(w > 0)) return;
      // The chip answers each coin with a squash on the frame it lands and its number ticks up under them.
      flyCoins({ from: { x: x + w / 2, y: y + h / 2 }, to: target, count: coins, onLand: answer?.onHit, landed: answer?.landed,
        sparkleEnd: true });
    });
  };

  const hide = useCallback(() => {
    if (hiding.current) return;
    hiding.current = true;
    cancelAnimation(enter);
    enter.value = withTiming(0, { duration: reduced ? DURATION.quick : DURATION.exit, easing: EASE.in }, done => {
      if (done) runOnJS(onHide)();
    });
  }, [enter, onHide, reduced]);

  useEffect(() => {
    // One buzz through the shared gate when it shows: a win buzzes, info ticks, a problem is a soft bump.
    queueHaptic(toastHaptic(toast.type));
    let coinTimer: ReturnType<typeof setTimeout> | null = null;
    if (reduced) {
      enter.value = withTiming(1, { duration: DURATION.quick });
    } else {
      // Springs up from the footer with one confident overshoot, then the icon hops and pops.
      enter.value = withSpring(1, SPRING.stamp);
      iconPop.value = withDelay(TOAST_MOTION.iconPopAt, withSequence(
        withTiming(reward ? TOAST_MOTION.rewardPop : TOAST_MOTION.iconPop, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.pop)));
      // The big "+25" stamps in right behind the icon (one overshoot, SPRING.pop).
      if (coinAmount > 0) amountPop.value = withDelay(TOAST_MOTION.iconPopAt + 60, withSequence(
        withTiming(1.3, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.pop)));
      iconHop.value = withDelay(TOAST_MOTION.iconPopAt, withSequence(
        withTiming(-TOAST_MOTION.iconHopPt, { duration: 110, easing: EASE.out }), withSpring(0, SPRING.pop)));
      // "+25 coins": the coins fly from the icon to where they live (the wallet chip on screen), and the
      // chip hears about them now, so a gain that shows up with this toast rolls under these coins.
      const coins = Math.min(toastCoinCount(toast.message), momentParticles(TOAST_MOTION.coinFlyMax, budget, reduced));
      if (coins > 0) {
        measureCoinTarget((target, answer) => {
          if (!target) return;
          answer?.onIncoming?.(TOAST_MOTION.coinFlyAt + flightMs(coins) + 200);
          coinTimer = setTimeout(() => flyFromIcon(target, coins, answer), TOAST_MOTION.coinFlyAt);
        });
      }
      if (win) {
        sparkle.value = withDelay(TOAST_MOTION.iconPopAt + 60, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
        shine.value = withDelay(TOAST_MOTION.shineAt, withTiming(1, { duration: TOAST_MOTION.shineMs, easing: EASE.inOut }));
      }
    }
    const timeout = setTimeout(hide, toast.duration || TOAST_MOTION.showMs);
    return () => { clearTimeout(timeout); if (coinTimer) clearTimeout(coinTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => { drag.value = g.dy > 0 ? g.dy : g.dy * 0.25; },
    onPanResponderRelease: (_e, g) => {
      if (g.dy > TOAST_MOTION.swipePt || g.vy > 0.6) { hide(); return; }
      drag.value = withSpring(0, SPRING.settle);
    },
    onPanResponderTerminate: () => { drag.value = withSpring(0, SPRING.settle); },
  }), [drag, hide]);

  const cardStyle = useAnimatedStyle(() => {
    const e = enter.value;
    return reduced
      ? { opacity: e }
      : { opacity: Math.min(1, e * 1.6), transform: [{ translateY: (1 - e) * TOAST_MOTION.enterFromPt + drag.value },
        { scale: TOAST_MOTION.enterScale + (1 - TOAST_MOTION.enterScale) * e }] };
  });
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: iconHop.value }, { scale: iconPop.value }] }));
  const amountStyle = useAnimatedStyle(() => ({ transform: [{ scale: amountPop.value }] }));
  const shineStyle = useAnimatedStyle(() => {
    const p = shine.value;
    return { opacity: p > 0 && p < 1 ? 0.75 : 0, transform: [{ translateX: -80 + (width + 80) * p }, { skewX: '-20deg' }] };
  });

  const config = toastConfig[toast.type];

  return (
    <Animated.View {...pan.panHandlers} style={[{ marginBottom: index * 8 }, cardStyle]}>
    <View
      style={[
        styles.toast,
        {
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
        },
      ]}
    >
      {/* A win's shine sweeps once across the card (clipped by the card's rounded frame). */}
      {win && !reduced && <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]} />}
      <TouchableOpacity
        style={styles.toastContent}
        onPress={hide}
        activeOpacity={0.9}
      >
        {/* Icon */}
        <Animated.View ref={iconRef} collapsable={false} style={iconStyle}>
          {coinAmount > 0
            ? <GameIcon name="coins" size={TOAST_MOTION.coinIconPt} />
            : toastIcon(toast.type, toast.icon) === 'check'
            ? <GoldCheck size={TOAST_MOTION.iconPt} />
            : <GameIcon name={toastIcon(toast.type, toast.icon)} size={TOAST_MOTION.iconPt} />}
        </Animated.View>

        {/* A coin toast reads with zero words: the coin stack and a big gold "+25"; the words are small. */}
        {coinAmount > 0 && <Animated.Text style={[styles.amount, amountStyle]} maxFontSizeMultiplier={1.2}
          accessibilityLabel={`plus ${coinAmount} coins`}>{`+${coinAmount.toLocaleString('en-US')}`}</Animated.Text>}

        {/* Message (server text may carry [icon:name] tokens or legacy emoji; emoji never render) */}
        <GameRichText preset="bodySmall" style={styles.message} numberOfLines={2}>
          {coinAmount > 0 ? coinCaption : toast.message}
        </GameRichText>

        {/* Action button */}
        {toast.action && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: config.borderColor }]}
            onPress={() => {
              toast.action?.onPress();
              hide();
            }}
          >
            <Text style={styles.actionText}>{toast.action.label}</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </View>
      {/* Star sparkles fly off a win's icon, outside the card so nothing clips them (one shot, then gone). */}
      {win && !reduced && <SparkleBurst progress={sparkle} count={reward ? TOAST_MOTION.rewardSparkles : TOAST_MOTION.winSparkles}
        x={toastIconCenter(coinAmount > 0)} y={toastIconCenter(coinAmount > 0)} spread={[-200, 20]} dist={[26, 44]} size={[14, 18]} gravity={12}
        seed={toast.message.length} />}
    </Animated.View>
  );
}

/** Where the toast icon sits inside the card (border + padding + half the 28 pt icon). */
const toastIconCenter = (coin: boolean) => 3 + spacing.md + (coin ? TOAST_MOTION.coinIconPt : TOAST_MOTION.iconPt) / 2;

// Toast type configurations: a white card with a coloured frame, never a dark or purple fill.
export const toastConfig: Record<ToastType, { icon: GameIconName; backgroundColor: string; borderColor: string }> = {
  // Success is gold and white (never green): the same family as every win in the app.
  success: { icon: 'check', backgroundColor: BRAND.white, borderColor: BRAND.gold },
  error: { icon: 'close', backgroundColor: BRAND.white, borderColor: BRAND.red },
  warning: { icon: 'info', backgroundColor: BRAND.cream, borderColor: BRAND.goldLip },
  info: { icon: 'info', backgroundColor: BRAND.white, borderColor: BRAND.blueBright },
  reward: { icon: 'gift', backgroundColor: BRAND.cream, borderColor: BRAND.gold },
};

/** The art for a toast: an explicit icon name, a mapped legacy emoji, or the type's icon. */
export function toastIcon(type: ToastType, icon?: string): GameIconName {
  if (icon) {
    const named = resolveIconName(icon) ?? iconForEmoji(icon);
    if (named) return named;
  }
  return toastConfig[type].icon;
}

// Convenience hooks
export function useSuccessToast() {
  const { showToast } = useToast();
  return useCallback(
    (message: string, icon?: string) => showToast({ type: 'success', message, icon }),
    [showToast]
  );
}

export function useErrorToast() {
  const { showToast } = useToast();
  return useCallback(
    (message: string, icon?: string) => showToast({ type: 'error', message, icon }),
    [showToast]
  );
}

export function useRewardToast() {
  const { showToast } = useToast();
  return useCallback(
    (message: string, icon?: string) => showToast({ type: 'reward', message, icon, duration: 4000 }),
    [showToast]
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100, // Above bottom nav
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    width: width - 32,
    borderRadius: borderRadius.lg,
    borderWidth: 3,
    borderBottomWidth: 5,
    ...shadows.lg,
    overflow: 'hidden',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  shine: {
    position: 'absolute',
    top: -10,
    bottom: -10,
    left: 0,
    width: 34,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  message: {
    flex: 1,
    color: BRAND.navy,
  },
  amount: {
    fontFamily: FONT.display,
    fontSize: TOAST_MOTION.amountPt,
    lineHeight: TOAST_MOTION.amountPt + 4,
    color: BRAND.gold,
    textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0.5,
  },
  actionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  actionText: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: 'white',
    textTransform: 'uppercase',
  },
});
