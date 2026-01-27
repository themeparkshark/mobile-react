/**
 * Haptic Patterns Library
 * Consistent haptic feedback for different game events
 * 
 * Usage:
 *   import HapticPatterns from '../helpers/hapticPatterns';
 *   HapticPatterns.collect('legendary');
 *   HapticPatterns.success();
 *   HapticPatterns.buttonTap();
 */

import { Platform } from 'react-native';
import * as Haptics from './haptics';

type RarityLevel = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

// Helper to run haptic sequences
const sequence = (
  actions: Array<{ type: 'impact' | 'notification'; style: string; delay: number }>
) => {
  if (Platform.OS !== 'ios') return;

  actions.forEach(({ type, style, delay }) => {
    setTimeout(() => {
      if (type === 'impact') {
        Haptics.impactAsync(style);
      } else {
        Haptics.notificationAsync(style);
      }
    }, delay);
  });
};

const HapticPatterns = {
  /**
   * Button tap - light feedback for any button press
   */
  buttonTap: () => {
    if (Platform.OS !== 'ios') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  /**
   * Selection - for toggles, tabs, radio buttons
   */
  selection: () => {
    if (Platform.OS !== 'ios') return;
    Haptics.selectionAsync();
  },

  /**
   * Collect item - intensity scales with rarity
   */
  collect: (rarity: RarityLevel = 'common') => {
    if (Platform.OS !== 'ios') return;

    switch (rarity) {
      case 'common':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
        
      case 'uncommon':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
        
      case 'rare':
        // Double tap
        sequence([
          { type: 'impact', style: Haptics.ImpactFeedbackStyle.Medium, delay: 0 },
          { type: 'impact', style: Haptics.ImpactFeedbackStyle.Light, delay: 80 },
        ]);
        break;
        
      case 'epic':
        // Triple tap escalating
        sequence([
          { type: 'impact', style: Haptics.ImpactFeedbackStyle.Light, delay: 0 },
          { type: 'impact', style: Haptics.ImpactFeedbackStyle.Medium, delay: 80 },
          { type: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delay: 160 },
        ]);
        break;
        
      case 'legendary':
        // Success notification + heavy impacts
        sequence([
          { type: 'notification', style: Haptics.NotificationFeedbackType.Success, delay: 0 },
          { type: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delay: 200 },
          { type: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delay: 350 },
          { type: 'notification', style: Haptics.NotificationFeedbackType.Success, delay: 500 },
        ]);
        break;
    }
  },

  /**
   * Success - positive completion (level up, set complete, etc.)
   */
  success: () => {
    if (Platform.OS !== 'ios') return;
    sequence([
      { type: 'notification', style: Haptics.NotificationFeedbackType.Success, delay: 0 },
      { type: 'impact', style: Haptics.ImpactFeedbackStyle.Light, delay: 150 },
    ]);
  },

  /**
   * Achievement - big accomplishment
   */
  achievement: () => {
    if (Platform.OS !== 'ios') return;
    sequence([
      { type: 'notification', style: Haptics.NotificationFeedbackType.Success, delay: 0 },
      { type: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delay: 200 },
      { type: 'impact', style: Haptics.ImpactFeedbackStyle.Medium, delay: 350 },
      { type: 'notification', style: Haptics.NotificationFeedbackType.Success, delay: 500 },
      { type: 'impact', style: Haptics.ImpactFeedbackStyle.Light, delay: 650 },
    ]);
  },

  /**
   * Error - something went wrong
   */
  error: () => {
    if (Platform.OS !== 'ios') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },

  /**
   * Warning - caution needed
   */
  warning: () => {
    if (Platform.OS !== 'ios') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },

  /**
   * Tick - for rapid repeated actions (like tap game)
   */
  tick: () => {
    if (Platform.OS !== 'ios') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  /**
   * Countdown tick - slightly heavier for countdown moments
   */
  countdownTick: () => {
    if (Platform.OS !== 'ios') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },

  /**
   * Streak milestone - celebrating streak achievements
   */
  streakMilestone: (days: number) => {
    if (Platform.OS !== 'ios') return;

    if (days >= 100) {
      // Legendary streak!
      HapticPatterns.achievement();
    } else if (days >= 50) {
      // Epic streak
      sequence([
        { type: 'notification', style: Haptics.NotificationFeedbackType.Success, delay: 0 },
        { type: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delay: 200 },
        { type: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delay: 350 },
      ]);
    } else if (days >= 25) {
      // Rare streak
      sequence([
        { type: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delay: 0 },
        { type: 'impact', style: Haptics.ImpactFeedbackStyle.Medium, delay: 100 },
      ]);
    } else if (days >= 10) {
      // Uncommon streak
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (days >= 5) {
      // Getting started
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  },

  /**
   * Mini-game result - based on multiplier achieved
   */
  miniGameResult: (multiplier: number) => {
    if (Platform.OS !== 'ios') return;

    if (multiplier >= 2.0) {
      // Perfect!
      HapticPatterns.achievement();
    } else if (multiplier >= 1.5) {
      // Great!
      HapticPatterns.success();
    } else if (multiplier >= 1.0) {
      // Good
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      // Could be better
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  },

  /**
   * Level up - XP level increase
   */
  levelUp: () => {
    if (Platform.OS !== 'ios') return;
    sequence([
      { type: 'notification', style: Haptics.NotificationFeedbackType.Success, delay: 0 },
      { type: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delay: 150 },
      { type: 'impact', style: Haptics.ImpactFeedbackStyle.Medium, delay: 250 },
      { type: 'impact', style: Haptics.ImpactFeedbackStyle.Light, delay: 350 },
      { type: 'notification', style: Haptics.NotificationFeedbackType.Success, delay: 500 },
    ]);
  },

  /**
   * Coin level up - when a ride coin levels up
   */
  coinLevelUp: (newLevel: number) => {
    if (Platform.OS !== 'ios') return;

    if (newLevel >= 5) {
      // MAX LEVEL!
      HapticPatterns.achievement();
    } else {
      HapticPatterns.success();
    }
  },

  /**
   * Set complete - all items in a set collected
   */
  setComplete: () => {
    if (Platform.OS !== 'ios') return;
    // Big celebration
    HapticPatterns.achievement();
  },

  /**
   * Timer complete - energy regenerated, cooldown done
   */
  timerComplete: () => {
    if (Platform.OS !== 'ios') return;
    sequence([
      { type: 'impact', style: Haptics.ImpactFeedbackStyle.Medium, delay: 0 },
      { type: 'impact', style: Haptics.ImpactFeedbackStyle.Light, delay: 100 },
    ]);
  },

  /**
   * Modal open - subtle feedback when modal appears
   */
  modalOpen: () => {
    if (Platform.OS !== 'ios') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  /**
   * Modal close - subtle feedback when modal closes
   */
  modalClose: () => {
    if (Platform.OS !== 'ios') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  /**
   * Swipe complete - for swipe gestures
   */
  swipeComplete: () => {
    if (Platform.OS !== 'ios') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },

  /**
   * Heartbeat - for low energy/timer warnings
   */
  heartbeat: () => {
    if (Platform.OS !== 'ios') return;
    sequence([
      { type: 'impact', style: Haptics.ImpactFeedbackStyle.Heavy, delay: 0 },
      { type: 'impact', style: Haptics.ImpactFeedbackStyle.Light, delay: 150 },
    ]);
  },

  /**
   * Rapid fire - for combo/tap games
   * @param count - number in sequence (for intensity scaling)
   */
  rapidFire: (count: number) => {
    if (Platform.OS !== 'ios') return;
    
    // Every 10 taps, do a heavier impact
    if (count % 10 === 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (count % 5 === 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  },
};

export default HapticPatterns;
