import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getRideStats, RideStatsType } from '../../api/endpoints/player-rides';
import SharkRating from '../../components/RideTracker/SharkRating';
import { colors } from '../../design-system';

// ─── Animated Counter ───
interface AnimatedCounterProps {
  value: number;
  duration?: number;
}
const AnimatedCounter: React.FC<AnimatedCounterProps> = React.memo(({ value, duration = 1000 }) => {
  const animVal = useRef(new Animated.Value(0)).current;
  const [displayVal, setDisplayVal] = useState(0);

  useEffect(() => {
    animVal.setValue(0);
    Animated.timing(animVal, { toValue: value, duration, useNativeDriver: false }).start();
    const listener = animVal.addListener(({ value: v }) => setDisplayVal(Math.round(v)));
    return () => animVal.removeListener(listener);
  }, [value, duration, animVal]);

  return <Text style={styles.statNumber}>{displayVal}</Text>;
});
AnimatedCounter.displayName = 'AnimatedCounter';

// ─── Stat Card ───
interface StatCardProps {
  label: string;
  value: number;
  icon: string;
}
const StatCard: React.FC<StatCardProps> = React.memo(({ label, value, icon }) => (
  <View style={styles.statCard}>
    <Text style={styles.statIcon}>{icon}</Text>
    <AnimatedCounter value={value} />
    <Text style={styles.statLabel}>{label}</Text>
  </View>
));
StatCard.displayName = 'StatCard';

export default function RideStatsScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<RideStatsType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRideStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!stats) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Failed to load stats</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backBtn}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Ride Stats</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Big Stats */}
        <View style={styles.statGrid}>
          <StatCard label="Total Rides" value={stats.total_rides} icon="🦈" />
          <StatCard label="Unique Rides" value={stats.unique_rides} icon="⭐" />
          <StatCard label="Day Streak" value={stats.current_streak} icon="🔥" />
        </View>

        {/* Per Park */}
        {stats.per_park.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Rides by Park</Text>
            {stats.per_park.map(p => (
              <View key={p.park_id} style={styles.parkRow}>
                <Text style={styles.parkName}>{p.park_name}</Text>
                <View style={styles.parkBar}>
                  <View style={[styles.parkBarFill, { width: `${Math.min(100, (p.count / (stats.per_park[0]?.count || 1)) * 100)}%` }]} />
                </View>
                <Text style={styles.parkCount}>{p.count}</Text>
              </View>
            ))}
          </>
        )}

        {/* Top Rated */}
        {stats.top_rated.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Top Rated Rides</Text>
            {stats.top_rated.slice(0, 5).map((r, i) => (
              <View key={r.id} style={styles.rankRow}>
                <Text style={styles.rankNum}>#{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rankName}>{r.name}</Text>
                  <SharkRating rating={Math.round(r.avg_rating)} size={14} readonly />
                </View>
                <Text style={styles.rankScore}>{r.avg_rating}</Text>
              </View>
            ))}
          </>
        )}

        {/* Most Ridden */}
        {stats.most_ridden.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Most Ridden</Text>
            {stats.most_ridden.slice(0, 5).map((r, i) => (
              <View key={r.id} style={styles.rankRow}>
                <Text style={styles.rankNum}>#{i + 1}</Text>
                <Text style={[styles.rankName, { flex: 1 }]}>{r.name}</Text>
                <Text style={styles.rankScore}>{r.ride_count}x</Text>
              </View>
            ))}
          </>
        )}

        {/* Wrapped CTA */}
        {stats.total_rides > 0 && (
          <Pressable
            onPress={() => navigation.navigate('RideWrapped')}
            style={({ pressed }) => [{
              backgroundColor: 'rgba(254,201,14,0.15)',
              borderRadius: 14,
              padding: 16,
              marginTop: 20,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: 'rgba(254,201,14,0.3)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }, pressed && { opacity: 0.85 }]}
          >
            <Text style={{ fontSize: 28 }}>🎁</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.tertiary, fontSize: 16, fontWeight: '700', fontFamily: 'Shark' }}>
                View Your Ride Wrapped
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                See your monthly ride summary
              </Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>→</Text>
          </Pressable>
        )}

        {stats.total_rides === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📊</Text>
            <Text style={styles.emptyText}>Start logging rides to see your stats!</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { color: colors.secondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', fontFamily: 'Shark' },
  content: { padding: 16, paddingBottom: 60 },
  statGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: colors.bgMedium, borderRadius: 14, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  statIcon: { fontSize: 28, marginBottom: 4 },
  statNumber: { fontSize: 32, fontWeight: '800', color: colors.textPrimary, fontFamily: 'Shark' },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  sectionTitle: { color: colors.tertiary, fontSize: 16, fontWeight: '700', marginBottom: 12, marginTop: 20, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Shark' },
  parkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  parkName: { color: colors.textPrimary, fontSize: 13, width: 100, fontWeight: '600' },
  parkBar: { flex: 1, height: 8, backgroundColor: colors.bgLight, borderRadius: 4, overflow: 'hidden' },
  parkBarFill: { height: '100%', backgroundColor: colors.secondary, borderRadius: 4 },
  parkCount: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', width: 32, textAlign: 'right' },
  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgMedium,
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  rankNum: { color: colors.tertiary, fontSize: 16, fontWeight: '800', width: 32 },
  rankName: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  rankScore: { color: colors.secondary, fontSize: 16, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: colors.textSecondary, fontSize: 15, marginTop: 12 },
  errorText: { color: colors.error, textAlign: 'center', marginTop: 60, fontSize: 16 },
});
