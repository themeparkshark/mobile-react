import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Animated, ScrollView,
  ImageBackground,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { logRide } from '../../api/endpoints/player-rides';
import SharkRating from '../../components/RideTracker/SharkRating';
import ReactionPicker from '../../components/RideTracker/ReactionPicker';
import SharkReactionIcon from '../../components/RideTracker/SharkReactionIcon';
import ConfettiBurst from '../../components/RideTracker/ConfettiBurst';
import { DetectedRide, removePendingDetection } from '../../services/RideDetectionService';
import { rideDetectionEmitter } from '../../services/RideDetectionEmitter';
import { colors, shadows } from '../../design-system';
import Wrapper from '../../components/Wrapper';
import Topbar from '../../components/Topbar';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import TopbarText from '../../components/Topbar/TopbarText';
import { saveDetectedRideBatch } from '../../services/rideJournalBatch';
import { GameIcon, SharkLoader } from '../../ui';

function BatchShell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Return to Ride Tracker">
            <Image source={require('../../../assets/images/screens/explore/back.png')}
              style={{ width: 35, height: 35 }} contentFit="contain" />
          </Pressable>
        </TopbarColumn>
        <TopbarColumn><TopbarText>Ride Journal</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <ImageBackground source={require('../../../assets/images/seaweed_background.png')}
        style={batchStyles.container} resizeMode="cover">
        {children}
      </ImageBackground>
    </Wrapper>
  );
}

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
      accessibilityRole="checkbox" accessibilityState={{ checked: ride.selected }}
      accessibilityLabel={`${ride.rideName}, ${levelLabel(ride.confidence)} confidence`}
      style={[batchStyles.row, !ride.selected && batchStyles.rowDeselected]}
    >
      <View style={[batchStyles.checkbox, ride.selected && batchStyles.checkboxSelected]}>
        {ride.selected && <GameIcon name="check" size={22} />}
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

function levelLabel(level: 'high' | 'medium' | 'low'): string {
  return level === 'medium' ? 'medium' : level;
}

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
            {rating > 0 ? `Save ${rating}-Star Rating` : 'Continue'}
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
  const [savedRideIds, setSavedRideIds] = useState<Set<string>>(new Set());
  const [failedRideIds, setFailedRideIds] = useState<Set<string>>(new Set());
  const [showConfetti, setShowConfetti] = useState(false);

  const selectedRides = rides.filter(r => r.selected);

  // Dismiss only the detections shown here. A new detection may arrive while
  // the guest reviews this screen, and failed saves must stay retryable.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event: any) => {
      if (submitting) {
        event.preventDefault();
      } else if (phase !== 'summary') {
        void Promise.allSettled(detections.map(d => removePendingDetection(d.id)));
        rideDetectionEmitter.emit('pendingCleared');
      }
    });
    return unsubscribe;
  }, [navigation, phase, submitting]);

  const toggleRide = useCallback((id: string) => {
    setRides(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  }, []);

  const handleConfirmAndRate = useCallback(() => {
    if (selectedRides.length === 0) return;
    void Promise.allSettled(rides.filter(r => !r.selected).map(r => removePendingDetection(r.id)));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase('rate');
    setRateIndex(0);
  }, [selectedRides, rides]);

  const ratingsRef = useRef(ratings);
  useEffect(() => { ratingsRef.current = ratings; }, [ratings]);

  const submitAllRides = useCallback(async (finalRatings: Map<string, RatingState>) => {
    setSubmitting(true);
    const { savedIds, failedIds } = await saveDetectedRideBatch(
      selectedRides, finalRatings, savedRideIds, logRide, removePendingDetection,
    );
    rideDetectionEmitter.emit('pendingCleared');

    setSavedRideIds(savedIds);
    setFailedRideIds(failedIds);
    setSubmitting(false);
    setShowConfetti(savedIds.size > 0);
    setPhase('summary');
    if (savedIds.size > 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [selectedRides, savedRideIds]);

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
      <BatchShell onBack={() => navigation.goBack()}>
        <View style={batchStyles.selectHero}>
          <View style={{ flex: 1 }}>
            <Text style={batchStyles.eyebrow}>YOUR PARK DAY</Text>
            <Text style={batchStyles.subtitle}>Remember Your Rides</Text>
          </View>
          <Image source={require('../../../assets/images/screens/lineplay/queue-recap-shark.png')}
            style={batchStyles.selectShark} contentFit="contain" />
        </View>
        <Text style={batchStyles.description}>
          We noticed {rides.length} possible ride{rides.length !== 1 ? 's' : ''} from your location.
          Choose the ones you actually rode for your journal.
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
              Rate {selectedRides.length} {selectedRides.length === 1 ? 'Ride' : 'Rides'}
            </Text>
          </Pressable>
        </View>
      </BatchShell>
    );
  }

  // ─── Rate Phase ───
  if (phase === 'rate') {
    if (submitting) {
      return (
        <BatchShell onBack={() => navigation.goBack()}>
          <View style={batchStyles.submittingCenter}>
          <SharkLoader compact title="Logging your rides" />
          </View>
        </BatchShell>
      );
    }

    return (
      <BatchShell onBack={() => navigation.goBack()}>
        {/* Progress bar */}
        <View style={batchStyles.progressBar}>
          <View style={[batchStyles.progressFill, { width: `${((rateIndex + 1) / selectedRides.length) * 100}%` }]} />
        </View>

        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}>
          <QuickRateCard
            rideName={selectedRides[rateIndex].rideName}
            currentIndex={rateIndex}
            total={selectedRides.length}
            onRate={handleRate}
            onSkip={handleSkip}
          />
        </ScrollView>
      </BatchShell>
    );
  }

  // ─── Summary Phase ───
  return (
    <BatchShell onBack={() => navigation.goBack()}>
      <ConfettiBurst trigger={showConfetti} />
      <ScrollView contentContainerStyle={batchStyles.summaryContent}>
        <Image source={require('../../../assets/images/screens/lineplay/queue-recap-shark.png')}
          style={batchStyles.summaryShark} contentFit="contain" />
        <Text style={batchStyles.summaryTitle}>
          {failedRideIds.size === selectedRides.length
            ? 'Rides Not Saved Yet'
            : failedRideIds.size > 0 ? 'Some Rides Need Another Try' : 'Ride Memories Saved!'}
        </Text>
        <Text style={batchStyles.summaryXp}>
          {failedRideIds.size === selectedRides.length
            ? 'Could not save to your journal. Check your internet and try again.'
            : failedRideIds.size > 0
            ? `${failedRideIds.size} ${failedRideIds.size === 1 ? 'ride is' : 'rides are'} still waiting to save`
            : 'Added to your ride journal'}
        </Text>

        {savedRideIds.size > 0 && <View style={batchStyles.summaryStats}>
          <View style={batchStyles.summaryStat}>
            <Text style={batchStyles.summaryStatVal}>{savedRideIds.size}</Text>
            <Text style={batchStyles.summaryStatLabel}>Memories Saved</Text>
          </View>
          <View style={batchStyles.summaryStat}>
            <Text style={batchStyles.summaryStatVal}>
              {selectedRides.filter(ride => savedRideIds.has(ride.id) && (ratings.get(ride.id)?.rating ?? 0) > 0).length}
            </Text>
            <Text style={batchStyles.summaryStatLabel}>Rated</Text>
          </View>
        </View>}

        {/* Logged rides list */}
        {selectedRides.map(ride => {
          const r = ratings.get(ride.id);
          return (
            <View key={ride.id} style={batchStyles.summaryRide}>
              <Text style={batchStyles.summaryRideName}>{ride.rideName}</Text>
              <Text style={[batchStyles.summaryRideStatus, !savedRideIds.has(ride.id) && batchStyles.summaryRideFailed]}>
                {savedRideIds.has(ride.id) ? 'Saved' : 'Not saved'}
              </Text>
              {r && r.rating > 0 && (
                <SharkRating rating={r.rating} readonly size={20} />
              )}
              {r?.reaction && <SharkReactionIcon reaction={r.reaction} size={28} />}
            </View>
          );
        })}

        {failedRideIds.size > 0 && (
          <Pressable onPress={() => submitAllRides(ratings)} disabled={submitting}
            style={[batchStyles.confirmBtn, submitting && { opacity: 0.55 }]}>
            <Text style={batchStyles.confirmBtnText}>{submitting ? 'Saving...' : 'Retry Unsaved Rides'}</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => navigation.goBack()}
          style={batchStyles.doneBtn}
        >
          <Text style={batchStyles.doneBtnText}>Back to Ride Tracker</Text>
        </Pressable>
      </ScrollView>
    </BatchShell>
  );
}

const batchStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#DFF3FF' },
  selectHero: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.93)', borderRadius: 20,
    borderWidth: 2, borderColor: '#84CAEE', paddingLeft: 18, overflow: 'hidden',
  },
  selectShark: { width: 112, height: 112, alignSelf: 'flex-end', marginRight: -6 },
  eyebrow: { color: '#126BAB', fontSize: 11, fontFamily: 'Knockout', letterSpacing: 1.2 },
  subtitle: {
    color: '#0B4B83', fontSize: 25, fontFamily: 'Shark', marginTop: 5,
  },
  description: {
    color: '#315C7C', fontSize: 14, fontFamily: 'Knockout',
    paddingHorizontal: 24, marginTop: 14, marginBottom: 16, lineHeight: 20,
  },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 2, borderColor: '#BADFF4',
  },
  rowDeselected: { opacity: 0.5 },
  checkbox: {
    width: 27, height: 27, borderRadius: 8, borderWidth: 2,
    borderColor: '#84CAEE', backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  rideName: { color: '#173A5B', fontSize: 16, fontFamily: 'Shark' },
  rideDetail: { color: '#426883', fontSize: 12, fontFamily: 'Knockout', marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: 'Knockout' },
  footer: { padding: 16, paddingBottom: 80 },
  checkboxSelected: { backgroundColor: '#1179CB', borderColor: '#0B4B83' },
  checkboxTick: { color: '#FFFFFF', fontSize: 19, fontFamily: 'Shark', lineHeight: 22 },
  confirmBtn: {
    backgroundColor: '#F6C847', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', width: '100%', ...shadows.md,
  },
  confirmBtnText: { color: '#174064', fontSize: 18, fontFamily: 'Shark' },
  // Rate phase
  progressBar: {
    height: 8, backgroundColor: '#B7DBEF', marginHorizontal: 20, marginTop: 20,
    borderRadius: 4, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#F6C847', borderRadius: 4 },
  rateCard: {
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, padding: 24,
    borderWidth: 2, borderColor: '#84CAEE',
  },
  rateCounter: { color: '#126BAB', fontSize: 13, fontFamily: 'Knockout', textAlign: 'center', marginBottom: 8 },
  rateRideName: {
    color: '#0B4B83', fontSize: 27, fontFamily: 'Shark',
    textAlign: 'center', marginBottom: 24,
  },
  rateLabel: { color: '#315C7C', fontSize: 14, fontFamily: 'Knockout', marginBottom: 10, marginTop: 8 },
  rateActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  skipBtn: {
    flex: 1, backgroundColor: '#E7F5FC', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#84CAEE',
  },
  skipBtnText: { color: '#315C7C', fontSize: 16, fontFamily: 'Knockout' },
  confirmRateBtn: {
    flex: 2, backgroundColor: '#F6C847', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center',
  },
  confirmRateBtnText: { color: '#174064', fontSize: 16, fontFamily: 'Shark' },
  submittingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  submittingText: { color: '#315C7C', fontSize: 16, fontFamily: 'Knockout', marginTop: 16 },
  // Summary
  summaryContent: { alignItems: 'center', padding: 20, paddingTop: 25, paddingBottom: 55 },
  summaryShark: { width: 132, height: 132 },
  summaryTitle: { color: '#0B4B83', fontSize: 29, fontFamily: 'Shark', marginTop: 8, textAlign: 'center' },
  summaryXp: { color: '#315C7C', fontSize: 16, fontFamily: 'Knockout', marginTop: 6, textAlign: 'center' },
  summaryStats: { flexDirection: 'row', gap: 30, marginTop: 24, marginBottom: 24 },
  summaryStat: { alignItems: 'center' },
  summaryStatVal: { color: '#0B4B83', fontSize: 32, fontFamily: 'Shark' },
  summaryStatLabel: { color: '#315C7C', fontSize: 13, fontFamily: 'Knockout', marginTop: 2 },
  summaryRide: {
    flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', flexWrap: 'wrap',
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#84CAEE',
  },
  summaryRideName: { color: '#173A5B', fontSize: 15, fontFamily: 'Shark', flex: 1 },
  summaryRideStatus: { color: '#126BAB', fontSize: 12, fontFamily: 'Knockout' },
  summaryRideFailed: { color: '#A24130' },
  doneBtn: {
    backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40,
    marginTop: 14, borderWidth: 1, borderColor: '#84CAEE',
  },
  doneBtnText: { color: '#174064', fontSize: 16, fontFamily: 'Knockout' },
});
