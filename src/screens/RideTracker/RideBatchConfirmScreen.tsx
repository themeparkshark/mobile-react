import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Animated, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { logRide, LogRidePayload } from '../../api/endpoints/player-rides';
import SharkRating from '../../components/RideTracker/SharkRating';
import ReactionPicker from '../../components/RideTracker/ReactionPicker';
import ConfettiBurst from '../../components/RideTracker/ConfettiBurst';
import { DetectedRide } from '../../services/RideDetectionService';
import { colors, shadows } from '../../design-system';

// ─── Types ───
interface ConfirmedRide extends DetectedRide {
  selected: boolean;
}

interface RatingState {
  rating: number;
  reaction: string | null;
}

// ─── Confidence Badge ───
const ConfidenceBadge: React.FC<{ level: 'high' | 'medium' | 'low' }> = React.memo(({ level }) => {
  const config = {
    high: { label: 'High', color: colors.success, bg: 'rgba(76,175,80,0.15)' },
    medium: { label: 'Med', color: colors.warning, bg: 'rgba(255,193,7,0.15)' },
    low: { label: 'Low', color: colors.error, bg: 'rgba(244,67,54,0.15)' },
  }[level];

  return (
    <View style={[batchStyles.badge, { backgroundColor: config.bg }]}>
      <Text style={[batchStyles.badgeText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
});
ConfidenceBadge.displayName = 'ConfidenceBadge';

// ─── Detection Row ───
interface DetectionRowProps {
  ride: ConfirmedRide;
  onToggle: () => void;
}
const DetectionRow: React.FC<DetectionRowProps> = React.memo(({ ride, onToggle }) => {
  const dwellMin = Math.round(ride.dwellTimeMs / 60_000);
  const time = new Date(ride.enteredAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggle(); }}
      style={[batchStyles.row, !ride.selected && batchStyles.rowDeselected]}
    >
      <View style={batchStyles.checkbox}>
        <Text style={{ fontSize: 18 }}>{ride.selected ? '✅' : '⬜'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={batchStyles.rideName}>{ride.rideName}</Text>
        <Text style={batchStyles.rideDetail}>
          {time} • ~{dwellMin} min{ride.isReRide ? ' • Re-ride' : ''}
        </Text>
      </View>
      <ConfidenceBadge level={ride.confidence} />
    </Pressable>
  );
});
DetectionRow.displayName = 'DetectionRow';

// ─── Quick Rating Card ───
interface QuickRateProps {
  rideName: string;
  currentIndex: number;
  total: number;
  onRate: (rating: number, reaction: string | null) => void;
  onSkip: () => void;
}
const QuickRateCard: React.FC<QuickRateProps> = React.memo(({
  rideName, currentIndex, total, onRate, onSkip,
}) => {
  const [rating, setRating] = useState(0);
  const [reaction, setReaction] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    setRating(0);
    setReaction(null);
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start();
  }, [currentIndex]);

  return (
    <Animated.View style={[batchStyles.rateCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={batchStyles.rateCounter}>{currentIndex + 1} of {total}</Text>
      <Text style={batchStyles.rateRideName}>{rideName}</Text>

      <Text style={batchStyles.rateLabel}>Rate this ride</Text>
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <SharkRating rating={rating} onRate={setRating} size={40} />
      </View>

      <Text style={batchStyles.rateLabel}>How'd it feel?</Text>
      <ReactionPicker selected={reaction} onSelect={setReaction} />

      <View style={batchStyles.rateActions}>
        <Pressable
          onPress={onSkip}
          style={batchStyles.skipBtn}
        >
          <Text style={batchStyles.skipBtnText}>Skip</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onRate(rating, reaction);
          }}
          style={batchStyles.confirmRateBtn}
        >
          <Text style={batchStyles.confirmRateBtnText}>
            {rating > 0 ? `Rate ${rating}🦈` : 'Confirm'}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
});
QuickRateCard.displayName = 'QuickRateCard';

// ─── Main Screen ───
type Phase = 'select' | 'rate' | 'summary';

export default function RideBatchConfirmScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const detections: DetectedRide[] = route.params?.detections || [];

  const [rides, setRides] = useState<ConfirmedRide[]>(
    detections.map(d => ({ ...d, selected: d.confidence !== 'low' })),
  );
  const [phase, setPhase] = useState<Phase>('select');
  const [rateIndex, setRateIndex] = useState(0);
  const [ratings, setRatings] = useState<Map<string, RatingState>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [totalXp, setTotalXp] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const selectedRides = rides.filter(r => r.selected);

  const toggleRide = useCallback((id: string) => {
    setRides(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  }, []);

  const handleConfirmAndRate = useCallback(() => {
    if (selectedRides.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase('rate');
    setRateIndex(0);
  }, [selectedRides]);

  const ratingsRef = useRef(ratings);
  useEffect(() => { ratingsRef.current = ratings; }, [ratings]);

  const submitAllRides = useCallback(async (finalRatings: Map<string, RatingState>) => {
    setSubmitting(true);
    let xpTotal = 0;
    for (const ride of selectedRides) {
      const rateState = finalRatings.get(ride.id);
      try {
        const payload: LogRidePayload = {
          ride_id: ride.rideId,
          rating: rateState?.rating || undefined,
          reaction: rateState?.reaction || undefined,
          rode_at: new Date(ride.enteredAt).toISOString(),
        };
        const result = await logRide(payload);
        xpTotal += result.xp_earned || 10;
      } catch (e) {
        console.error(`Failed to log ride ${ride.rideName}:`, e);
      }
    }
    setTotalXp(xpTotal);
    setSubmitting(false);
    setShowConfetti(true);
    setPhase('summary');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [selectedRides]);

  const handleRate = useCallback((rating: number, reaction: string | null) => {
    const ride = selectedRides[rateIndex];
    const updatedRatings = new Map(ratingsRef.current).set(ride.id, { rating, reaction });
    setRatings(updatedRatings);

    if (rateIndex < selectedRides.length - 1) {
      setRateIndex(i => i + 1);
    } else {
      submitAllRides(updatedRatings);
    }
  }, [rateIndex, selectedRides, submitAllRides]);

  const handleSkip = useCallback(() => {
    if (rateIndex < selectedRides.length - 1) {
      setRateIndex(i => i + 1);
    } else {
      submitAllRides(ratingsRef.current);
    }
  }, [rateIndex, selectedRides, submitAllRides]);

  // ─── Select Phase ───
  if (phase === 'select') {
    return (
      <SafeAreaView style={batchStyles.container}>
        <View style={batchStyles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={batchStyles.backBtn}>✕</Text>
          </Pressable>
          <Text style={batchStyles.title}>Auto-Detected Rides</Text>
          <View style={{ width: 40 }} />
        </View>

        <Text style={batchStyles.subtitle}>Looks like you had a busy day! 🎢</Text>
        <Text style={batchStyles.description}>
          We detected {rides.length} ride{rides.length !== 1 ? 's' : ''} based on your location.
          Toggle which ones to log.
        </Text>

        <FlatList
          data={rides}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <DetectionRow ride={item} onToggle={() => toggleRide(item.id)} />
          )}
          contentContainerStyle={batchStyles.list}
        />

        <View style={batchStyles.footer}>
          <Pressable
            onPress={handleConfirmAndRate}
            disabled={selectedRides.length === 0}
            style={[batchStyles.confirmBtn, selectedRides.length === 0 && { opacity: 0.4 }]}
          >
            <Text style={batchStyles.confirmBtnText}>
              Confirm & Rate ({selectedRides.length}) 🦈
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Rate Phase ───
  if (phase === 'rate') {
    if (submitting) {
      return (
        <SafeAreaView style={[batchStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={colors.secondary} />
          <Text style={batchStyles.submittingText}>Logging your rides...</Text>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={batchStyles.container}>
        {/* Progress bar */}
        <View style={batchStyles.progressBar}>
          <View style={[batchStyles.progressFill, { width: `${((rateIndex + 1) / selectedRides.length) * 100}%` }]} />
        </View>

        <ScrollView contentContainerStyle={{ flex: 1, justifyContent: 'center', padding: 20 }}>
          <QuickRateCard
            rideName={selectedRides[rateIndex].rideName}
            currentIndex={rateIndex}
            total={selectedRides.length}
            onRate={handleRate}
            onSkip={handleSkip}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Summary Phase ───
  return (
    <SafeAreaView style={batchStyles.container}>
      <ConfettiBurst trigger={showConfetti} />
      <ScrollView contentContainerStyle={batchStyles.summaryContent}>
        <Text style={batchStyles.summaryEmoji}>🎉</Text>
        <Text style={batchStyles.summaryTitle}>All Done!</Text>
        <Text style={batchStyles.summaryXp}>+{totalXp} XP Earned</Text>

        <View style={batchStyles.summaryStats}>
          <View style={batchStyles.summaryStat}>
            <Text style={batchStyles.summaryStatVal}>{selectedRides.length}</Text>
            <Text style={batchStyles.summaryStatLabel}>Rides Logged</Text>
          </View>
          <View style={batchStyles.summaryStat}>
            <Text style={batchStyles.summaryStatVal}>
              {Array.from(ratings.values()).filter(r => r.rating > 0).length}
            </Text>
            <Text style={batchStyles.summaryStatLabel}>Rated</Text>
          </View>
        </View>

        {/* Logged rides list */}
        {selectedRides.map(ride => {
          const r = ratings.get(ride.id);
          return (
            <View key={ride.id} style={batchStyles.summaryRide}>
              <Text style={batchStyles.summaryRideName}>{ride.rideName}</Text>
              {r && r.rating > 0 && (
                <Text style={batchStyles.summaryRideRating}>
                  {'🦈'.repeat(r.rating)}
                </Text>
              )}
              {r?.reaction && <Text style={{ fontSize: 20 }}>{r.reaction}</Text>}
            </View>
          );
        })}

        <Pressable
          onPress={() => navigation.goBack()}
          style={batchStyles.doneBtn}
        >
          <Text style={batchStyles.doneBtnText}>Back to Ride Tracker</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const batchStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { color: colors.textSecondary, fontSize: 22 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', fontFamily: 'Shark' },
  subtitle: {
    color: colors.textPrimary, fontSize: 22, fontWeight: '800', fontFamily: 'Shark',
    textAlign: 'center', marginTop: 8,
  },
  description: {
    color: colors.textSecondary, fontSize: 14, textAlign: 'center',
    paddingHorizontal: 24, marginTop: 8, marginBottom: 16, lineHeight: 20,
  },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.bgMedium, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  rowDeselected: { opacity: 0.5 },
  checkbox: { width: 28, alignItems: 'center' },
  rideName: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  rideDetail: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  footer: { padding: 16, paddingBottom: 20 },
  confirmBtn: {
    backgroundColor: colors.secondary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', ...shadows.md,
  },
  confirmBtnText: { color: '#fff', fontSize: 18, fontWeight: '800', fontFamily: 'Shark' },
  // Rate phase
  progressBar: {
    height: 4, backgroundColor: colors.bgMedium, marginHorizontal: 16, marginTop: 12,
    borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.tertiary, borderRadius: 2 },
  rateCard: {
    backgroundColor: colors.bgMedium, borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  rateCounter: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  rateRideName: {
    color: colors.textPrimary, fontSize: 24, fontWeight: '800', fontFamily: 'Shark',
    textAlign: 'center', marginBottom: 24,
  },
  rateLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600', marginBottom: 10, marginTop: 8 },
  rateActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  skipBtn: {
    flex: 1, backgroundColor: colors.bgDark, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  skipBtnText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  confirmRateBtn: {
    flex: 2, backgroundColor: colors.tertiary, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center',
  },
  confirmRateBtnText: { color: '#000', fontSize: 16, fontWeight: '800', fontFamily: 'Knockout' },
  submittingText: { color: colors.textSecondary, fontSize: 16, marginTop: 16 },
  // Summary
  summaryContent: { alignItems: 'center', padding: 24, paddingTop: 60 },
  summaryEmoji: { fontSize: 72 },
  summaryTitle: { color: colors.textPrimary, fontSize: 32, fontWeight: '900', fontFamily: 'Shark', marginTop: 12 },
  summaryXp: { color: colors.tertiary, fontSize: 22, fontWeight: '700', marginTop: 4 },
  summaryStats: { flexDirection: 'row', gap: 30, marginTop: 24, marginBottom: 24 },
  summaryStat: { alignItems: 'center' },
  summaryStatVal: { color: colors.textPrimary, fontSize: 32, fontWeight: '800', fontFamily: 'Shark' },
  summaryStatLabel: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  summaryRide: {
    flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%',
    backgroundColor: colors.bgMedium, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  summaryRideName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 },
  summaryRideRating: { fontSize: 14 },
  doneBtn: {
    backgroundColor: colors.bgMedium, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40,
    marginTop: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  doneBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
});
