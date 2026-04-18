import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { getRides, getRide, RideType } from '../../api/endpoints/rides';
import { logRide, LogRidePayload } from '../../api/endpoints/player-rides';
import SharkRating from '../../components/RideTracker/SharkRating';
import ReactionPicker from '../../components/RideTracker/ReactionPicker';
import RideTypeIcon from '../../components/RideTracker/RideTypeIcon';
import RideLogSuccess from '../../components/RideTracker/RideLogSuccess';
import { colors } from '../../design-system';
import { PARK_DISPLAY_ORDER } from '../../constants/parkWaitTimes';
import config from '../../config';
import { useToast } from '../../components/Toast';

// ─── Park Selector ───
interface ParkItemProps {
  park: typeof PARK_DISPLAY_ORDER[0];
  selected: boolean;
  onPress: () => void;
}

const ParkItem: React.FC<ParkItemProps> = React.memo(({ park, selected, onPress }) => (
  <Pressable onPress={onPress} style={[s.parkChip, selected && s.parkChipSelected]}>
    <Text style={[s.parkChipText, selected && s.parkChipTextSelected]}>{park.name}</Text>
  </Pressable>
));
ParkItem.displayName = 'ParkItem';

// ─── Ride Selector Item ───
interface RideItemProps {
  ride: RideType;
  selected: boolean;
  onPress: () => void;
}

const RideItem: React.FC<RideItemProps> = React.memo(({ ride, selected, onPress }) => (
  <Pressable onPress={onPress} style={[s.rideItem, selected && s.rideItemSelected]}>
    <RideTypeIcon type={ride.type} size={18} />
    <Text style={[s.rideItemText, selected && s.rideItemTextSelected]} numberOfLines={1}>
      {ride.name}
    </Text>
  </Pressable>
));
RideItem.displayName = 'RideItem';

// ─── Main Screen ───
export default function RideLogScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { showToast } = useToast();

  // Auto-detected ride params (from RideDetectionOverlay)
  const autoDetectedRideId = route.params?.rideId as number | undefined;
  const autoDetectedRideName = route.params?.rideName as string | undefined;
  const autoDetected = route.params?.autoDetected as boolean | undefined;
  const autoRodeAt = route.params?.rodeAt as string | undefined;

  const [step, setStep] = useState<'park' | 'ride' | 'details'>('park');
  const [selectedPark, setSelectedPark] = useState<number | null>(null);
  const [rides, setRides] = useState<RideType[]>([]);
  const [loadingRides, setLoadingRides] = useState(false);
  const [selectedRide, setSelectedRide] = useState<RideType | null>(null);
  const [rating, setRating] = useState(0);
  const [reaction, setReaction] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [waitTime, setWaitTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const stepFade = useRef(new Animated.Value(1)).current;
  const stepSlide = useRef(new Animated.Value(0)).current;

  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{
    ride: any; xpEarned: number; newAchievements: any[]; rideCount?: number; totalRideCount?: number;
  } | null>(null);

  const filteredRides = useMemo(() => {
    if (!searchQuery) return rides;
    const q = searchQuery.toLowerCase();
    return rides.filter(r => r.name.toLowerCase().includes(q));
  }, [rides, searchQuery]);

  const parkGroups = useMemo(() => {
    const groups: Record<string, typeof PARK_DISPLAY_ORDER> = {};
    PARK_DISPLAY_ORDER.forEach(p => {
      if (!groups[p.group]) groups[p.group] = [];
      groups[p.group].push(p);
    });
    return groups;
  }, []);

  const animateStepForward = useCallback(() => {
    stepFade.setValue(0);
    stepSlide.setValue(30);
    Animated.parallel([
      Animated.timing(stepFade, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(stepSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [stepFade, stepSlide]);

  // Auto-detect: if we got here from a ride detection, skip to details
  useEffect(() => {
    if (autoDetectedRideId && autoDetected) {
      (async () => {
        try {
          const ride = await getRide(autoDetectedRideId);
          setSelectedRide(ride);
          setSelectedPark(ride.park_id);
          setStep('details');
        } catch (e) {
          console.warn('Failed to load auto-detected ride:', e);
          // Fall back to normal flow
        }
      })();
    }
  }, [autoDetectedRideId, autoDetected]);

  const handleParkSelect = useCallback(async (parkId: number) => {
    setSelectedPark(parkId);
    setStep('ride');
    animateStepForward();
    setLoadingRides(true);
    setSearchQuery('');
    try {
      const data = await getRides(parkId);
      setRides(data);
    } catch (e) {
      Alert.alert('Error', 'Failed to load rides');
    } finally {
      setLoadingRides(false);
    }
  }, []);

  const handleRideSelect = useCallback((ride: RideType) => {
    setSelectedRide(ride);
    setStep('details');
    animateStepForward();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [animateStepForward]);

  const handleSubmit = useCallback(async () => {
    if (!selectedRide) return;
    setSubmitting(true);

    try {
      const payload: LogRidePayload = {
        ride_id: selectedRide.id,
        rating: rating || undefined,
        reaction: reaction || undefined,
        note: note.trim() || undefined,
        wait_time_minutes: waitTime ? parseInt(waitTime, 10) : undefined,
        rode_at: autoRodeAt || new Date().toISOString(),
      };

      const result = await logRide(payload);

      setSuccessData({
        ride: {
          ...result.data,
          ride_name: selectedRide.name,
          ride_type: selectedRide.type,
          park_id: selectedRide.park_id,
        },
        xpEarned: result.xp_earned || 10,
        newAchievements: result.new_achievements || [],
        totalRideCount: (result as any).total_ride_count,
      });
      setShowSuccess(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to log ride');
    } finally {
      setSubmitting(false);
    }
  }, [selectedRide, rating, reaction, note, waitTime, navigation, showToast]);

  const handleBack = useCallback(() => {
    if (step === 'details') {
      setStep('ride');
      setSelectedRide(null);
      setRating(0);
      setReaction(null);
      setNote('');
      setWaitTime('');
    } else if (step === 'ride') {
      setStep('park');
      setSelectedPark(null);
      setRides([]);
    } else {
      navigation.goBack();
    }
  }, [step, navigation]);

  if (showSuccess && successData) {
    return (
      <RideLogSuccess
        ride={successData.ride}
        rideCount={successData.rideCount}
        totalRideCount={successData.totalRideCount}
        xpEarned={successData.xpEarned}
        newAchievements={successData.newAchievements}
        onDone={() => navigation.goBack()}
        onLogAnother={() => {
          setShowSuccess(false);
          setSuccessData(null);
          setStep('park');
          setSelectedPark(null);
          setSelectedRide(null);
          setRating(0);
          setReaction(null);
          setNote('');
          setWaitTime('');
        }}
      />
    );
  }

  const stepTitle = step === 'park' ? 'Pick a Park' : step === 'ride' ? 'Pick a Ride' : 'Rate Your Ride';

  return (
    <View style={s.root}>
      {/* Header */}
      <LinearGradient
        colors={['#38BDF8', '#0EA5E9', '#0284C7']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={s.headerGradient}
      >
        <SafeAreaView edges={['top']}>
          <View style={s.header}>
            <Pressable onPress={handleBack} hitSlop={16} style={({ pressed }) => [s.navBtn, pressed && { opacity: 0.6 }]}>
              <Text style={s.navBtnText}>‹</Text>
            </Pressable>
            <Text style={s.headerTitle}>{stepTitle}</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Step: Park Selection */}
      {step === 'park' && (
        <ScrollView contentContainerStyle={s.parkList} style={{ backgroundColor: '#dbeefe' }}>
          {Object.entries(parkGroups).map(([group, parks]) => (
            <View key={group} style={s.parkGroup}>
              <Text style={s.parkGroupLabel}>{group}</Text>
              {parks.map(park => (
                <ParkItem
                  key={park.id}
                  park={park}
                  selected={selectedPark === park.id}
                  onPress={() => handleParkSelect(park.id)}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Step: Ride Selection */}
      {step === 'ride' && (
        <View style={{ flex: 1, backgroundColor: '#dbeefe' }}>
          <View style={s.searchBox}>
            <TextInput
              style={s.searchInput}
              placeholder="Search rides..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
          </View>
          {loadingRides ? (
            <ActivityIndicator size="large" color="#0EA5E9" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredRides}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <RideItem
                  ride={item}
                  selected={selectedRide?.id === item.id}
                  onPress={() => handleRideSelect(item)}
                />
              )}
              contentContainerStyle={s.rideList}
              ListEmptyComponent={
                <Text style={s.emptyText}>
                  {searchQuery ? 'No rides match your search' : 'No rides found for this park'}
                </Text>
              }
            />
          )}
        </View>
      )}

      {/* Step: Rate & Details */}
      {step === 'details' && selectedRide && (
        <ScrollView contentContainerStyle={s.detailsContainer} style={{ backgroundColor: '#dbeefe' }}>
          <View style={s.selectedRideCard}>
            <RideTypeIcon type={selectedRide.type} size={24} />
            <Text style={s.selectedRideName}>{selectedRide.name}</Text>
          </View>

          <Text style={s.sectionLabel}>Rate this ride</Text>
          <View style={s.ratingRow}>
            <SharkRating rating={rating} onRate={setRating} size={40} />
          </View>

          <Text style={s.sectionLabel}>How'd it make you feel?</Text>
          <ReactionPicker selected={reaction} onSelect={setReaction} />

          <Text style={s.sectionLabel}>Wait time (minutes)</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. 45"
            placeholderTextColor="#94a3b8"
            keyboardType="number-pad"
            value={waitTime}
            onChangeText={setWaitTime}
            maxLength={4}
          />

          <Text style={s.sectionLabel}>Notes (optional)</Text>
          <TextInput
            style={[s.input, s.noteInput]}
            placeholder="Front row was insane! 🎢"
            placeholderTextColor="#94a3b8"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
          />

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [s.submitBtn, pressed && { transform: [{ scale: 0.98 }] }, submitting && { opacity: 0.5 }]}
          >
            <LinearGradient
              colors={['#fec90e', '#d4a70a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.submitBtnGradient}
            >
              {submitting ? (
                <ActivityIndicator color="#1a1a2e" />
              ) : (
                <Text style={s.submitBtnText}>🦈 Log This Ride!</Text>
              )}
            </LinearGradient>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#dbeefe' },

  // Header
  headerGradient: { },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  navBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  navBtnText: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
  headerTitle: {
    color: '#fff', fontSize: 18, fontWeight: '900', fontFamily: 'Shark', letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.15)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  // Park selection
  parkList: { padding: 16, paddingBottom: 40 },
  parkGroup: { marginBottom: 20 },
  parkGroupLabel: {
    fontSize: 13, fontWeight: '900', fontFamily: 'Knockout', color: '#1a1a2e',
    letterSpacing: 1.5, marginBottom: 8,
  },
  parkChip: {
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
    marginBottom: 8, borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  parkChipSelected: { borderColor: '#0EA5E9', backgroundColor: '#e8f7ff' },
  parkChipText: { color: '#1a1a2e', fontSize: 16, fontWeight: '600' },
  parkChipTextSelected: { color: '#0284C7', fontWeight: '700' },

  // Ride selection
  searchBox: { paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: {
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
    color: '#1a1a2e', fontSize: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
  },
  rideList: { paddingHorizontal: 16, paddingBottom: 40 },
  rideItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14,
    marginBottom: 6, borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2,
  },
  rideItemSelected: { borderColor: '#fec90e', backgroundColor: '#fffbeb' },
  rideItemText: { color: '#1a1a2e', fontSize: 15, flex: 1 },
  rideItemTextSelected: { color: '#92400e', fontWeight: '600' },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 40, fontSize: 15 },

  // Details
  detailsContainer: { padding: 20, paddingBottom: 60 },
  selectedRideCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
  },
  selectedRideName: { color: '#1a1a2e', fontSize: 18, fontWeight: '700', flex: 1 },
  sectionLabel: {
    color: '#475569', fontSize: 14, fontWeight: '700', marginBottom: 10, marginTop: 20,
  },
  ratingRow: { alignItems: 'center' },
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    color: '#1a1a2e', fontSize: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  submitBtn: {
    borderRadius: 16, overflow: 'hidden', marginTop: 30,
    shadowColor: '#d4a70a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  submitBtnGradient: {
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
  },
  submitBtnText: { color: '#1a1a2e', fontSize: 18, fontWeight: '900', fontFamily: 'Shark' },
});
