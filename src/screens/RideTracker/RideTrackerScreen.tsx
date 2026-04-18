import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Dimensions,
  RefreshControl, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { getPlayerRides, getRideStats, PlayerRideType, RideStatsType } from '../../api/endpoints/player-rides';
import { getRideProfileStats, RideProfileStats } from '../../api/endpoints/player-rides/profileStats';
import RideCard from '../../components/RideTracker/RideCard';
import SharkRating from '../../components/RideTracker/SharkRating';
import { colors } from '../../design-system';

const { width } = Dimensions.get('window');

// ─── Rider Levels (based on rides logged) ───
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
  for (const l of RIDER_LEVELS) { if (count >= l.min) level = l; }
  return level;
}
function getNextLevel(count: number) {
  for (const l of RIDER_LEVELS) { if (count < l.min) return l; }
  return null;
}
function getLevelProgress(count: number) {
  const cur = getRiderLevel(count);
  const nxt = getNextLevel(count);
  if (!nxt) return 1;
  return Math.min((count - cur.min) / (nxt.min - cur.min), 1);
}

// ─── Fade In ───
function FadeIn({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  const op = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 350, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={{ opacity: op, transform: [{ translateY: ty }] }}>{children}</Animated.View>;
}

// ─── Progress Bar ───
function ProgressBar({ progress, height = 10 }: { progress: number; height?: number }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: progress, duration: 800, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [progress]);
  return (
    <View style={{ height, backgroundColor: 'rgba(9,38,143,0.12)', borderRadius: height / 2, overflow: 'hidden' }}>
      <Animated.View style={{
        height, borderRadius: height / 2, backgroundColor: '#09268f',
        width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
      }} />
    </View>
  );
}

// ─── Animated Counter ───
function CountUp({ to, style, duration = 800 }: { to: number; style?: any; duration?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  const [v, setV] = useState(0);
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: to, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    const id = a.addListener(({ value }) => setV(Math.round(value)));
    return () => a.removeListener(id);
  }, [to]);
  return <Text style={style}>{v.toLocaleString()}</Text>;
}

// ─── Menu Row ───
function MenuRow({ icon, iconBg, title, sub, onPress, delay = 0, badge }: {
  icon: string; iconBg: [string, string]; title: string; sub: string; onPress: () => void; delay?: number; badge?: string;
}) {
  return (
    <FadeIn delay={delay}>
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
        style={({ pressed }) => [s.menuRow, pressed && { backgroundColor: '#f0f4f8', transform: [{ scale: 0.99 }] }]}
      >
        <LinearGradient colors={iconBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.menuRowIconWrap}>
          <Text style={s.menuRowIcon}>{icon}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={s.menuRowTitle}>{title}</Text>
          <Text style={s.menuRowSub}>{sub}</Text>
        </View>
        {badge && (
          <View style={[s.menuRowBadge, { backgroundColor: iconBg[0] }]}>
            <Text style={s.menuRowBadgeText}>{badge}</Text>
          </View>
        )}
        <Text style={s.menuRowChevron}>›</Text>
      </Pressable>
    </FadeIn>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

export default function RideTrackerScreen() {
  const nav = useNavigation<any>();
  const [stats, setStats] = useState<RideStatsType | null>(null);
  const [profile, setProfile] = useState<RideProfileStats | null>(null);
  const [recent, setRecent] = useState<PlayerRideType[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [st, ri, pr] = await Promise.all([
        getRideStats(), getPlayerRides({ per_page: 5 }), getRideProfileStats().catch(() => null),
      ]);
      setStats(st); setRecent(ri.data); if (pr) setProfile(pr);
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const has = stats && stats.total_rides > 0;
  const lvl = stats ? getRiderLevel(stats.total_rides) : RIDER_LEVELS[0];
  const next = stats ? getNextLevel(stats.total_rides) : RIDER_LEVELS[1];
  const prog = stats ? getLevelProgress(stats.total_rides) : 0;
  const toNext = next && stats ? next.min - stats.total_rides : 0;

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* ══ HEADER ══ */}
        <LinearGradient
          colors={['#7DD3FC', '#38BDF8', '#0EA5E9', '#0284C7']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={s.header}
        >
          <SafeAreaView edges={['top']}>
            <View style={s.nav}>
              <Pressable onPress={() => nav.goBack()} hitSlop={16} style={({ pressed }) => [s.navBtn, pressed && { opacity: 0.6 }]}>
                <Text style={s.navBtnText}>‹</Text>
              </Pressable>
              <Text style={s.navTitle}>RIDE TRACKER</Text>
              <View style={{ width: 40 }} />
            </View>

            {/* Big Ride Count + Rank */}
            {has ? (
              <FadeIn delay={100}>
                <View style={s.heroCenter}>
                  <Text style={s.heroEmoji}>{lvl.emoji}</Text>
                  <CountUp to={stats.total_rides} style={s.heroNum} />
                  <Text style={s.heroLabel}>RIDES LOGGED</Text>
                </View>
              </FadeIn>
            ) : (
              <View style={s.heroCenter}>
                <Text style={s.heroEmoji}>🎢</Text>
                <Text style={s.heroNum}>0</Text>
                <Text style={s.heroLabel}>RIDES LOGGED</Text>
              </View>
            )}
          </SafeAreaView>
        </LinearGradient>

        {/* ══ RANK CARD (overlaps header) ══ */}
        {has && (
          <View style={s.rankCardWrap}>
            <FadeIn delay={200}>
              <View style={s.rankCard}>
                <View style={s.rankRow}>
                  <View style={s.rankPill}>
                    <Text style={s.rankPillText}>{lvl.title.toUpperCase()}</Text>
                  </View>
                  {next && <Text style={s.rankNext}>{toNext} to {next.title} {next.emoji}</Text>}
                </View>
                <ProgressBar progress={prog} />
              </View>
            </FadeIn>
          </View>
        )}

        <View style={[s.content, !has && { paddingTop: 16 }]}>

          {/* ── Log a Ride ── */}
          <FadeIn delay={has ? 250 : 100}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); nav.navigate('RideLog'); }}
              style={({ pressed }) => [s.logBtn, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }]}
            >
              <LinearGradient
                colors={['#38BDF8', '#0EA5E9', '#0284C7']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.logBtnInner}
              >
                <Text style={s.logBtnEmoji}>🎢</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.logBtnTitle}>Log a Ride</Text>
                  <Text style={s.logBtnSub}>Track your theme park adventures</Text>
                </View>
                <Text style={s.logBtnArrow}>→</Text>
              </LinearGradient>
            </Pressable>
          </FadeIn>

          {/* ── Stats ── */}
          {has && (
            <FadeIn delay={300}>
              <View style={s.statsRow}>
                <View style={s.statPill}>
                  <Text style={s.statVal}>{stats.total_rides}</Text>
                  <Text style={s.statLabel}>Total</Text>
                </View>
                <View style={s.statPill}>
                  <Text style={s.statVal}>{stats.unique_rides}</Text>
                  <Text style={s.statLabel}>Unique</Text>
                </View>
                <View style={s.statPill}>
                  <Text style={s.statVal}>{stats.current_streak > 0 ? `${stats.current_streak}d` : '0'}</Text>
                  <Text style={s.statLabel}>Streak</Text>
                </View>
              </View>
            </FadeIn>
          )}

          {/* ── Navigation ── */}
          <FadeIn delay={400}><Text style={s.sectionTitle}>EXPLORE</Text></FadeIn>
          <View style={s.menuList}>
            <MenuRow
              icon="📜" iconBg={['#ef4444', '#dc2626']}
              title="Ride History" sub="Every ride you've logged"
              onPress={() => nav.navigate('RideHistory')} delay={420}
            />
            <MenuRow
              icon="📊" iconBg={['#3b82f6', '#1d4ed8']}
              title="Stats & Insights" sub="Patterns, favorites, milestones"
              onPress={() => nav.navigate('RideStats')} delay={450}
            />
            <MenuRow
              icon="📚" iconBg={['#8b5cf6', '#7c3aed']}
              title="Collections" sub="Ride every mountain, coaster, and more"
              onPress={() => nav.navigate('RideCollections')} delay={480}
            />
            <MenuRow
              icon="🏆" iconBg={['#f59e0b', '#d97706']}
              title="Achievements" sub="Badges you've unlocked"
              onPress={() => nav.navigate('RideAchievements')} delay={510}
              badge={profile?.achievement_count ? `${profile.achievement_count}` : undefined}
            />
            <MenuRow
              icon="🎁" iconBg={['#ec4899', '#db2777']}
              title="Wrapped" sub="Your personalized ride recap"
              onPress={() => nav.navigate('RideWrapped')} delay={540}
            />
          </View>

          {/* ── Most Ridden ── */}
          {stats?.most_ridden && stats.most_ridden.length > 0 && (
            <FadeIn delay={500}>
              <Text style={s.sectionTitle}>MOST RIDDEN</Text>
              <View style={s.card}>
                {stats.most_ridden.slice(0, 3).map((r, i) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  return (
                    <React.Fragment key={r.id}>
                      <View style={s.mostRow}>
                        <Text style={s.mostMedal}>{medals[i]}</Text>
                        <Text style={s.mostName} numberOfLines={1}>{r.name}</Text>
                        <View style={s.mostChip}>
                          <Text style={s.mostChipText}>{r.ride_count}×</Text>
                        </View>
                      </View>
                      {i < Math.min(stats.most_ridden.length, 3) - 1 && <View style={s.divider} />}
                    </React.Fragment>
                  );
                })}
              </View>
            </FadeIn>
          )}

          {/* ── Recent Rides ── */}
          {recent.length > 0 && (
            <FadeIn delay={540}>
              <View style={s.sectionRow}>
                <Text style={s.sectionTitle}>RECENT RIDES</Text>
                <Pressable onPress={() => nav.navigate('RideHistory')} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
                  <Text style={s.seeAll}>See All →</Text>
                </Pressable>
              </View>
              {recent.map(ride => (
                <RideCard key={ride.id} ride={ride} onPress={() => nav.navigate('RideDetail', { rideId: ride.ride_id, rideName: ride.ride_name })} />
              ))}
            </FadeIn>
          )}

          {/* ── Empty State ── */}
          {!has && (
            <FadeIn delay={200}>
              <View style={s.card}>
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Text style={{ fontSize: 56, marginBottom: 12 }}>🦈</Text>
                  <Text style={s.emptyTitle}>Start Your Ride Journal!</Text>
                  <Text style={s.emptySub}>
                    Track every ride, earn achievements, and level up your rider rank!
                  </Text>
                </View>
              </View>
            </FadeIn>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#dbeefe' },

  // Header
  header: { paddingBottom: 40 },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  navBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  navBtnText: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
  navTitle: {
    color: '#fff', fontSize: 18, fontWeight: '900', fontFamily: 'Shark', letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.15)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  // Hero
  heroCenter: { alignItems: 'center', paddingTop: 8, paddingBottom: 12 },
  heroEmoji: { fontSize: 48, marginBottom: 2 },
  heroNum: {
    color: '#fff', fontSize: 56, fontWeight: '900', fontFamily: 'Shark',
    textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '800',
    fontFamily: 'Knockout', letterSpacing: 3, marginTop: -2,
  },

  // Rank Card
  rankCardWrap: { marginTop: -24, paddingHorizontal: 20, marginBottom: 14, zIndex: 10 },
  rankCard: {
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rankPill: {
    backgroundColor: '#09268f', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3,
  },
  rankPillText: { color: '#fff', fontSize: 11, fontWeight: '900', fontFamily: 'Knockout', letterSpacing: 1 },
  rankNext: { fontSize: 12, color: '#64748b' },

  // Content
  content: { paddingHorizontal: 16 },

  // Log Button
  logBtn: {
    borderRadius: 18, overflow: 'hidden', marginBottom: 14,
    shadowColor: '#0284C7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  logBtnInner: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 18, gap: 14,
  },
  logBtnEmoji: { fontSize: 36 },
  logBtnTitle: { color: '#fff', fontSize: 20, fontWeight: '900', fontFamily: 'Shark' },
  logBtnSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 1 },
  logBtnArrow: { color: '#fff', fontSize: 24, fontWeight: '600' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statPill: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  statVal: { fontSize: 24, fontWeight: '900', fontFamily: 'Shark', color: '#1a1a2e' },
  statLabel: { fontSize: 12, fontWeight: '700', fontFamily: 'Knockout', color: '#64748b', marginTop: 2 },

  // Top Ride
  topRide: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 16, gap: 12, marginBottom: 20,
    shadowColor: '#c8961e', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  topRideStar: { fontSize: 32 },
  topRideLabel: { fontSize: 12, fontWeight: '800', fontFamily: 'Knockout', color: 'rgba(0,0,0,0.5)', letterSpacing: 0.5 },
  topRideName: { fontSize: 16, fontWeight: '800', color: '#1a1a2e', marginTop: 1 },
  topRideScoreBubble: {
    backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.08)',
  },
  topRideScore: { fontSize: 20, fontWeight: '900', fontFamily: 'Shark', color: '#1a1a2e' },

  // Sections
  sectionTitle: { fontSize: 14, fontWeight: '900', fontFamily: 'Knockout', color: '#1a1a2e', letterSpacing: 1.5, marginBottom: 12 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAll: { fontSize: 14, fontWeight: '700', color: '#0EA5E9' },

  // Menu
  menuList: { gap: 8, marginBottom: 20 },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  menuRowIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  menuRowIcon: { fontSize: 22 },
  menuRowTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a2e' },
  menuRowSub: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  menuRowChevron: { fontSize: 22, color: '#cbd5e1', fontWeight: '300' },
  menuRowBadge: { borderRadius: 10, minWidth: 22, height: 22, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  menuRowBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  mostRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  mostMedal: { fontSize: 24, width: 36, textAlign: 'center' },
  mostName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  mostChip: { backgroundColor: '#e8f4fd', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  mostChipText: { fontSize: 13, fontWeight: '700', color: '#09268f' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.04)' },

  // Empty
  emptyTitle: { fontSize: 22, fontWeight: '900', fontFamily: 'Shark', color: '#1a1a2e', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },
});
