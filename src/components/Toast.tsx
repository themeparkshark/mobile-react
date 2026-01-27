import { useEffect, useRef, useState, createContext, useContext, useCallback, ReactNode } from 'react';
import { Animated, StyleSheet, Text, View, TouchableOpacity, Dimensions } from 'react-native';
import * as Haptics from '../helpers/haptics';
import { colors, shadows, borderRadius, spacing, typography } from '../design-system';

// Toast types
type ToastType = 'success' | 'error' | 'warning' | 'info' | 'reward';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
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
        <Text style={styles.icon}>{toast.icon || config.icon}</Text>

        {/* Message */}
        <Text style={styles.message} numberOfLines={2}>
          {toast.message}
        </Text>

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

// Toast type configurations
const toastConfig = {
  success: {
    icon: '✅',
    backgroundColor: 'rgba(76, 175, 80, 0.95)',
    borderColor: '#4CAF50',
  },
  error: {
    icon: '❌',
    backgroundColor: 'rgba(244, 67, 54, 0.95)',
    borderColor: '#F44336',
  },
  warning: {
    icon: '⚠️',
    backgroundColor: 'rgba(255, 193, 7, 0.95)',
    borderColor: '#FFC107',
  },
  info: {
    icon: 'ℹ️',
    backgroundColor: 'rgba(33, 150, 243, 0.95)',
    borderColor: '#2196F3',
  },
  reward: {
    icon: '🎁',
    backgroundColor: 'rgba(156, 39, 176, 0.95)',
    borderColor: '#9C27B0',
  },
};

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
    borderWidth: 2,
    ...shadows.lg,
    overflow: 'hidden',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  icon: {
    fontSize: 20,
  },
  message: {
    flex: 1,
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'white',
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
