import { useEffect, useRef, useState, createContext, useContext, useCallback, ReactNode } from 'react';
import { Animated, StyleSheet, Text, View, TouchableOpacity, Dimensions } from 'react-native';
import * as Haptics from '../helpers/haptics';
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
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { ...toast, id }]);

    // Haptic based on type
    switch (toast.type) {
      case 'success':
      case 'reward':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      default:
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
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

/**
 * Toast Container - renders all active toasts
 */
function ToastContainer({
  toasts,
  onHide,
}: {
  toasts: Toast[];
  onHide: (id: string) => void;
}) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((toast, index) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          index={index}
          onHide={() => onHide(toast.id)}
        />
      ))}
    </View>
  );
}

/**
 * Single Toast Item
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
  const slideAnim = useRef(new Animated.Value(100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-hide
    const duration = toast.duration || 3000;
    const timeout = setTimeout(() => {
      hide();
    }, duration);

    return () => clearTimeout(timeout);
  }, []);

  const hide = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(onHide);
  };

  const config = toastConfig[toast.type];

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
          marginBottom: index * 8,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.toastContent}
        onPress={hide}
        activeOpacity={0.9}
      >
        {/* Icon */}
        <GameIcon name={toastIcon(toast.type, toast.icon)} size={28} />

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
    </Animated.View>
  );
}

// Toast type configurations: a white card with a coloured frame, never a dark or purple fill.
export const toastConfig: Record<ToastType, { icon: GameIconName; backgroundColor: string; borderColor: string }> = {
  success: { icon: 'check', backgroundColor: BRAND.white, borderColor: BRAND.green },
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
