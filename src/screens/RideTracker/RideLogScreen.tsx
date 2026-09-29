import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ImageBackground,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { getRides, getRide, RideType } from '../../api/endpoints/rides';
import { logRide, LogRidePayload } from '../../api/endpoints/player-rides';
import SharkRating from '../../components/RideTracker/SharkRating';
import ReactionPicker from '../../components/RideTracker/ReactionPicker';
import RideTypeIcon from '../../components/RideTracker/RideTypeIcon';
import RideLogSuccess from '../../components/RideTracker/RideLogSuccess';
import { PARK_DISPLAY_ORDER } from '../../constants/parkWaitTimes';
import Wrapper from '../../components/Wrapper';
import Topbar from '../../components/Topbar';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import TopbarText from '../../components/Topbar/TopbarText';
import { removePendingDetection } from '../../services/RideDetectionService';
import ProfileStatIcon from '../../components/ProfileStatIcon';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

// ─── Park Selector ───
interface ParkItemProps {
  park: typeof PARK_DISPLAY_ORDER[0];
  selected: boolean;
  onPress: () => void;
}

const ParkItem: React.FC<ParkItemProps> = React.memo(({ park, selected, onPress }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Choose ${park.name}`}
    accessibilityState={{ selected }}
    style={({ pressed }) => [s.parkChip, selected && s.parkChipSelected, pressed && s.choicePressed]}>
    <View style={s.parkIcon}><ProfileStatIcon index={2} size={30} /></View>
    <Text style={[s.parkChipText, selected && s.parkChipTextSelected]} numberOfLines={2}>{park.name}</Text>
    <Text style={s.choiceChevron}>›</Text>
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
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Choose ${ride.name}`}
    accessibilityState={{ selected }}
    style={({ pressed }) => [s.rideItem, selected && s.rideItemSelected, pressed && s.choicePressed]}>
    <RideTypeIcon type={ride.type} size={28} />
    <Text style={[s.rideItemText, selected && s.rideItemTextSelected]} numberOfLines={2}>
      {ride.name}
    </Text>
    <Text style={s.choiceChevron}>›</Text>
  </Pressable>
));
RideItem.displayName = 'RideItem';

// ─── Main Screen ───
export default function RideLogScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // Auto-detected ride params (from RideDetectionOverlay)
  const autoDetectedRideId = route.params?.rideId as number | undefined;
  const autoDetectedRideName = route.params?.rideName as string | undefined;
  const autoDetectedRideType = route.params?.rideType as string | undefined;
  const autoDetectedParkId = route.params?.parkId as number | undefined;
  const autoDetected = route.params?.autoDetected as boolean | undefined;
  const autoRodeAt = route.params?.rodeAt as string | undefined;
  const detectionId = route.params?.detectionId as string | undefined;

  const [step, setStep] = useState<'park' | 'ride' | 'details'>('park');
  const [selectedPark, setSelectedPark] = useState<number | null>(null);
  const [rides, setRides] = useState<RideType[]>([]);
  const [loadingRides, setLoadingRides] = useState(false);
  const [ridesUnavailable, setRidesUnavailable] = useState(false);
  const [selectedRide, setSelectedRide] = useState<RideType | null>(null);
  const [rating, setRating] = useState(0);
  const [reaction, setReaction] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [waitTime, setWaitTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const rideLoadSequence = useRef(0);
  const saving = useRef(false);
  const reducedMotion = useReducedGameMotion();

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

  // The confirmed detection already has the fields this journal form needs.
  // Guests can rate their ride immediately even if the catalog API is slow.
  useEffect(() => {
    if (autoDetectedRideId && autoDetected) {
      if (autoDetectedRideName && autoDetectedParkId) {
        const type = ['coaster', 'dark_ride', 'flat_ride', 'water_ride', 'show',
          'walk_through', 'transport', 'other'].includes(autoDetectedRideType ?? '')
          ? autoDetectedRideType as RideType['type'] : 'other';
        setSelectedRide({
          id: autoDetectedRideId, name: autoDetectedRideName, type,
          park_id: autoDetectedParkId, park_name: null,
          slug: '', lat: null, lng: null, image_url: null, metadata: null,
          radius: 50, ride_duration_minutes: null, min_dwell_minutes: null,
        });
        setSelectedPark(autoDetectedParkId);
        setStep('details');
        return;
      }
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
  }, [autoDetectedRideId, autoDetected, autoDetectedRideName, autoDetectedRideType, autoDetectedParkId]);

  const loadParkRides = useCallback(async (parkId: number) => {
    const sequence = ++rideLoadSequence.current;
    setLoadingRides(true);
    setRidesUnavailable(false);
    setSearchQuery('');
    try {
      const data = __DEV__ && process.env.EXPO_PUBLIC_RIDE_LOG_FIXTURE === '1'
        ? [{
            id: 10, name: 'Space Mountain', slug: 'space-mountain', park_id: parkId,
            park_name: PARK_DISPLAY_ORDER.find(park => park.id === parkId)?.name ?? null,
            type: 'coaster' as const, lat: null, lng: null, image_url: null,
            metadata: null, radius: 50, ride_duration_minutes: null, min_dwell_minutes: null,
          }]
        : await getRides(parkId);
      if (sequence === rideLoadSequence.current) setRides(data);
    } catch (e) {
      if (sequence === rideLoadSequence.current) {
        setRides([]);
        setRidesUnavailable(true);
      }
    } finally {
      if (sequence === rideLoadSequence.current) setLoadingRides(false);
    }
  }, []);

  const handleParkSelect = useCallback((parkId: number) => {
    setSelectedPark(parkId);
    setStep('ride');
    loadParkRides(parkId);
  }, [loadParkRides]);

  const handleRideSelect = useCallback((ride: RideType) => {
    setSelectedRide(ride);
    setStep('details');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedRide || saving.current) return;
    if (waitTime && !/^\d+$/.test(waitTime)) {
      Alert.alert('Check your wait time', 'Enter a whole number of minutes, or leave it blank.');
      return;
    }
    saving.current = true;
    setSubmitting(true);

    try {
      const payload: LogRidePayload = {
        ride_id: selectedRide.id,
        source_detection_id: detectionId,
        rating: rating || undefined,
        reaction: reaction || undefined,
        note: note.trim() || undefined,
        wait_time_minutes: waitTime ? parseInt(waitTime, 10) : undefined,
        rode_at: autoRodeAt || new Date().toISOString(),
      };

      const result = await logRide(payload);
      if (detectionId) void removePendingDetection(detectionId).catch(() => undefined);

      setSuccessData({
        ride: {
          ...result.data,
          ride_name: selectedRide.name,
          ride_type: selectedRide.type,
          park_id: selectedRide.park_id,
        },
        xpEarned: result.xp_earned ?? 0,
        newAchievements: result.new_achievements || [],
        rideCount: result.ride_count,
        totalRideCount: result.total_ride_count,
      });
      setShowSuccess(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to log ride');
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  }, [selectedRide, rating, reaction, note, waitTime, autoRodeAt, detectionId]);

  const handleBack = useCallback(() => {
    if (step === 'details') {
      setStep('ride');
      setSelectedRide(null);
      setRating(0);
      setReaction(null);
      setNote('');
      setWaitTime('');
    } else if (step === 'ride') {
      rideLoadSequence.current += 1;
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

  const stepTitle = step === 'park' ? 'Choose a Park' : step === 'ride' ? 'Choose a Ride' : 'Your Ride Memory';

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <Pressable onPress={handleBack} accessibilityRole="button" accessibilityLabel="Go back">
            <Image source={require('../../../assets/images/screens/explore/back.png')}
              style={{ width: 35, height: 35 }} contentFit="contain" />
          </Pressable>
        </TopbarColumn>
        <TopbarColumn><TopbarText>Ride Journal</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <ImageBackground source={require('../../../assets/images/seaweed_background.png')}
        style={s.root} resizeMode="cover">

      {/* Step: Park Selection */}
      {step === 'park' && (
        <ScrollView contentContainerStyle={s.parkList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.stepIntro}>
            <View style={s.stepCopy}>
              <Text style={s.stepEyebrow}>RIDE JOURNAL · 1 OF 3</Text>
              <Text style={s.stepTitle}>{stepTitle}</Text>
              <Text style={s.stepDescription}>Keep the rides you loved in your shark's story.</Text>
            </View>
            <Image source={require('../../../assets/images/screens/lineplay/queue-recap-shark.png')}
              style={s.stepShark} contentFit="contain" />
          </View>
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
        <View style={{ flex: 1 }}>
          <View style={s.compactIntro}>
            <Text style={s.stepEyebrow}>RIDE JOURNAL · 2 OF 3</Text>
            <Text style={s.stepTitle}>{stepTitle}</Text>
          </View>
          {!ridesUnavailable && <View style={s.searchBox}>
            <TextInput
              style={s.searchInput}
              placeholder="Search rides..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              accessibilityLabel="Search this park's rides"
              autoCorrect={false}
            />
          </View>}
          {loadingRides ? (
            <ActivityIndicator size="large" color="#0EA5E9" style={{ marginTop: 40 }} />
          ) : ridesUnavailable ? (
            <View style={s.unavailableCard}>
              <Image source={require('../../../assets/images/screens/pin-collections/shark.png')}
                style={s.unavailableShark} contentFit="contain" />
              <Text style={s.unavailableTitle}>Ride list is taking a break</Text>
              <Text style={s.unavailableBody}>Your journal is safe. Reconnect and try loading this park again.</Text>
              <Pressable onPress={() => selectedPark && loadParkRides(selectedPark)}
                accessibilityRole="button" style={s.retryButton}>
                <Text style={s.retryText}>Try Again</Text>
              </Pressable>
            </View>
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
              keyboardShouldPersistTaps="handled"
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
        <ScrollView contentContainerStyle={s.detailsContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={s.stepEyebrow}>RIDE JOURNAL · 3 OF 3</Text>
            <Text style={s.stepTitle}>{stepTitle}</Text>
            <Text style={s.detailsHint}>A personal memory for your collection.</Text>
          </View>
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
            accessibilityLabel="Wait time in minutes, optional"
          />

          <Text style={s.sectionLabel}>Notes (optional)</Text>
          <TextInput
            style={[s.input, s.noteInput]}
            placeholder="What made this ride memorable?"
            placeholderTextColor="#94a3b8"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={255}
            accessibilityLabel="Your ride memory, optional"
          />

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            accessibilityRole="button" accessibilityLabel="Save ride memory"
            accessibilityState={{ disabled: submitting, busy: submitting }}
            style={({ pressed }) => [s.submitBtn, pressed && { transform: [{ scale: reducedMotion ? 1 : 0.98 }] }, submitting && { opacity: 0.5 }]}
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
                <Text style={s.submitBtnText}>Save Ride Memory</Text>
              )}
            </LinearGradient>
          </Pressable>
        </ScrollView>
      )}
      </ImageBackground>
    </Wrapper>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#dbeefe' },
  stepIntro: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 18,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20,
    borderWidth: 2, borderColor: '#84CAEE', paddingLeft: 18, overflow: 'hidden',
  },
  stepCopy: { flex: 1, paddingVertical: 18 },
  stepEyebrow: { color: '#126BAB', fontSize: 11, fontFamily: 'Knockout', letterSpacing: 1.1 },
  stepTitle: { color: '#0B4B83', fontSize: 27, fontFamily: 'Shark', marginTop: 3 },
  stepDescription: { color: '#315C7C', fontSize: 14, fontFamily: 'Knockout', lineHeight: 19, marginTop: 6 },
  stepShark: { width: 115, height: 115, marginRight: -8, alignSelf: 'flex-end' },
  compactIntro: { paddingHorizontal: 18, paddingTop: 17, paddingBottom: 5 },
  detailsHint: { color: '#315C7C', fontSize: 14, fontFamily: 'Knockout', marginTop: 3, marginBottom: 18 },
  unavailableCard: {
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 18, marginHorizontal: 18, marginTop: 20, padding: 20,
    borderWidth: 2, borderColor: '#84CAEE',
  },
  unavailableShark: { width: 90, height: 90 },
  unavailableTitle: { color: '#0B4B83', fontSize: 21, fontFamily: 'Shark', textAlign: 'center' },
  unavailableBody: { color: '#315C7C', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  retryButton: { backgroundColor: '#F6C847', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, marginTop: 18 },
  retryText: { color: '#174064', fontFamily: 'Shark', fontSize: 17 },

  // Park selection
  parkList: { padding: 16, paddingBottom: 40 },
  parkGroup: { marginBottom: 20 },
  parkGroupLabel: {
    fontSize: 13, fontWeight: '900', fontFamily: 'Knockout', color: '#1a1a2e',
    letterSpacing: 1.5, marginBottom: 8,
  },
  parkChip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14,
    marginBottom: 8, borderWidth: 2, borderColor: '#BADFF4',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  parkChipSelected: { borderColor: '#0EA5E9', backgroundColor: '#e8f7ff' },
  parkChipText: { color: '#0B4B83', fontSize: 18, fontFamily: 'Shark', flex: 1 },
  parkChipTextSelected: { color: '#0284C7', fontWeight: '700' },
  parkIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center',
    borderRadius: 13, backgroundColor: '#E6F5FF' },
  choiceChevron: { color: '#2A749E', fontSize: 24, fontFamily: 'Knockout' },
  choicePressed: { backgroundColor: '#FFF7D8', borderColor: '#E8B844' },

  // Ride selection
  searchBox: { paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: {
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
    color: '#174D76', fontSize: 15, fontFamily: 'Knockout', borderWidth: 1, borderColor: '#B9DFF3',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
  },
  rideList: { paddingHorizontal: 16, paddingBottom: 40 },
  rideItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14,
    marginBottom: 8, borderWidth: 2, borderColor: '#CBE7F5',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2,
  },
  rideItemSelected: { borderColor: '#fec90e', backgroundColor: '#fffbeb' },
  rideItemText: { color: '#174D76', fontSize: 17, fontFamily: 'Shark', flex: 1 },
  rideItemTextSelected: { color: '#92400e', fontWeight: '600' },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 40, fontSize: 15 },

  // Details
  detailsContainer: { padding: 20, paddingBottom: 80 },
  selectedRideCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
  },
  selectedRideName: { color: '#174D76', fontSize: 20, fontFamily: 'Shark', flex: 1 },
  sectionLabel: {
    color: '#315C7C', fontSize: 15, fontFamily: 'Knockout', marginBottom: 10, marginTop: 20,
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
