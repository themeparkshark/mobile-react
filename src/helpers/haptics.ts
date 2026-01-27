// Haptics wrapper with graceful fallback
let Haptics: any = null;

try {
  Haptics = require('expo-haptics');
} catch (e) {
  // expo-haptics not available, create no-op fallback
}

export const impactAsync = async (style?: string) => {
  if (Haptics?.impactAsync) {
    try {
      await Haptics.impactAsync(style || Haptics.ImpactFeedbackStyle?.Light);
    } catch (e) {
      // Silently fail
    }
  }
};

export const notificationAsync = async (type?: string) => {
  if (Haptics?.notificationAsync) {
    try {
      await Haptics.notificationAsync(type || Haptics.NotificationFeedbackType?.Success);
    } catch (e) {
      // Silently fail
    }
  }
};

export const selectionAsync = async () => {
  if (Haptics?.selectionAsync) {
    try {
      await Haptics.selectionAsync();
    } catch (e) {
      // Silently fail
    }
  }
};

export const ImpactFeedbackStyle = Haptics?.ImpactFeedbackStyle || {
  Light: 'light',
  Medium: 'medium',
  Heavy: 'heavy',
};

export const NotificationFeedbackType = Haptics?.NotificationFeedbackType || {
  Success: 'success',
  Warning: 'warning',
  Error: 'error',
};

export default {
  impactAsync,
  notificationAsync,
  selectionAsync,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
};
