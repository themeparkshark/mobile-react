import { useEffect, useMemo, useRef, useState, createContext, useContext, useCallback, ReactNode } from 'react';
import { PanResponder, StyleSheet, Text, View, TouchableOpacity, Dimensions } from 'react-native';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring,
  withTiming } from 'react-native-reanimated';
import { queueHaptic, type HapticIntent } from '../gamekit/Haptics';
import { DURATION, EASE, SPRING } from '../ui/motionEasing';
import SparkleBurst from '../ui/SparkleBurst';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { colors, shadows, borderRadius, spacing, typography } from '../design-system';
import { onToast } from '../utils/toast';
import { BRAND, GameIcon, GameRichText, iconForEmoji, resolveIconName, type GameIconName } from '../ui';

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
} as const;

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
  const sparkle = useSharedValue(0);
  const shine = useSharedValue(0);
  const hiding = useRef(false);
  const win = toast.type === 'success' || toast.type === 'reward';
  const reward = toast.type === 'reward';

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
    if (reduced) {
      enter.value = withTiming(1, { duration: DURATION.quick });
    } else {
      enter.value = withSpring(1, SPRING.settle);
      iconPop.value = withDelay(TOAST_MOTION.iconPopAt, withSequence(
        withTiming(reward ? TOAST_MOTION.rewardPop : TOAST_MOTION.iconPop, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.pop)));
      if (win) {
        sparkle.value = withDelay(TOAST_MOTION.iconPopAt + 60, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
        shine.value = withDelay(TOAST_MOTION.shineAt, withTiming(1, { duration: TOAST_MOTION.shineMs, easing: EASE.inOut }));
      }
    }
    const timeout = setTimeout(hide, toast.duration || TOAST_MOTION.showMs);
    return () => clearTimeout(timeout);
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
      : { opacity: Math.min(1, e * 1.6), transform: [{ translateY: (1 - e) * 110 + drag.value }] };
  });
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconPop.value }] }));
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
        <Animated.View style={iconStyle}>
          <GameIcon name={toastIcon(toast.type, toast.icon)} size={28} />
        </Animated.View>

        {/* Message (server text may carry [icon:name] tokens or legacy emoji; emoji never render) */}
        <GameRichText preset="bodySmall" style={styles.message} numberOfLines={2}>
          {toast.message}
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
        x={TOAST_ICON_CENTER.x} y={TOAST_ICON_CENTER.y} spread={[-200, 20]} dist={[26, 44]} size={[14, 18]} gravity={12}
        seed={toast.message.length} />}
    </Animated.View>
  );
}

/** Where the toast icon sits inside the card (border + padding + half the 28 pt icon). */
const TOAST_ICON_CENTER = { x: 3 + spacing.md + 14, y: 3 + spacing.md + 14 } as const;

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
