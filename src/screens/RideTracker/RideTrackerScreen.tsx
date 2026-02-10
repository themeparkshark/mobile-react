import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Dimensions,
  RefreshControl, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { getPlayerRides, getRideStats, PlayerRideType, RideStatsType } from '../../api/endpoints/player-rides';
import { getRideProfileStats, RideProfileStats } from '../../api/endpoints/player-rides/profileStats';
import RideCard from '../../components/RideTracker/RideCard';
import { colors, shadows } from '../../design-system';

const { width } = Dimensions.get('window');

// ─── Rider Level Title ───
const RIDER_LEVELS = [
  { min: 0, title: 'Guppy', emoji: '🐟' },
  { min: 11, title: 'Reef Shark', emoji: '🦈' },
  { min: 51, title: 'Bull Shark', emoji: '🦈' },
  { min: 101, title: 'Tiger Shark', emoji: '🐅' },
  { min: 251, title: 'Great White', emoji: '🦈' },
  { min: 501, title: 'Megalodon', emoji: '🦷' },
];

function getRiderLevel(count: number) {
  let level = RIDER_LEVELS[0];
  for (const l of RIDER_LEVELS) {
    if (count >= l.min) level = l;
  }
  return level;
}

// ─── Menu Button ───
interface MenuBtnProps {
  icon: string;
  label: string;
  onPress: () => void;
  color?: string;
  badge?: string;
}
const MenuBtn: React.FC<MenuBtnProps> = React.memo(({ icon, label, onPress, color, badge }) => (
  <Pressable
    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
    style={({ pressed }) => [styles.menuBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
  >
    <Text style={styles.menuIcon}>{icon}</Text>
    <Text style={[styles.menuLabel, color ? { color } : null]}>{label}</Text>
    {badge && <View style={styles.menuBadge}><Text style={styles.menuBadgeText}>{badge}</Text></View>}
  </Pressable>
));
MenuBtn.displayName = 'MenuBtn';

// ─── Animated Stat ───
const AnimStat: React.FC<{ value: number; label: string; suffix?: string }> = React.memo(({ value, label, suffix = '' }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: value, duration: 800, useNativeDriver: false }).start();
    const id = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    return () => anim.removeListener(id);
  }, [value]);

  return (
    <View style={styles.quickStat}>
      <Text style={styles.quickStatVal}>{display}{suffix}</Text>
      <Text style={styles.quickStatLabel}>{label}</Text>
    </View>
  );
});
AnimStat.displayName = 'AnimStat';

export default function RideTrackerScreen() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<RideStatsType | null>(null);
  const [profileStats, setProfileStats] = useState<RideProfileStats | null>(null);
  const [recentRides, setRecentRides] = useState<PlayerRideType[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, ridesData, profileData] = await Promise.all([
        getRideStats(),
        getPlayerRides({ per_page: 5 }),
        getRideProfileStats().catch(() => null),
      ]);
      setStats(statsData);
      setRecentRides(ridesData.data);
      if (profileData) setProfileStats(profileData);
    } catch (e) {
      console.error('Failed to load ride tracker data:', e);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await fetchData(); setRefreshing(false);
  }, [fetchData]);

  const riderLevel = stats ? getRiderLevel(stats.total_rides) : RIDER_LEVELS[0];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backBtn}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>🦈 Ride Tracker</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
      >
        {/* Rider Level Card */}
        {stats && stats.total_rides > 0 && (
          <View style={styles.levelCard}>
            <Text style={styles.levelEmoji}>{riderLevel.emoji}</Text>
            <View>
              <Text style={styles.levelTitle}>{riderLevel.title}</Text>
              <Text style={styles.levelSubtitle}>{stats.total_rides} rides logged</Text>
            </View>
          </View>
        )}

        {/* Big Log Button */}
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); navigation.navigate('RideLog'); }}
          style={({ pressed }) => [styles.logButton, pressed && { transform: [{ scale: 0.97 }] }]}
        >
          <Text style={styles.logButtonEmoji}>🎢</Text>
          <View>
            <Text style={styles.logButtonTitle}>Log a Ride</Text>
            <Text style={styles.logButtonSub}>Track every ride you go on</Text>
          </View>
        </Pressable>

        {/* Quick Stats */}
        {stats && stats.total_rides > 0 && (
          <View style={styles.quickStats}>
            <AnimStat value={stats.total_rides} label="Rides" />
            <View style={styles.quickStatDivider} />
            <AnimStat value={stats.unique_rides} label="Unique" />
            <View style={styles.quickStatDivider} />
            <AnimStat value={stats.current_streak} label="Streak" suffix="🔥" />
          </View>
        )}

        {/* Primary Menu */}
        <View style={styles.menuGrid}>
          <MenuBtn icon="📜" label="History" onPress={() => navigation.navigate('RideHistory')} />
          <MenuBtn icon="📊" label="Stats" onPress={() => navigation.navigate('RideStats')} />
          <MenuBtn icon="🏆" label="Achievements" onPress={() => navigation.navigate('RideAchievements')} />
        </View>

        {/* Secondary Menu - New Features */}
        <View style={styles.menuGrid}>
          <MenuBtn icon="🎁" label="Wrapped" onPress={() => navigation.navigate('RideWrapped')} color={colors.tertiary} />
          <MenuBtn icon="📚" label="Collections" onPress={() => navigation.navigate('RideCollections')} />
          <MenuBtn icon="⭐" label="Wishlist" onPress={() => navigation.navigate('RideWishlist')} />
        </View>

        {/* Recent Rides */}
        {recentRides.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Rides</Text>
              <Pressable onPress={() => navigation.navigate('RideHistory')}>
                <Text style={styles.seeAll}>See All →</Text>
              </Pressable>
            </View>
            {recentRides.map(ride => (
              <RideCard
                key={ride.id}
                ride={ride}
                onPress={() => navigation.navigate('RideDetail', { rideId: ride.ride_id, rideName: ride.ride_name })}
              />
            ))}
          </>
        )}

        {/* Empty State */}
        {(!stats || stats.total_rides === 0) && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🦈</Text>
            <Text style={styles.emptyTitle}>Your Ride Journal</Text>
            <Text style={styles.emptySubtitle}>
              Theme Park Shark remembers every ride you've ever been on.{'\n\n'}
              Tap "Log a Ride" above to start building your ride history!
            </Text>
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
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', fontFamily: 'Shark' },
  content: { padding: 16, paddingBottom: 60 },
  // Level Card
  levelCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.bgMedium, borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)',
    ...shadows.glow(colors.tertiary, 0.15),
  },
  levelEmoji: { fontSize: 40 },
  levelTitle: { color: colors.tertiary, fontSize: 20, fontWeight: '800', fontFamily: 'Knockout' },
  levelSubtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  // Log Button
  logButton: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.secondary, borderRadius: 16, padding: 18,
    marginBottom: 16, ...shadows.md,
  },
  logButtonEmoji: { fontSize: 36 },
  logButtonTitle: { color: '#fff', fontSize: 20, fontWeight: '800', fontFamily: 'Shark' },
  logButtonSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  // Quick Stats
  quickStats: {
    flexDirection: 'row', backgroundColor: colors.bgMedium, borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'space-around', alignItems: 'center',
  },
  quickStat: { alignItems: 'center' },
  quickStatVal: { color: colors.textPrimary, fontSize: 24, fontWeight: '800', fontFamily: 'Shark' },
  quickStatLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  quickStatDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.1)' },
  // Menu
  menuGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  menuBtn: {
    flex: 1, backgroundColor: colors.bgMedium, borderRadius: 14, padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', position: 'relative',
  },
  menuIcon: { fontSize: 26, marginBottom: 4 },
  menuLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  menuBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: colors.error, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1,
  },
  menuBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  // Section
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 8 },
  sectionTitle: { color: colors.tertiary, fontSize: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Shark' },
  seeAll: { color: colors.secondary, fontSize: 14, fontWeight: '600' },
  // Empty
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 60 },
  emptyTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginTop: 16, fontFamily: 'Shark' },
  emptySubtitle: { color: colors.textSecondary, fontSize: 15, marginTop: 10, textAlign: 'center', lineHeight: 22 },
});
