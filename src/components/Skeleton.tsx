import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
// LinearGradient temporarily replaced — native module broken after Skia install
import { colors, borderRadius } from '../design-system';

interface Props {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Skeleton loading placeholder with shimmer effect.
 * Use while content is loading for a polished feel.
 */
export default function Skeleton({
  width = '100%',
  height = 20,
  borderRadius: radius = borderRadius.md,
  style,
}: Props) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  return (
    <View
      style={[
        styles.container,
        {
          width: width as any,
          height,
          borderRadius: radius,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.shimmer,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        <View style={[styles.gradient, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]} />
      </Animated.View>
    </View>
  );
}

/**
 * Skeleton text line
 */
export function SkeletonText({
  lines = 1,
  lastLineWidth = '60%',
}: {
  lines?: number;
  lastLineWidth?: string | number;
}) {
  return (
    <View style={styles.textContainer}>
      {Array(lines)
        .fill(0)
        .map((_, i) => (
          <Skeleton
            key={i}
            width={i === lines - 1 ? lastLineWidth : '100%'}
            height={14}
            style={{ marginBottom: i < lines - 1 ? 8 : 0 }}
          />
        ))}
    </View>
  );
}

/**
 * Skeleton avatar circle
 */
export function SkeletonAvatar({ size = 48 }: { size?: number }) {
  return <Skeleton width={size} height={size} borderRadius={size / 2} />;
}

/**
 * Skeleton card layout
 */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SkeletonAvatar size={40} />
        <View style={styles.cardHeaderText}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
        </View>
      </View>
      <SkeletonText lines={3} />
      <Skeleton height={150} style={{ marginTop: 12 }} borderRadius={borderRadius.lg} />
    </View>
  );
}

/**
 * Skeleton list item
 */
export function SkeletonListItem() {
  return (
    <View style={styles.listItem}>
      <SkeletonAvatar size={44} />
      <View style={styles.listItemContent}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="50%" height={12} style={{ marginTop: 6 }} />
      </View>
      <Skeleton width={60} height={24} borderRadius={borderRadius.sm} />
    </View>
  );
}

/**
 * Skeleton grid item (for collections)
 */
export function SkeletonGridItem({ size = 80 }: { size?: number }) {
  return (
    <View style={styles.gridItem}>
      <Skeleton width={size} height={size} borderRadius={borderRadius.lg} />
      <Skeleton width={size * 0.8} height={10} style={{ marginTop: 8 }} />
    </View>
  );
}

/**
 * Skeleton for collection grid
 */
export function SkeletonGrid({
  columns = 4,
  rows = 2,
  itemSize = 70,
}: {
  columns?: number;
  rows?: number;
  itemSize?: number;
}) {
  return (
    <View style={styles.grid}>
      {Array(rows * columns)
        .fill(0)
        .map((_, i) => (
          <View key={i} style={{ width: `${100 / columns}%`, padding: 4 }}>
            <SkeletonGridItem size={itemSize} />
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgLight,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 200,
  },
  gradient: {
    flex: 1,
  },
  textContainer: {
    width: '100%',
  },
  card: {
    backgroundColor: colors.bgMedium,
    borderRadius: borderRadius.lg,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.bgMedium,
    borderRadius: borderRadius.md,
  },
  listItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  gridItem: {
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
