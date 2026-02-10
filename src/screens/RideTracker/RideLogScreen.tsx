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
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getRides, RideType } from '../../api/endpoints/rides';
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
  <Pressable onPress={onPress} style={[styles.parkChip, selected && styles.parkChipSelected]}>
    <Text style={[styles.parkChipText, selected && styles.parkChipTextSelected]}>{park.name}</Text>
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
  <Pressable onPress={onPress} style={[styles.rideItem, selected && styles.rideItemSelected]}>
    <RideTypeIcon type={ride.type} size={18} />
    <Text style={[styles.rideItemText, selected && styles.rideItemTextSelected]} numberOfLines={1}>
      {ride.name}
    </Text>
  </Pressable>
));
RideItem.displayName = 'RideItem';

// ─── Main Screen ───
export default function RideLogScreen() {
  const navigation = useNavigation<any>();
  const { showToast } = useToast();

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

  // Step transition animation
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

  // Group parks by resort
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
        rode_at: new Date().toISOString(),
      };

      const result = await logRide(payload);

      // Success! Show shareable card
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

  // ─── Success with Shareable Card ───
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={12}>
          <Text style={styles.backBtn}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {step === 'park' ? 'Pick a Park' : step === 'ride' ? 'Pick a Ride' : 'Rate Your Ride'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Step: Park Selection */}
      {step === 'park' && (
        <ScrollView contentContainerStyle={styles.parkList}>
          {Object.entries(parkGroups).map(([group, parks]) => (
            <View key={group} style={styles.parkGroup}>
              <Text style={styles.parkGroupLabel}>{group}</Text>
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
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search rides..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
          </View>
          {loadingRides ? (
            <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: 40 }} />
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
              contentContainerStyle={styles.rideList}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {searchQuery ? 'No rides match your search' : 'No rides found for this park'}
                </Text>
              }
            />
          )}
        </View>
      )}

      {/* Step: Rate & Details */}
      {step === 'details' && selectedRide && (
        <ScrollView contentContainerStyle={styles.detailsContainer}>
          <View style={styles.selectedRideCard}>
            <RideTypeIcon type={selectedRide.type} size={24} />
            <Text style={styles.selectedRideName}>{selectedRide.name}</Text>
          </View>

          {/* Rating */}
          <Text style={styles.sectionLabel}>Rate this ride</Text>
          <View style={styles.ratingRow}>
            <SharkRating rating={rating} onRate={setRating} size={40} />
          </View>

          {/* Reaction */}
          <Text style={styles.sectionLabel}>How'd it make you feel?</Text>
          <ReactionPicker selected={reaction} onSelect={setReaction} />

          {/* Wait time */}
          <Text style={styles.sectionLabel}>Wait time (minutes)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 45"
            placeholderTextColor="rgba(255,255,255,0.3)"
            keyboardType="number-pad"
            value={waitTime}
            onChangeText={setWaitTime}
            maxLength={4}
          />

          {/* Note */}
          <Text style={styles.sectionLabel}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            placeholder="Front row was insane! 🎢"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
          />

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }, submitting && { opacity: 0.5 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>🦈 Log This Ride!</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: { color: colors.secondary, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', fontFamily: 'Shark' },
  // Park selection
  parkList: { padding: 16 },
  parkGroup: { marginBottom: 20 },
  parkGroupLabel: { color: colors.tertiary, fontSize: 14, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  parkChip: {
    backgroundColor: colors.bgMedium,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  parkChipSelected: { borderColor: colors.secondary, backgroundColor: 'rgba(0,165,245,0.15)' },
  parkChipText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  parkChipTextSelected: { color: colors.secondary },
  // Ride selection
  searchBox: { paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: {
    backgroundColor: colors.bgMedium,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rideList: { paddingHorizontal: 16, paddingBottom: 40 },
  rideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgMedium,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  rideItemSelected: { borderColor: colors.tertiary, backgroundColor: 'rgba(254,201,14,0.1)' },
  rideItemText: { color: colors.textPrimary, fontSize: 15, flex: 1 },
  rideItemTextSelected: { color: colors.tertiary, fontWeight: '600' },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 15 },
  // Details
  detailsContainer: { padding: 20, paddingBottom: 60 },
  selectedRideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgLight,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  selectedRideName: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', flex: 1 },
  sectionLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600', marginBottom: 10, marginTop: 20 },
  ratingRow: { alignItems: 'center' },
  input: {
    backgroundColor: colors.bgMedium,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  submitBtn: {
    backgroundColor: colors.secondary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 30,
  },
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: '800', fontFamily: 'Shark' },
  // Success
  successOverlay: {
    flex: 1,
    backgroundColor: colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successEmoji: { fontSize: 80, textAlign: 'center' },
  successTitle: { color: colors.textPrimary, fontSize: 32, fontWeight: '800', fontFamily: 'Shark', textAlign: 'center', marginTop: 16 },
  successSubtitle: { color: colors.tertiary, fontSize: 20, fontWeight: '700', textAlign: 'center', marginTop: 8 },
});
