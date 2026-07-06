/**
 * LinePlayBanner — soft, dismissible banner surfaced when we detect the player
 * may be in line for a ride ("In line for {ride}? Start a Line Session").
 *
 * This is intentionally a plain inline component, NEVER a modal. It is exported
 * for Explore to render (Wave 3 integration). We do NOT edit ExploreScreen /
 * HomeExplore here — this component just needs to exist and be importable.
 *
 * Rendering contract: place it where soft banners/toasts already render on
 * Explore. It sizes to its content and animates in; it takes an onStart and
 * onDismiss so the host owns navigation and dismissal state.
 */

import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, spacing, borderRadius, shadows } from '../../design-system';

export interface LinePlayBannerProps {
  readonly rideName: string;
  readonly postedWaitMinutes?: number | null;
  readonly onStart: () => void;
  readonly onDismiss: () => void;
}

export default function LinePlayBanner({
  rideName,
  postedWaitMinutes,
  onStart,
  onDismiss,
}: LinePlayBannerProps) {
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [enter]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * -12 }],
  }));

  return (
    <Animated.View style={[styles.wrap, animStyle]}>
      <View style={styles.iconChip}>
        <Text style={styles.iconChipText}>🎢</Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          In line for {rideName}?
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {postedWaitMinutes != null && postedWaitMinutes > 0
            ? `Start a Line Session · ${postedWaitMinutes} min posted`
            : 'Start a Line Session and earn while you wait'}
        </Text>
      </View>
      <Pressable
        onPress={onStart}
        style={({ pressed }) => [styles.startBtn, pressed && styles.startBtnPressed]}
        hitSlop={8}
      >
        <Text style={styles.startBtnText}>Start</Text>
      </Pressable>
      <Pressable onPress={onDismiss} style={styles.dismiss} hitSlop={10}>
        <Text style={styles.dismissText}>×</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgMedium,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.secondary,
    ...shadows.lg,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChipText: {
    fontSize: 20,
  },
  copy: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  startBtn: {
    backgroundColor: colors.tertiary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  startBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  startBtnText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 14,
  },
  dismiss: {
    marginLeft: spacing.xs,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    color: colors.textMuted,
    fontSize: 20,
    lineHeight: 20,
  },
});
