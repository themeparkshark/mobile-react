import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  RefreshControl, Animated, Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { getPlayerRides, getRideStats, PlayerRideType, RideStatsType } from '../../api/endpoints/player-rides';
import { getRideProfileStats, RideProfileStats } from '../../api/endpoints/player-rides/profileStats';
import RideCard from '../../components/RideTracker/RideCard';
import Wrapper from '../../components/Wrapper';
import Topbar, { BackButton } from '../../components/Topbar';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import TopbarText from '../../components/Topbar/TopbarText';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

// ─── Rider Levels (based on rides logged) ───
const RIDER_LEVELS = [
  { min: 0, title: 'Guppy' },
  { min: 11, title: 'Reef Shark' },
  { min: 51, title: 'Bull Shark' },
  { min: 101, title: 'Tiger Shark' },
  { min: 251, title: 'Great White' },
  { min: 501, title: 'Megalodon' },
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
  const reducedMotion = useReducedGameMotion();
  useEffect(() => {
    if (reducedMotion) { op.setValue(1); ty.setValue(0); return; }
    const animation = Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 350, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [op, ty, delay, reducedMotion]);
  return <Animated.View style={{ opacity: op, transform: [{ translateY: ty }] }}>{children}</Animated.View>;
}

// ─── Progress Bar ───
function ProgressBar({ progress, height = 10 }: { progress: number; height?: number }) {
  const w = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedGameMotion();
  useEffect(() => {
    if (reducedMotion) { w.setValue(progress); return; }
    const animation = Animated.timing(w, { toValue: progress, duration: 800, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion, w]);
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
  const [v, setV] = useState(to);
  const reducedMotion = useReducedGameMotion();
  useEffect(() => {
    if (reducedMotion) { a.setValue(to); setV(to); return; }
    a.setValue(0);
    const id = a.addListener(({ value }) => setV(Math.round(value)));
    const animation = Animated.timing(a, { toValue: to, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start();
    return () => { animation.stop(); a.removeListener(id); };
  }, [to, duration, reducedMotion, a]);
  return <Text style={style}>{v.toLocaleString()}</Text>;
}

// ─── Menu Row ───
function MenuRow({ icon, title, sub, onPress, delay = 0, badge }: {
  icon: number; title: string; sub: string; onPress: () => void; delay?: number; badge?: string;
}) {
  const reducedMotion = useReducedGameMotion();
  return (
    <FadeIn delay={delay}>
      <Pressable
        accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
        style={({ pressed }) => [s.menuRow, pressed && { backgroundColor: '#f0f4f8', transform: [{ scale: reducedMotion ? 1 : 0.99 }] }]}
      >
        <Image source={icon} style={s.menuRowIcon} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={s.menuRowTitle}>{title}</Text>
          <Text style={s.menuRowSub}>{sub}</Text>
        </View>
        {badge && (
          <View style={s.menuRowBadge}>
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
  const reducedMotion = useReducedGameMotion();
  const preview = __DEV__ && process.env.EXPO_PUBLIC_RIDE_TRACKER_PREVIEW === '1';
  const [stats, setStats] = useState<RideStatsType | null>(null);
  const [profile, setProfile] = useState<RideProfileStats | null>(null);
  const [recent, setRecent] = useState<PlayerRideType[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadUnavailable, setLoadUnavailable] = useState(false);

  const load = useCallback(async () => {
    if (preview) {
      setStats({ total_rides: 24, unique_rides: 14, per_park: [], top_rated: [],
        most_ridden: [{ id: 1, name: 'Space Mountain', type: 'coaster', park_id: 2, ride_count: 4 }],
        current_streak: 2 });
      setProfile(null);
      setRecent([]);
      setLoadUnavailable(false);
      return;
    }
    try {
      const [st, ri, pr] = await Promise.all([
        getRideStats(), getPlayerRides({ per_page: 5 }), getRideProfileStats().catch(() => null),
      ]);
      setStats(st); setRecent(ri.data); if (pr) setProfile(pr);
      setLoadUnavailable(false);
    } catch {
      // Keep previously loaded journal data and avoid logging an Axios object
      // into React Native LogBox while the ride service is unavailable.
      setLoadUnavailable(true);
    }
  }, [preview]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const has = stats && stats.total_rides > 0;
  const lvl = stats ? getRiderLevel(stats.total_rides) : RIDER_LEVELS[0];
  const next = stats ? getNextLevel(stats.total_rides) : RIDER_LEVELS[1];
  const prog = stats ? getLevelProgress(stats.total_rides) : 0;
  const toNext = next && stats ? next.min - stats.total_rides : 0;

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>Ride Tracker</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <ScrollView
        style={s.root}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* Ride journal hero below the app's original curved header. */}
        <LinearGradient
          colors={['#2BA9E9', '#1179CB', '#0757A3']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={s.header}
        >
          <View style={s.heroCenter}>
            <View style={s.heroCopy}>
              <Text style={s.heroEyebrow}>YOUR RIDE JOURNAL</Text>
              {has ? <CountUp to={stats.total_rides} style={s.heroNum} />
                : <Text style={s.heroNum}>{loadUnavailable ? '—' : '0'}</Text>}
              <Text style={s.heroLabel}>{loadUnavailable && !stats ? 'JOURNAL OFFLINE' : 'RIDES LOGGED'}</Text>
            </View>
            <Image source={require('../../../assets/images/screens/lineplay/queue-recap-shark.png')}
              style={s.heroShark} contentFit="contain" accessibilityLabel="Theme Park Shark with a park ticket and coin" />
          </View>
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
                  {next && <Text style={s.rankNext}>{toNext} to {next.title}</Text>}
                </View>
                <ProgressBar progress={prog} />
              </View>
            </FadeIn>
          </View>
        )}

        <View style={[s.content, !has && { paddingTop: 16 }]}>

          {loadUnavailable && (
            <Text style={{ color: '#315C7C', fontFamily: 'Knockout', fontSize: 15,
              textAlign: 'center', marginBottom: 14 }}>
              Ride details are unavailable. Pull down to retry.
            </Text>
          )}

          {/* ── Log a Ride ── */}
          <FadeIn delay={has ? 250 : 100}>
            <Pressable
              accessibilityRole="button" accessibilityLabel="Log a ride in your journal"
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); nav.navigate('RideLog'); }}
              style={({ pressed }) => [s.logBtn, pressed && { transform: [{ scale: reducedMotion ? 1 : 0.98 }], opacity: 0.9 }]}
            >
              <LinearGradient
                colors={['#38BDF8', '#0EA5E9', '#0284C7']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.logBtnInner}
              >
                <Image source={require('../../../assets/images/screens/explore/list.png')}
                  style={s.logBtnIcon} contentFit="contain" />
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
              icon={require('../../../assets/images/screens/explore/list.png')}
              title="Ride History" sub="Every ride you've logged"
              onPress={() => nav.navigate('RideHistory')} delay={420}
            />
            <MenuRow
              icon={require('../../../assets/images/toolbar/leaderboard.png')}
              title="Stats & Insights" sub="Patterns, favorites, milestones"
              onPress={() => nav.navigate('RideStats')} delay={450}
            />
            <MenuRow
              icon={require('../../../assets/images/screens/profile/pin_collections.png')}
              title="Collections" sub="Ride every mountain, coaster, and more"
              onPress={() => nav.navigate('RideCollections')} delay={480}
            />
            <MenuRow
              icon={require('../../../assets/images/screens/explore/stampbook.png')}
              title="Achievements" sub="Badges you've unlocked"
              onPress={() => nav.navigate('RideAchievements')} delay={510}
              badge={profile?.achievement_count ? `${profile.achievement_count}` : undefined}
            />
            <MenuRow
              icon={require('../../../assets/images/screens/explore/tasklist.png')}
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
                  return (
                    <React.Fragment key={r.id}>
                      <View style={s.mostRow}>
                        <Text style={s.mostMedal}>{i + 1}</Text>
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
          {!has && !loadUnavailable && (
            <FadeIn delay={200}>
              <View style={s.card}>
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Image source={require('../../../assets/images/screens/pin-collections/shark.png')}
                    style={s.emptyShark} contentFit="contain" />
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
    </Wrapper>
  );
}

// ═══════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#dbeefe' },

  // Header
  header: { paddingBottom: 23 },

  // Hero
  heroCenter: { minHeight: 142, flexDirection: 'row', alignItems: 'center',
    paddingLeft: 25, paddingRight: 8, paddingTop: 2 },
  heroCopy: { flex: 1, zIndex: 1 },
  heroEyebrow: { color: '#C7EFFF', fontSize: 13, fontFamily: 'Knockout', letterSpacing: 1.4 },
  heroShark: { width: 150, height: 134, marginRight: -9, alignSelf: 'flex-end' },
  heroNum: {
    color: '#fff', fontSize: 53, fontWeight: '900', fontFamily: 'Shark',
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
  logBtnIcon: { width: 45, height: 45 },
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
  menuRowIcon: { width: 48, height: 48 },
  menuRowTitle: { fontSize: 17, fontFamily: 'Knockout', color: '#103F75' },
  menuRowSub: { fontSize: 13, color: '#51718D', marginTop: 1 },
  menuRowChevron: { fontSize: 22, color: '#cbd5e1', fontWeight: '300' },
  menuRowBadge: { borderRadius: 10, minWidth: 22, height: 22, paddingHorizontal: 7,
    backgroundColor: '#0877CA', alignItems: 'center', justifyContent: 'center' },
  menuRowBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  mostRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  mostMedal: { fontSize: 16, fontFamily: 'Shark', color: '#8A5B08', width: 30, textAlign: 'center' },
  mostName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  mostChip: { backgroundColor: '#e8f4fd', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  mostChipText: { fontSize: 13, fontWeight: '700', color: '#09268f' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.04)' },

  // Empty
  emptyTitle: { fontSize: 22, fontWeight: '900', fontFamily: 'Shark', color: '#1a1a2e', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },
  emptyShark: { width: 100, height: 88, marginBottom: 8 },
});
