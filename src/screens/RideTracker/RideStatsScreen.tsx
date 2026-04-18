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
import { LinearGradient } from 'expo-linear-gradient';
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
        <ActivityIndicator size="large" color="#0EA5E9" style={{ marginTop: 60 }} />
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
      <LinearGradient colors={['#38BDF8', '#0EA5E9', '#09268f']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.title}>RIDE STATS</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

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
            <Text style={styles.sectionTitle}>RIDES BY PARK</Text>
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
            <Text style={styles.sectionTitle}>TOP RATED RIDES</Text>
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
            <Text style={styles.sectionTitle}>MOST RIDDEN</Text>
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
            style={({ pressed }) => [styles.wrappedCTA, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.wrappedIcon}>🎁</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.wrappedTitle}>
                View Your Ride Wrapped
              </Text>
              <Text style={styles.wrappedSubtitle}>
                See your monthly ride summary
              </Text>
            </View>
            <Text style={styles.wrappedArrow}>→</Text>
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
  container: { flex: 1, backgroundColor: '#e8f4fd' },
  header: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingHorizontal: 16, 
    paddingVertical: 16,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backChevron: { 
    color: '#FFFFFF', 
    fontSize: 24, 
    fontWeight: '600',
    marginLeft: -2,
  },
  title: { 
    color: '#FFFFFF', 
    fontSize: 20, 
    fontWeight: '700', 
    fontFamily: 'Shark',
    letterSpacing: 2,
  },
  content: { padding: 16, paddingBottom: 60 },
  statGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, 
    backgroundColor: '#FFFFFF', 
    borderRadius: 20, 
    padding: 16, 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  statIcon: { fontSize: 28, marginBottom: 4 },
  statNumber: { 
    fontSize: 32, 
    fontWeight: '800', 
    color: '#09268f', 
    fontFamily: 'Shark' 
  },
  statLabel: { fontSize: 12, color: '#475569', marginTop: 4, textAlign: 'center' },
  sectionTitle: { 
    color: '#1a1a2e', 
    fontSize: 16, 
    fontWeight: '700', 
    marginBottom: 12, 
    marginTop: 20, 
    textTransform: 'uppercase', 
    letterSpacing: 2, 
    fontFamily: 'Knockout' 
  },
  parkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  parkName: { color: '#1a1a2e', fontSize: 13, width: 100, fontWeight: '600' },
  parkBar: { 
    flex: 1, 
    height: 8, 
    backgroundColor: 'rgba(255,255,255,0.6)', 
    borderRadius: 4, 
    overflow: 'hidden' 
  },
  parkBarFill: { 
    height: '100%', 
    backgroundColor: '#09268f', 
    borderRadius: 4 
  },
  parkCount: { color: '#475569', fontSize: 13, fontWeight: '700', width: 32, textAlign: 'right' },
  rankRow: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12, 
    backgroundColor: '#FFFFFF',
    borderRadius: 16, 
    padding: 12, 
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  rankNum: { color: '#fec90e', fontSize: 16, fontWeight: '800', width: 32 },
  rankName: { color: '#1a1a2e', fontSize: 14, fontWeight: '600' },
  rankScore: { color: '#09268f', fontSize: 16, fontWeight: '700' },
  wrappedCTA: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginTop: 20,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#fec90e',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#fec90e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  wrappedIcon: { fontSize: 28 },
  wrappedTitle: { 
    color: '#fec90e', 
    fontSize: 16, 
    fontWeight: '700', 
    fontFamily: 'Shark' 
  },
  wrappedSubtitle: { 
    color: '#475569', 
    fontSize: 13, 
    marginTop: 2 
  },
  wrappedArrow: { color: '#94a3b8', fontSize: 16 },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: '#475569', fontSize: 15, marginTop: 12 },
  errorText: { color: '#ef4444', textAlign: 'center', marginTop: 60, fontSize: 16 },
});