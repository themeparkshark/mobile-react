import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors } from '../../design-system';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

const Skeleton: React.FC<SkeletonProps> = ({ width = '100%', height = 16, borderRadius = 8, style }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: colors.bgLight, opacity },
        style,
      ]}
    />
  );
};

// Pre-built skeleton layouts
const RideCardSkeleton: React.FC = () => (
  <View style={skStyles.card}>
    <View style={skStyles.row}>
      <Skeleton width={24} height={24} borderRadius={12} />
      <Skeleton width="60%" height={18} style={{ marginLeft: 8 }} />
    </View>
    <Skeleton width="40%" height={14} style={{ marginTop: 8 }} />
    <Skeleton width="80%" height={12} style={{ marginTop: 6 }} />
  </View>
);

const StatsSkeleton: React.FC = () => (
  <View style={skStyles.statsRow}>
    {[1, 2, 3].map(i => (
      <View key={i} style={skStyles.statCard}>
        <Skeleton width={40} height={32} />
        <Skeleton width={50} height={12} style={{ marginTop: 6 }} />
      </View>
    ))}
  </View>
);

const skStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgMedium, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: colors.bgMedium, borderRadius: 14, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
});

export default Skeleton;
export { RideCardSkeleton, StatsSkeleton };
