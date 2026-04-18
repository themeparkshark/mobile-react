import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { getWrapped, WrappedData } from '../../api/endpoints/player-rides/wrapped';
import { colors } from '../../design-system';

const { width, height } = Dimensions.get('window');
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ─── Brand Colors ───
const BRAND = {
  pageBg: '#e8f4fd',
  cardWhite: '#FFFFFF',
  navy: '#09268f',
  skyMid: '#38BDF8',
  skyDark: '#0EA5E9',
  gold: '#fec90e',
  textDark: '#1a1a2e',
  textMid: '#475569',
  textLight: '#94a3b8',
};

// ─── Wrapped card gradient palettes (bright/playful) ───
const CARD_GRADIENTS: [string, string, string][] = [
  ['#38BDF8', '#0EA5E9', '#09268f'],   // Blue (total rides)
  ['#fec90e', '#f59e0b', '#d97706'],   // Gold (most ridden)
  ['#34d399', '#10b981', '#047857'],   // Green (home park)
  ['#a78bfa', '#8b5cf6', '#6d28d9'],   // Purple (top rated)
  ['#fb923c', '#f97316', '#ea580c'],   // Orange (streaks)
  ['#38BDF8', '#0EA5E9', '#09268f'],   // Blue (reactions)
];

// ─── Animated Number ───
const AnimNum: React.FC<{ value: number; style?: any; suffix?: string }> = React.memo(({ value, style, suffix = '' }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: value, duration: 1500, useNativeDriver: false }).start();
    const listener = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    return () => anim.removeListener(listener);
  }, [value]);

  return <Text style={style}>{display}{suffix}</Text>;
});
AnimNum.displayName = 'AnimNum';

// ─── Wrapped Card ───
interface CardProps {
  gradient: [string, string, string];
  children: React.ReactNode;
}
const WrappedCard: React.FC<CardProps> = React.memo(({ gradient, children }) => (
  <View style={cardStyles.cardShadow}>
    <LinearGradient colors={gradient} style={cardStyles.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <View style={cardStyles.brand}>
        <Text style={cardStyles.brandText}>THEME PARK SHARK</Text>
      </View>
      {children}
    </LinearGradient>
  </View>
));
WrappedCard.displayName = 'WrappedCard';

const cardStyles = StyleSheet.create({
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  card: {
    width: width - 48,
    minHeight: height * 0.5,
    borderRadius: 24,
    padding: 28,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  brand: { position: 'absolute', top: 20, left: 20 },
  brandText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
});

export default function RideWrappedScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentCard, setCurrentCard] = useState(0);
  const viewShotRef = useRef<ViewShot>(null);

  const period = route.params?.period || 'monthly';
  const year = route.params?.year || new Date().getFullYear();
  const month = route.params?.month || new Date().getMonth() + 1;

  useEffect(() => {
    getWrapped({ period, year, month })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period, year, month]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentCard(c => Math.min(c + 1, 5));
  }, []);

  const handlePrev = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentCard(c => Math.max(c - 1, 0));
  }, []);

  const handleShare = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const uri = await viewShotRef.current?.capture?.();
      if (uri && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png' });
      }
    } catch (e) {
      console.error('Share error:', e);
    }
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#38BDF8', '#0EA5E9', '#09268f']} style={styles.heroGradient}>
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <Text style={styles.backBtn}>{'<'}</Text>
            </Pressable>
            <Text style={styles.title}>Ride Wrapped</Text>
            <View style={{ width: 32 }} />
          </View>
        </LinearGradient>
        <ActivityIndicator size="large" color={BRAND.skyDark} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!data || data.total_rides === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#38BDF8', '#0EA5E9', '#09268f']} style={styles.heroGradient}>
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <Text style={styles.backBtn}>{'<'}</Text>
            </Pressable>
            <Text style={styles.title}>Ride Wrapped</Text>
            <View style={{ width: 32 }} />
          </View>
        </LinearGradient>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No rides this period!</Text>
          <Text style={styles.emptySubtitle}>Log some rides to see your Wrapped</Text>
          <Pressable onPress={() => navigation.goBack()} style={styles.goldBtn}>
            <Text style={styles.goldBtnText}>Go Log Rides</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const periodLabel = period === 'monthly' ? `${MONTHS[month]} ${year}` : `${year}`;

  const cards = [
    // Card 0: Total rides
    <WrappedCard key="total" gradient={CARD_GRADIENTS[0]}>
      <Text style={styles.cardLabel}>YOUR {period === 'monthly' ? 'MONTH' : 'YEAR'} IN RIDES</Text>
      <Text style={styles.cardPeriod}>{periodLabel}</Text>
      <AnimNum value={data.total_rides} style={styles.bigNumber} />
      <Text style={styles.cardSubLabel}>total rides logged</Text>
      <View style={styles.miniStats}>
        <View style={styles.miniStat}>
          <Text style={styles.miniStatNum}>{data.unique_rides}</Text>
          <Text style={styles.miniStatLabel}>unique</Text>
        </View>
        <View style={styles.miniStat}>
          <Text style={styles.miniStatNum}>{data.ride_days}</Text>
          <Text style={styles.miniStatLabel}>park days</Text>
        </View>
      </View>
    </WrappedCard>,

    // Card 1: Most ridden
    <WrappedCard key="most" gradient={CARD_GRADIENTS[1]}>
      <Text style={styles.cardLabel}>YOUR #1 RIDE</Text>
      <Text style={styles.cardBig}>{data.most_ridden?.name || '-'}</Text>
      {data.most_ridden && (
        <>
          <AnimNum value={data.most_ridden.count} style={styles.bigNumber} suffix="x" />
          <Text style={styles.cardSubLabel}>times you rode it</Text>
        </>
      )}
    </WrappedCard>,

    // Card 2: Favorite park
    <WrappedCard key="park" gradient={CARD_GRADIENTS[2]}>
      <Text style={styles.cardLabel}>YOUR HOME PARK</Text>
      <Text style={styles.cardBig}>{data.favorite_park?.name || '-'}</Text>
      {data.favorite_park && (
        <>
          <AnimNum value={data.favorite_park.count} style={styles.bigNumber} />
          <Text style={styles.cardSubLabel}>rides at this park</Text>
        </>
      )}
    </WrappedCard>,

    // Card 3: Top rated
    <WrappedCard key="rated" gradient={CARD_GRADIENTS[3]}>
      <Text style={styles.cardLabel}>YOUR TOP RATED</Text>
      <Text style={styles.cardBig}>{data.top_rated?.name || '-'}</Text>
      {data.top_rated && (
        <View style={styles.ratingRow}>
          {Array.from({ length: Math.round(data.top_rated.avg_rating) }).map((_, i) => (
            <Text key={i} style={styles.ratingShark}>*</Text>
          ))}
        </View>
      )}
    </WrappedCard>,

    // Card 4: Streak & Achievements
    <WrappedCard key="streak" gradient={CARD_GRADIENTS[4]}>
      <Text style={styles.cardLabel}>STREAKS & ACHIEVEMENTS</Text>
      <AnimNum value={data.longest_streak} style={styles.bigNumber} />
      <Text style={styles.cardSubLabel}>longest day streak</Text>
      {data.achievements_earned > 0 && (
        <View style={styles.achievRow}>
          <Text style={styles.achievNum}>{data.achievements_earned}</Text>
          <Text style={styles.achievLabel}>achievements earned</Text>
        </View>
      )}
    </WrappedCard>,

    // Card 5: Reactions summary
    <WrappedCard key="reactions" gradient={CARD_GRADIENTS[5]}>
      <Text style={styles.cardLabel}>YOUR REACTIONS</Text>
      {data.reactions.length > 0 ? (
        <View style={styles.reactionsGrid}>
          {data.reactions.slice(0, 5).map(r => (
            <View key={r.reaction} style={styles.reactionItem}>
              <Text style={styles.reactionEmoji}>{r.reaction}</Text>
              <Text style={styles.reactionCount}>{r.count}x</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.cardSubLabel}>Add reactions when you log rides!</Text>
      )}
      <View style={styles.wrappedFooter}>
        <Text style={styles.wrappedFooterText}>That's a wrap!</Text>
        <Text style={styles.wrappedFooterSub}>{periodLabel}</Text>
      </View>
    </WrappedCard>,
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Hero header */}
      <LinearGradient colors={['#38BDF8', '#0EA5E9', '#09268f']} style={styles.heroGradient}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.backBtn}>{'<'}</Text>
          </Pressable>
          <Text style={styles.title}>Ride Wrapped</Text>
          <Pressable onPress={handleShare} hitSlop={12}>
            <Text style={styles.shareBtn}>Share</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {/* Progress dots */}
      <View style={styles.dots}>
        {cards.map((_, i) => (
          <View key={i} style={[styles.dot, i === currentCard && styles.dotActive]} />
        ))}
      </View>

      {/* Card */}
      <Pressable onPress={handleNext} style={styles.cardArea}>
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
          {cards[currentCard]}
        </ViewShot>
      </Pressable>

      {/* Navigation */}
      <View style={styles.navRow}>
        <Pressable
          onPress={handlePrev}
          disabled={currentCard === 0}
          style={[styles.navBtn, currentCard === 0 && { opacity: 0.3 }]}
        >
          <Text style={styles.navBtnText}>Prev</Text>
        </Pressable>
        <Text style={styles.cardCounter}>{currentCard + 1}/{cards.length}</Text>
        {currentCard < cards.length - 1 ? (
          <Pressable onPress={handleNext} style={styles.navBtn}>
            <Text style={styles.navBtnText}>Next</Text>
          </Pressable>
        ) : (
          <Pressable onPress={handleShare} style={[styles.navBtn, styles.goldBtn]}>
            <Text style={styles.goldBtnText}>Share</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.pageBg },
  heroGradient: { paddingBottom: 16, paddingTop: 4 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { color: '#FFFFFF', fontSize: 22, fontWeight: '600' },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', fontFamily: 'Shark' },
  shareBtn: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 16, marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#cbd5e1' },
  dotActive: { backgroundColor: BRAND.gold, width: 24 },
  cardArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  navBtn: {
    backgroundColor: BRAND.cardWhite, 
    borderRadius: 16, 
    paddingVertical: 12, 
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  navBtnText: { color: BRAND.textDark, fontSize: 14, fontWeight: '700' },
  goldBtn: {
    backgroundColor: BRAND.gold,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    shadowColor: BRAND.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  goldBtnText: { color: BRAND.textDark, fontSize: 15, fontWeight: '700' },
  cardCounter: { color: BRAND.textMid, fontSize: 13, fontWeight: '600' },
  // Card content styles
  cardLabel: {
    color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '800',
    letterSpacing: 2, marginBottom: 8,
  },
  cardPeriod: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '600', marginBottom: 20 },
  bigNumber: { color: '#fff', fontSize: 72, fontWeight: '900', fontFamily: 'Knockout' },
  cardBig: { color: '#fff', fontSize: 28, fontWeight: '900', fontFamily: 'Knockout', marginBottom: 16 },
  cardSubLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 16, marginTop: 4 },
  ratingRow: { flexDirection: 'row', gap: 4, marginTop: 12 },
  ratingShark: { color: BRAND.gold, fontSize: 32, fontWeight: '900' },
  miniStats: { flexDirection: 'row', gap: 30, marginTop: 20 },
  miniStat: { alignItems: 'center' },
  miniStatNum: { color: '#fff', fontSize: 28, fontWeight: '800', fontFamily: 'Knockout' },
  miniStatLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  achievRow: { marginTop: 24 },
  achievNum: { color: '#fff', fontSize: 36, fontWeight: '800', fontFamily: 'Knockout' },
  achievLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  reactionsGrid: { flexDirection: 'row', gap: 16, marginTop: 16, flexWrap: 'wrap' },
  reactionItem: { alignItems: 'center' },
  reactionEmoji: { fontSize: 40 },
  reactionCount: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 },
  wrappedFooter: { marginTop: 30, alignItems: 'center' },
  wrappedFooterText: { color: '#fff', fontSize: 22, fontWeight: '800', fontFamily: 'Knockout' },
  wrappedFooterSub: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { 
    color: BRAND.textDark, fontSize: 22, fontWeight: '700', 
    marginTop: 16, fontFamily: 'Shark' 
  },
  emptySubtitle: { color: BRAND.textMid, fontSize: 15, marginTop: 8, textAlign: 'center' },
});
