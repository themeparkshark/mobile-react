import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../design-system';

interface Props {
  size?: number;
  color?: string;
  pulseColor?: string;
  duration?: number;
}

/**
 * Pulsing dot indicator - great for "live" indicators,
 * notifications, or attention-grabbing elements.
 */
export default function PulsingDot({
  size = 12,
  color = colors.success,
  pulseColor,
  duration = 1500,
}: Props) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: duration / 2,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: duration / 2,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [duration]);

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 0],
  });

  return (
    <View style={[styles.container, { width: size * 2.5, height: size * 2.5 }]}>
      {/* Pulse ring */}
      <Animated.View
        style={[
          styles.pulse,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: pulseColor || color,
            transform: [{ scale: pulseScale }],
            opacity: pulseOpacity,
          },
        ]}
      />
      {/* Solid dot */}
      <View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

/**
 * Online status indicator with text
 */
export function OnlineIndicator({
  online,
  showText = true,
}: {
  online: boolean;
  showText?: boolean;
}) {
  return (
    <View style={styles.onlineContainer}>
      <PulsingDot
        size={8}
        color={online ? colors.success : colors.textMuted}
        duration={online ? 1500 : 0}
      />
      {showText && (
        <Animated.Text style={[styles.onlineText, { color: online ? colors.success : colors.textMuted }]}>
          {online ? 'Online' : 'Offline'}
        </Animated.Text>
      )}
    </View>
  );
}

/**
 * New/unread badge with pulse
 */
export function NewBadge({ count }: { count?: number }) {
  if (!count && count !== 0) {
    return <PulsingDot size={8} color={colors.error} />;
  }

  return (
    <View style={styles.countBadge}>
      <Animated.Text style={styles.countText}>
        {count > 99 ? '99+' : count}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
  },
  dot: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  onlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onlineText: {
    fontFamily: 'Knockout',
    fontSize: 12,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countText: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: 'white',
  },
});
