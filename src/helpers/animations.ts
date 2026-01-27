import { Animated, Easing } from 'react-native';
import * as Haptics from './haptics';

/**
 * Screen shake effect for big moments
 */
export const screenShake = (animValue: Animated.Value, intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
  const intensityMap = {
    light: 3,
    medium: 6,
    heavy: 10,
  };
  const distance = intensityMap[intensity];

  Animated.sequence([
    Animated.timing(animValue, { toValue: distance, duration: 50, useNativeDriver: true }),
    Animated.timing(animValue, { toValue: -distance, duration: 50, useNativeDriver: true }),
    Animated.timing(animValue, { toValue: distance / 2, duration: 50, useNativeDriver: true }),
    Animated.timing(animValue, { toValue: -distance / 2, duration: 50, useNativeDriver: true }),
    Animated.timing(animValue, { toValue: 0, duration: 50, useNativeDriver: true }),
  ]).start();

  // Haptic feedback
  if (intensity === 'heavy') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } else {
    Haptics.impactAsync(intensity === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
  }
};

/**
 * Pop/bounce animation for appearing elements
 */
export const popIn = (animValue: Animated.Value, callback?: () => void) => {
  animValue.setValue(0);
  Animated.spring(animValue, {
    toValue: 1,
    friction: 4,
    tension: 100,
    useNativeDriver: true,
  }).start(callback);
};

/**
 * Bounce effect for buttons/rewards
 */
export const bounce = (animValue: Animated.Value) => {
  Animated.sequence([
    Animated.timing(animValue, { toValue: 1.2, duration: 100, useNativeDriver: true }),
    Animated.spring(animValue, { toValue: 1, friction: 3, tension: 100, useNativeDriver: true }),
  ]).start();
};

/**
 * Pulse animation for attention
 */
export const pulse = (animValue: Animated.Value, duration: number = 1000) => {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(animValue, { toValue: 1.1, duration: duration / 2, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: 1, duration: duration / 2, useNativeDriver: true }),
    ])
  );
};

/**
 * Glow intensity animation
 */
export const glowPulse = (animValue: Animated.Value, min: number = 0.3, max: number = 0.7, duration: number = 1500) => {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(animValue, { toValue: max, duration: duration / 2, useNativeDriver: false }),
      Animated.timing(animValue, { toValue: min, duration: duration / 2, useNativeDriver: false }),
    ])
  );
};

/**
 * Coin/number counter animation
 */
export const countUp = (
  animValue: Animated.Value,
  from: number,
  to: number,
  duration: number = 1000,
  onUpdate?: (value: number) => void
) => {
  animValue.setValue(from);
  
  const animation = Animated.timing(animValue, {
    toValue: to,
    duration,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: false,
  });

  if (onUpdate) {
    animValue.addListener(({ value }) => onUpdate(Math.floor(value)));
  }

  animation.start(() => {
    animValue.removeAllListeners();
  });

  return animation;
};

/**
 * Slide up animation for modals/toasts
 */
export const slideUp = (animValue: Animated.Value, distance: number = 100) => {
  animValue.setValue(distance);
  Animated.spring(animValue, {
    toValue: 0,
    friction: 8,
    tension: 100,
    useNativeDriver: true,
  }).start();
};

/**
 * Fade in animation
 */
export const fadeIn = (animValue: Animated.Value, duration: number = 300) => {
  animValue.setValue(0);
  Animated.timing(animValue, {
    toValue: 1,
    duration,
    useNativeDriver: true,
  }).start();
};

/**
 * Spin animation for loading/celebration
 */
export const spin = (animValue: Animated.Value, duration: number = 1000) => {
  animValue.setValue(0);
  return Animated.loop(
    Animated.timing(animValue, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    })
  );
};

/**
 * Rarity-based haptic feedback
 */
export const rarityHaptic = (rarity: number) => {
  switch (rarity) {
    case 1: // Common
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case 2: // Uncommon
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 3: // Rare
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
    case 4: // Epic
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case 5: // Legendary
      // Pattern: heavy, pause, heavy, pause, success
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 100);
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 250);
      break;
    default:
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
};

/**
 * Celebration haptic pattern
 */
export const celebrationHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 80);
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 140);
  setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 250);
};
