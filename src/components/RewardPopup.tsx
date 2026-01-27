import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import * as Haptics from '../helpers/haptics';
import { colors, shadows, borderRadius, spacing, typography } from '../design-system';

interface RewardItem {
  icon: string;
  label: string;
  value: string | number;
  color?: string;
}

interface Props {
  visible: boolean;
  title?: string;
  rewards: RewardItem[];
  duration?: number;
  onHide?: () => void;
}

/**
 * Quick reward popup that slides in from top.
 * Use for immediate feedback on actions without interrupting flow.
 * 
 * Example: "+50 XP", "+10 Coins", "Streak x3!"
 */
export default function RewardPopup({
  visible,
  title,
  rewards,
  duration = 2500,
  onHide,
}: Props) {
  const slideAnim = useRef(new Animated.Value(-150)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const [rewardAnims] = useState(() => rewards.map(() => new Animated.Value(0)));

  useEffect(() => {
    if (visible) {
      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Slide in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();

      // Stagger reward items
      rewards.forEach((_, index) => {
        setTimeout(() => {
          Animated.spring(rewardAnims[index], {
            toValue: 1,
            friction: 4,
            tension: 100,
            useNativeDriver: true,
          }).start();
        }, 100 + index * 80);
      });

      // Auto-hide
      const hideTimeout = setTimeout(() => {
        hidePopup();
      }, duration);

      return () => clearTimeout(hideTimeout);
    }
  }, [visible]);

  const hidePopup = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -150,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Reset animations for next show
      rewardAnims.forEach((anim) => anim.setValue(0));
      scaleAnim.setValue(0.8);
      onHide?.();
    });
  };

  if (!visible && slideAnim._value === -150) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateY: slideAnim },
            { scale: scaleAnim },
          ],
          opacity: opacityAnim,
        },
      ]}
    >
      {title && <Text style={styles.title}>{title}</Text>}
      
      <View style={styles.rewardsContainer}>
        {rewards.map((reward, index) => (
          <Animated.View
            key={index}
            style={[
              styles.rewardItem,
              {
                transform: [{ scale: rewardAnims[index] }],
                opacity: rewardAnims[index],
              },
            ]}
          >
            <Text style={styles.rewardIcon}>{reward.icon}</Text>
            <View style={styles.rewardText}>
              <Text style={[styles.rewardValue, reward.color && { color: reward.color }]}>
                {typeof reward.value === 'number' ? `+${reward.value.toLocaleString()}` : reward.value}
              </Text>
              <Text style={styles.rewardLabel}>{reward.label}</Text>
            </View>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: colors.bgMedium,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.tertiary,
    ...shadows.lg,
    zIndex: 1000,
  },
  title: {
    ...typography.styles.heading3,
    textAlign: 'center',
    marginBottom: spacing.md,
    color: colors.tertiary,
  },
  rewardsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  rewardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  rewardIcon: {
    fontSize: 28,
  },
  rewardText: {
    alignItems: 'flex-start',
  },
  rewardValue: {
    fontFamily: 'Knockout',
    fontSize: 20,
    color: colors.textPrimary,
  },
  rewardLabel: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
});

/**
 * Simplified single-reward popup
 */
export function QuickReward({
  visible,
  icon,
  value,
  label,
  onHide,
}: {
  visible: boolean;
  icon: string;
  value: string | number;
  label: string;
  onHide?: () => void;
}) {
  return (
    <RewardPopup
      visible={visible}
      rewards={[{ icon, value, label }]}
      duration={1800}
      onHide={onHide}
    />
  );
}

/**
 * Streak milestone popup
 */
export function StreakPopup({
  visible,
  streak,
  multiplier,
  onHide,
}: {
  visible: boolean;
  streak: number;
  multiplier: number;
  onHide?: () => void;
}) {
  return (
    <RewardPopup
      visible={visible}
      title="🔥 STREAK!"
      rewards={[
        { icon: '🔥', value: `${streak} days`, label: 'Streak' },
        { icon: '✨', value: `${multiplier}x`, label: 'Multiplier', color: colors.tertiary },
      ]}
      duration={3000}
      onHide={onHide}
    />
  );
}
