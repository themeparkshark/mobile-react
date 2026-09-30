import { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, StyleSheet, Text, View, Image } from 'react-native';
import * as Haptics from '../helpers/haptics';
import { colors, shadows, borderRadius, spacing, typography } from '../design-system';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string; // emoji or image URL
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  xpReward?: number;
  coinReward?: number;
}

interface Props {
  visible: boolean;
  achievement: Achievement | null;
  onHide: () => void;
}

/**
 * Achievement unlock popup - slides in from right with fanfare.
 * Inspired by Xbox/PlayStation achievement popups.
 */
export default function AchievementPopup({ visible, achievement, onHide }: Props) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const iconScaleAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const rarityColors = {
    common: colors.rarity.common.main,
    rare: colors.rarity.rare.main,
    epic: colors.rarity.epic.main,
    legendary: colors.rarity.legendary.main,
  };

  useEffect(() => {
    if (visible && achievement) {
      // Haptic celebration
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 200);

      // Slide in from right
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();

      // Pop in the icon after a delay
      setTimeout(() => {
        Animated.spring(iconScaleAnim, {
          toValue: 1,
          friction: 3,
          tension: 100,
          useNativeDriver: true,
        }).start();
      }, 300);

      // Glow animation for legendary
      if (achievement.rarity === 'legendary') {
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
            Animated.timing(glowAnim, { toValue: 0.3, duration: 800, useNativeDriver: false }),
          ])
        ).start();
      }

      // Auto-hide after 4 seconds
      const timeout = setTimeout(() => {
        hidePopup();
      }, 4000);

      return () => clearTimeout(timeout);
    }
  }, [visible, achievement]);

  const hidePopup = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 400,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.5,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      iconScaleAnim.setValue(0);
      glowAnim.setValue(0);
      onHide();
    });
  };

  if (!visible || !achievement) return null;

  const rarityColor = rarityColors[achievement.rarity || 'common'];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateX: slideAnim },
            { scale: scaleAnim },
          ],
          borderColor: rarityColor,
        },
      ]}
    >
      {/* Glow for legendary */}
      {achievement.rarity === 'legendary' && (
        <Animated.View
          style={[
            styles.glow,
            {
              backgroundColor: rarityColor,
              opacity: glowAnim,
            },
          ]}
        />
      )}

      {/* Icon */}
      <Animated.View
        style={[
          styles.iconContainer,
          {
            backgroundColor: rarityColor,
            transform: [{ scale: iconScaleAnim }],
          },
        ]}
      >
        <Text style={styles.icon}>{achievement.icon}</Text>
      </Animated.View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.label}>🏆 ACHIEVEMENT UNLOCKED</Text>
        <Text style={styles.title}>{achievement.title}</Text>
        <Text style={styles.description}>{achievement.description}</Text>
        
        {/* Rewards */}
        {(achievement.xpReward || achievement.coinReward) && (
          <View style={styles.rewards}>
            {achievement.xpReward && (
              <Text style={styles.reward}>+{achievement.xpReward} XP</Text>
            )}
            {achievement.coinReward && (
              <Text style={styles.reward}>+{achievement.coinReward} 🪙</Text>
            )}
          </View>
        )}
      </View>

      {/* Rarity badge */}
      {achievement.rarity && achievement.rarity !== 'common' && (
        <View style={[styles.rarityBadge, { backgroundColor: rarityColor }]}>
          <Text style={styles.rarityText}>
            {achievement.rarity.toUpperCase()}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    right: 16,
    width: 320,
    backgroundColor: colors.bgMedium,
    borderRadius: borderRadius.xl,
    borderWidth: 3,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.lg,
    zIndex: 2000,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    borderRadius: borderRadius.xl + 20,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  icon: {
    fontSize: 32,
  },
  content: {
    flex: 1,
  },
  label: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: colors.tertiary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontFamily: 'Knockout',
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  description: {
    fontFamily: 'System',
    fontSize: 11,
    color: colors.textSecondary,
  },
  rewards: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  reward: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: colors.tertiary,
  },
  rarityBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  rarityText: {
    fontFamily: 'Knockout',
    fontSize: 9,
    color: 'white',
  },
});

/**
 * Hook for managing achievement popups
 */
export function useAchievements() {
  const [queue, setQueue] = useState<Achievement[]>([]);
  const [current, setCurrent] = useState<Achievement | null>(null);
  const [visible, setVisible] = useState(false);

  const showAchievement = useCallback((achievement: Achievement) => {
    if (current) {
      // Queue if one is already showing
      setQueue((prev) => [...prev, achievement]);
    } else {
      setCurrent(achievement);
      setVisible(true);
    }
  }, [current]);

  const hideAchievement = useCallback(() => {
    setVisible(false);
    setCurrent(null);
    
    // Show next in queue
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      setTimeout(() => {
        setCurrent(next);
        setVisible(true);
      }, 500);
    }
  }, [queue]);

  return {
    current,
    visible,
    showAchievement,
    hideAchievement,
  };
}
