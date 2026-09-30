import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../design-system';
import { clearTripGoal, getTripGoal, setTripGoal, type TripGoalData } from '../../api/endpoints/me/trip-goal';
import getPrepItemSets, { type PrepItemSetListItem } from '../../api/endpoints/me/prep-item-sets';
import { LocationContext } from '../../context/LocationProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import HapticPatterns from '../../helpers/hapticPatterns';
import * as RootNavigation from '../../RootNavigation';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

interface Props {
  readonly refreshVersion: number;
  readonly loadGoal?: () => Promise<TripGoalData>;
  readonly saveGoal?: (taskId: number) => Promise<TripGoalData>;
  readonly removeGoal?: () => Promise<TripGoalData>;
  readonly loadCollections?: typeof getPrepItemSets;
}

/** A real, account-backed bridge from home finds to one chosen park coin. */
export default function TripGoalCard({ refreshVersion, loadGoal = getTripGoal,
  saveGoal = setTripGoal, removeGoal = clearTripGoal,
  loadCollections = getPrepItemSets }: Props) {
  const [data, setData] = useState<TripGoalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [open, setOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sets, setSets] = useState<PrepItemSetListItem[] | null>(null);
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const collectionVersion = useRef(0);
  const mutationBusy = useRef(false);
  const refreshPending = useRef(false);
  const retryAction = useRef<(() => void) | null>(null);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const reducedMotion = useReducedGameMotion();
  const { location } = useContext(LocationContext);
  const { playSound } = useContext(SoundEffectContext);
  const insets = useSafeAreaInsets();
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current++;
      collectionVersion.current++;
      pendingNavigation.current = null;
    };
  }, []);

  const loadSets = useCallback(async () => {
    const version = ++collectionVersion.current;
    try {
      const result = await loadCollections(locationRef.current);
      if (mounted.current && version === collectionVersion.current) setSets(result);
    } catch {
      if (mounted.current && version === collectionVersion.current) setSets(null);
    }
  }, [loadCollections]);

  const load = useCallback(async () => {
    if (mutationBusy.current) { refreshPending.current = true; return; }
    const version = ++requestVersion.current;
    try {
      const result = await loadGoal();
      if (!mounted.current || version !== requestVersion.current) return;
      setData(result);
      setStale(false);
      setError(null);
      retryAction.current = null;
    } catch {
      if (!mounted.current || version !== requestVersion.current) return;
      setStale(true);
      setError('Could not refresh your park goal. Try again when connected.');
      retryAction.current = () => void load();
    } finally {
      if (mounted.current && version === requestVersion.current) setLoading(false);
    }
  }, [loadGoal]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestVersion.current++; };
  }, [load]));
  useEffect(() => {
    if (open) void loadSets();
    return () => { collectionVersion.current++; };
  }, [open, loadSets]);
  useEffect(() => { if (refreshVersion > 0) void load(); }, [refreshVersion, load]);

  const choose = async (taskId: number) => {
    if (mutationBusy.current) return;
    mutationBusy.current = true;
    const version = ++requestVersion.current;
    setBusy(true);
    setError(null);
    try {
      const result = await saveGoal(taskId);
      if (!mounted.current || version !== requestVersion.current) return;
      setData(result);
      setStale(false);
      setOpen(false);
      retryAction.current = null;
      HapticPatterns.selection();
      void playSound?.(require('../../../assets/sounds/pin_swap_select_pin.mp3'));
    } catch {
      if (!mounted.current || version !== requestVersion.current) return;
      setError('Could not save this ride goal. Try again.');
      retryAction.current = () => void choose(taskId);
    } finally {
      mutationBusy.current = false;
      if (mounted.current) { setBusy(false); setLoading(false); }
      if (mounted.current && refreshPending.current) { refreshPending.current = false; void load(); }
    }
  };

  const clear = async () => {
    if (mutationBusy.current) return;
    mutationBusy.current = true;
    const version = ++requestVersion.current;
    setBusy(true);
    setError(null);
    try {
      const result = await removeGoal();
      if (!mounted.current || version !== requestVersion.current) return;
      setData(result);
      setStale(false);
      retryAction.current = null;
    } catch {
      if (!mounted.current || version !== requestVersion.current) return;
      setError('Could not clear this ride goal. Try again.');
      retryAction.current = () => void clear();
    } finally {
      mutationBusy.current = false;
      if (mounted.current) { setBusy(false); setLoading(false); }
      if (mounted.current && refreshPending.current) { refreshPending.current = false; void load(); }
    }
  };

  const goal = data?.goal;
  const plan = data?.goal_plan;
  const wallet = data?.wallet;
  const parkIds = Array.from(new Set(data?.rides.map(ride => ride.park_id) ?? []));
  const ticketShortfall = goal && !goal.coin_owned ? wallet?.tickets_needed ?? 0 : 0;
  const energyShortfall = plan?.maxed ? 0 : plan?.energy_needed ?? 0;
  const collectionHelpsGoal = ticketShortfall > 0 || energyShortfall > 0;
  const upgradeReady = !!(goal?.coin_owned && plan && !plan.maxed &&
    plan.parts_needed === 0 && plan.energy_needed === 0);
  const usefulReward = (set: PrepItemSetListItem) => {
    const reward = set.starter_milestone && !set.starter_milestone.rewards_claimed
      ? set.starter_milestone.rewards : !set.rewards_claimed ? set.completion_rewards : null;
    return reward ? Math.min(ticketShortfall, reward.tickets) * 100 + Math.min(energyShortfall, reward.energy) : 0;
  };
  const suggestedSet = sets?.filter(set => (set.is_in_rotation !== false ||
    (set.is_complete && !set.rewards_claimed) ||
    !!(set.starter_milestone?.is_unlocked && !set.starter_milestone.rewards_claimed)) &&
    (!set.is_complete || !set.rewards_claimed ||
    !!(set.starter_milestone && !set.starter_milestone.rewards_claimed)))
    .sort((a, b) => {
      const score = (set: PrepItemSetListItem) => usefulReward(set) +
        (set.starter_milestone?.is_unlocked && !set.starter_milestone.rewards_claimed ? 80 : 0) +
        (set.is_complete && !set.rewards_claimed ? 60 : 0) +
        (set.time_gate?.is_spawning_now === false ? -50 : 0) + set.progress_percentage / 10;
      return score(b) - score(a);
    })[0];
  const starter = suggestedSet?.starter_milestone;
  const rewardReady = !!((starter?.is_unlocked && !starter.rewards_claimed) ||
    (suggestedSet?.is_complete && !suggestedSet.rewards_claimed));

  const close = () => { pendingNavigation.current = null; setOpen(false); };
  const goAfterClose = (navigate: () => void) => {
    if (pendingNavigation.current) return;
    pendingNavigation.current = navigate;
    setOpen(false);
  };

  return <>
    <Pressable style={styles.pill} accessibilityRole="button"
      disabled={busy} accessibilityState={{ disabled: busy, busy }}
      accessibilityLabel={goal ? `Next park goal: ${goal.ride_name}. Open ride choices.` : 'Choose your next park ride coin'}
      onPress={() => { setPickerMode(!goal); setOpen(true); if (stale) void load(); }}>
      <Image source={require('../../../assets/images/coingold.png')} style={styles.pillCoin} contentFit="contain" />
      <Text style={styles.pillTitle} numberOfLines={1}>
        {busy ? 'Saving your goal…' : loading && !data ? 'Loading park goal…' : goal ? goal.ride_name
          : data?.goal_unavailable ? 'Choose a new ride' : data ? 'Choose a park goal' : 'Park goals unavailable'}
      </Text>
      <Text style={styles.pillDetail} numberOfLines={1}>
        {goal && wallet ? plan?.maxed ? 'PARK GOAL · MAX LEVEL'
          : upgradeReady ? 'PARK GOAL · UPGRADE READY'
          : goal.coin_owned && plan ? plan.parts_needed
            ? `LV ${plan.current_level} · ${plan.parts_needed} ${plan.parts_needed === 1 ? 'PART' : 'PARTS'} TO GO`
            : `LV ${plan.current_level} · ${plan.energy_needed} ENERGY TO GO`
          : wallet.tickets_needed > 0 ? `PARK GOAL · ${wallet.tickets_needed} ${wallet.tickets_needed === 1 ? 'TICKET' : 'TICKETS'} TO GO`
          : 'PARK GOAL · TICKET READY'
          : data ? 'PICK YOUR NEXT RIDE COIN' : 'TAP TO RETRY'}
      </Text>
    </Pressable>

    <Modal isVisible={open} propagateSwipe onBackdropPress={close} onBackButtonPress={close}
      animationIn={reducedMotion ? 'fadeIn' : 'slideInUp'} animationOut={reducedMotion ? 'fadeOut' : 'slideOutDown'}
      animationInTiming={reducedMotion ? 0 : 240} animationOutTiming={reducedMotion ? 0 : 180}
      onModalHide={() => {
        const navigate = pendingNavigation.current;
        pendingNavigation.current = null;
        if (mounted.current) navigate?.();
      }}
      style={[styles.modalWrap, { marginTop: insets.top + spacing.sm, marginBottom: insets.bottom + spacing.sm }]}>
      <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
        <LinearGradient colors={['#149de7', '#0873c3', '#064787']} style={styles.header}>
          <Text style={styles.heroEyebrow}>THE SHARK TRIP PLANNER  ✦</Text>
          <Text style={styles.heading}>{pickerMode || !goal ? 'CHOOSE YOUR NEXT RIDE'
            : goal.coin_owned ? 'MASTER YOUR COIN' : 'YOUR RIDE GOAL'}</Text>
          <Text style={styles.heroHint}>{pickerMode || !goal
            ? 'Pick a coin to chase. Every home find helps prepare your park day.'
            : goal.coin_owned ? 'Ride Parts + home Energy make your favorite coin shine.'
            : `${goal.ride_name} is waiting at ${goal.park_name}.`}</Text>
          <Image source={require('../../../assets/images/screens/pin-collections/shark.png')}
            style={styles.headerShark} contentFit="contain" accessibilityLabel="Theme Park Shark mascot" />
          <Pressable accessibilityRole="button" accessibilityLabel="Close ride goal planner"
            style={styles.closeButton} onPress={close}>
            <Text style={styles.close}>×</Text>
          </Pressable>
        </LinearGradient>
        <View style={styles.body}>
        {wallet && <View style={styles.resources}>
          <View style={styles.resourceRow}>
            <View style={styles.resource}>
              <Image source={require('../../../assets/images/ticket-icon.png')}
                style={styles.resourceIcon} contentFit="contain" />
              <Text style={styles.resourceCount}>{wallet.tickets}</Text>
              <Text style={styles.resourceName}>TICKETS</Text>
            </View>
            <View style={styles.resourceDivider} />
            <View style={styles.resource}>
              <Image source={require('../../../assets/images/energy.png')}
                style={styles.resourceIcon} contentFit="contain" />
              <Text style={styles.resourceCount}>{wallet.energy}</Text>
              <Text style={styles.resourceName}>ENERGY</Text>
            </View>
          </View>
          <Text style={styles.resourceHint}>{goal?.coin_owned
            ? plan?.maxed ? 'This coin is at its current max. Choose another ride to keep collecting.'
              : plan?.energy_needed ? `${plan.energy_needed} Energy to find at home for your next upgrade`
              : upgradeReady ? 'Your next coin upgrade is ready.'
              : 'Energy is ready; collect the remaining Ride Parts.'
            : wallet.tickets_needed > 0
              ? `${wallet.tickets_needed} more ${wallet.tickets_needed === 1 ? 'Ticket' : 'Tickets'} for a ride attempt`
              : 'You have enough Tickets for one ride attempt'}</Text>
        </View>}
        {goal && !pickerMode && <Pressable accessibilityRole="button" style={styles.changeRide}
          onPress={() => setPickerMode(true)}>
          <Image source={require('../../../assets/images/coingold.png')}
            style={styles.changeRideIcon} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.changeRideLabel}>YOUR PINNED RIDE</Text>
            <Text style={styles.changeRideName} numberOfLines={1}>{goal.ride_name}</Text>
          </View>
          <Text style={styles.changeRideArrow}>CHANGE ›</Text>
        </Pressable>}
        {goal && plan && !pickerMode && <Pressable style={styles.levelPlan} disabled={!upgradeReady || busy}
          accessibilityRole={upgradeReady ? 'button' : undefined}
          accessibilityState={upgradeReady ? { disabled: busy } : undefined}
          onPress={() => goAfterClose(() => RootNavigation.navigate('CoinShelf', {
            focusCoin: { assetId: goal.asset_id },
          }))}>
          <Text style={styles.planEyebrow}>✦  {goal.coin_owned ? 'COIN MASTERY' : 'FIRST UPGRADE PLAN'}</Text>
          <Text style={styles.planTitle}>{plan.maxed ? 'Current max level reached'
            : goal.coin_owned ? `Level ${plan.current_level} → ${plan.next_level}`
            : 'Your first level-up'}</Text>
          <Text style={styles.planHint}>{plan.maxed
            ? 'This coin has reached its current maximum level. Choose another ride to keep collecting.'
            : goal.coin_owned
              ? `${plan.parts_needed === 0 ? 'Ride Parts ready' : `${plan.parts_needed} ${plan.parts_needed === 1 ? 'Ride Part' : 'Ride Parts'} to collect`} · ${plan.energy_needed === 0 ? 'Energy ready' : `${plan.energy_needed} Energy to find at home`}`
              : `${plan.energy_needed === 0 ? 'Energy ready for your first upgrade' : `${plan.energy_needed} Energy to find at home for your first upgrade`}. Earn the coin and its Ride Parts at the park.`}</Text>
          {upgradeReady && <Text style={styles.huntAction}>Upgrade on Coin Shelf →</Text>}
        </Pressable>}
        {goal && suggestedSet && !pickerMode && <Pressable accessibilityRole="button" style={styles.hunt}
          disabled={busy} accessibilityState={{ disabled: busy }}
          onPress={() => goAfterClose(() => RootNavigation.navigate('SetCollection', { slug: suggestedSet.slug }))}>
          <Text style={styles.huntTitle}>{rewardReady ? '🎁 HOME REWARD READY'
            : collectionHelpsGoal ? '🗺️ HOME PREP FOR THIS GOAL' : '🗺️ HOME COLLECTION'}</Text>
          <Text style={styles.huntName}>{suggestedSet.name}</Text>
          <Text style={styles.huntHint}>{rewardReady
            ? 'Open this set to claim your earned trip prep reward.'
            : starter && !starter.rewards_claimed
              ? `${starter.collected}/${starter.target} unique finds toward a shark item and ${starter.rewards.tickets} ${starter.rewards.tickets === 1 ? 'Ticket' : 'Tickets'} · ${starter.rewards.energy} Energy`
              : `${suggestedSet.collected_count}/${suggestedSet.total_items} found · ${suggestedSet.completion_rewards.tickets} Tickets and ${suggestedSet.completion_rewards.energy} Energy on completion`}</Text>
          <Text style={styles.huntAction}>View collection →</Text>
        </Pressable>}
        {busy && <View style={styles.saving} accessibilityLiveRegion="polite">
          <ActivityIndicator color="#075b9b" />
          <Text style={styles.savingText}>Saving your park goal…</Text>
        </View>}
        {error && <Pressable disabled={busy} onPress={() => retryAction.current?.()} accessibilityRole="button"
          accessibilityLabel={`${error} Retry`} style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text><Text style={styles.retry}>RETRY ›</Text>
        </Pressable>}
        {loading && !data ? <ActivityIndicator color={colors.tertiary} style={styles.spinner} /> : (pickerMode || !goal) &&
          <View style={styles.list}>
            <Text style={styles.listTitle}>{goal ? 'CHOOSE ANOTHER RIDE' : 'CHOOSE YOUR FIRST RIDE'}</Text>
            <Text style={styles.listHint}>Pin one coin to your map. You can change it anytime.</Text>
            {parkIds.map(parkId => {
              const rides = data!.rides.filter(ride => ride.park_id === parkId);
              return <View key={parkId}>
                <View style={styles.parkHeader}><Text style={styles.parkName}>{rides[0].park_name.toUpperCase()}</Text>
                  <Text style={styles.parkCount}>{rides.length} {rides.length === 1 ? 'COIN' : 'COINS'}</Text></View>
                {rides.map(ride => <Pressable key={ride.task_id} accessibilityRole="button"
                  disabled={busy} onPress={() => void choose(ride.task_id)}
                  accessibilityLabel={`${ride.ride_name}. ${goal?.task_id === ride.task_id ? 'Current goal' : ride.coin_owned ? 'Collected coin' : 'Uncollected coin'}. Choose as park goal.`}
                  accessibilityState={{ disabled: busy, selected: goal?.task_id === ride.task_id }}
                  style={[styles.ride, goal?.task_id === ride.task_id && styles.selected]}>
                  {ride.coin_url
                    ? <Image source={{ uri: ride.coin_url }} style={styles.coin} contentFit="contain"
                        placeholder={require('../../../assets/images/coingold.png')} />
                    : <Image source={require('../../../assets/images/coingold.png')}
                        style={styles.coin} contentFit="contain" />}
                  <View style={styles.rideCopy}>
                    <Text style={styles.rideName} numberOfLines={2}>{ride.ride_name}</Text>
                    <Text style={styles.rideStatus}>{goal?.task_id === ride.task_id ? 'YOUR CURRENT GOAL'
                      : ride.coin_owned ? ride.coin_level ? `OWNED · LEVEL ${ride.coin_level}` : 'OWNED'
                      : 'MISSING FROM YOUR SHELF'}</Text>
                  </View>
                  <Text style={styles.check}>{goal?.task_id === ride.task_id ? '✓' : '›'}</Text>
                </Pressable>)}
              </View>;
            })}
            {data && data.rides.length === 0 && <Text style={styles.empty}>No available ride coins yet. Check back when a park is ready.</Text>}
            {goal && <Pressable disabled={busy} onPress={() => void clear()} accessibilityRole="button">
              <Text style={styles.clear}>Clear this goal</Text>
            </Pressable>}
          </View>}
        </View>
      </ScrollView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  pill: { position: 'absolute', bottom: 150, alignSelf: 'center', width: 225, zIndex: 10,
    paddingHorizontal: spacing.md, paddingVertical: 6, paddingRight: 43, borderRadius: 14,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#0879ca',
    shadowColor: '#003c7a', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 4, elevation: 5 },
  pillCoin: { width: 32, height: 32, position: 'absolute', right: 5, top: 7 },
  pillTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 15 },
  pillDetail: { color: '#ffe06c', fontFamily: 'Knockout', fontSize: 10, marginTop: 1 },
  modalWrap: { marginHorizontal: 15 },
  modal: { maxHeight: '85%', borderRadius: 22, backgroundColor: '#e7f7ff',
    borderWidth: 3, borderColor: '#fff', overflow: 'hidden',
    shadowColor: '#001e43', shadowOpacity: 0.36, shadowRadius: 16, elevation: 12 },
  modalContent: { paddingBottom: spacing.md },
  header: { minHeight: 166, padding: 18, paddingRight: 122, overflow: 'hidden',
    borderBottomWidth: 5, borderBottomColor: '#ffcc32' },
  headerShark: { width: 158, height: 158, position: 'absolute', right: -12, bottom: -18 },
  heroEyebrow: { color: '#ffdc6d', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1 },
  heading: { color: '#fff', fontFamily: 'Shark', fontSize: 26, lineHeight: 31, marginTop: 8,
    textShadowColor: '#053b75', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  heroHint: { color: '#dbf5ff', fontFamily: 'Knockout', fontSize: 13, lineHeight: 17, marginTop: 8 },
  closeButton: { position: 'absolute', top: 8, right: 8, width: 44, height: 44,
    borderWidth: 2, borderColor: '#ffce3d', borderRadius: 22, backgroundColor: '#065599',
    alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  close: { color: '#fff', fontFamily: 'Knockout', fontSize: 26, lineHeight: 29 },
  body: { paddingHorizontal: 15, paddingTop: 15 },
  resources: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 2, borderColor: '#9ed7f3',
    paddingHorizontal: 13, paddingTop: 10, paddingBottom: 11 },
  resourceRow: { flexDirection: 'row', alignItems: 'center' },
  resource: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  resourceIcon: { width: 32, height: 32 },
  resourceCount: { color: '#083e76', fontFamily: 'Shark', fontSize: 25 },
  resourceName: { color: '#0b64a5', fontFamily: 'Knockout', fontSize: 12, marginTop: 4 },
  resourceDivider: { height: 30, width: 1, backgroundColor: '#b9dff1', marginHorizontal: 8 },
  resourceHint: { color: '#1d577e', fontFamily: 'Knockout', fontSize: 13, marginTop: 8 },
  changeRide: { flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: '#fff3c5', borderRadius: 15, borderWidth: 2,
    borderColor: '#f9c53d', padding: 9, marginTop: 12 },
  changeRideIcon: { width: 38, height: 38 },
  changeRideLabel: { color: '#916000', fontFamily: 'Knockout', fontSize: 11, letterSpacing: 0.5 },
  changeRideName: { color: '#073e79', fontFamily: 'Shark', fontSize: 17, marginTop: 2 },
  changeRideArrow: { color: '#056db4', fontFamily: 'Knockout', fontSize: 13 },
  levelPlan: { backgroundColor: '#fff9e4', borderRadius: 15, borderWidth: 2,
    borderColor: '#ffca30', padding: 13, marginTop: 12 },
  planEyebrow: { color: '#a66b00', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.7 },
  planTitle: { color: '#073e79', fontFamily: 'Shark', fontSize: 18, marginTop: 3 },
  planHint: { color: '#315b7b', fontFamily: 'Knockout', fontSize: 13, lineHeight: 17, marginTop: 4 },
  hunt: { backgroundColor: '#fff', borderRadius: 15, borderWidth: 2,
    borderColor: '#ffca30', padding: 13, marginTop: 12 },
  huntTitle: { color: '#9c6400', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 0.6 },
  huntName: { color: '#073e79', fontFamily: 'Shark', fontSize: 18, marginTop: 4 },
  huntHint: { color: '#315b7b', fontFamily: 'Knockout', fontSize: 13, lineHeight: 17, marginTop: 4 },
  huntAction: { color: '#006db8', fontFamily: 'Knockout', fontSize: 15, marginTop: 7 },
  saving: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12,
    marginTop: 12, borderRadius: 12, backgroundColor: '#d2ecff' },
  savingText: { color: '#075b9b', fontFamily: 'Knockout', fontSize: 16 },
  errorCard: { backgroundColor: '#fff4e6', borderWidth: 2, borderColor: '#e4b176',
    borderRadius: 13, padding: 12, marginTop: 12 },
  error: { color: '#733a1c', fontFamily: 'Knockout', fontSize: 15, lineHeight: 20 },
  retry: { color: '#075b9b', fontFamily: 'Knockout', fontSize: 16, marginTop: 5 },
  spinner: { marginVertical: spacing.lg },
  list: { paddingTop: 18, paddingBottom: spacing.sm },
  listTitle: { color: '#064a82', fontFamily: 'Shark', fontSize: 21 },
  listHint: { color: '#376381', fontFamily: 'Knockout', fontSize: 13, marginTop: 3, marginBottom: 12 },
  parkHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, marginBottom: 7 },
  parkName: { color: '#0872b7', fontFamily: 'Knockout', fontSize: 16 },
  parkCount: { color: '#8b6011', fontFamily: 'Knockout', fontSize: 11 },
  ride: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', gap: 10,
    borderRadius: 15, paddingVertical: 10, paddingHorizontal: 10, marginBottom: 8,
    borderWidth: 2, borderColor: '#acd8f1' },
  selected: { borderColor: '#ffbb1f', backgroundColor: '#fff8dd' },
  coin: { width: 47, height: 47 },
  rideCopy: { flex: 1 },
  rideName: { color: '#113e70', fontFamily: 'Shark', fontSize: 16, lineHeight: 21 },
  rideStatus: { color: '#5982a1', fontFamily: 'Knockout', fontSize: 11, marginTop: 2,
    letterSpacing: 0.3 },
  check: { color: '#006db8', fontFamily: 'Shark', fontSize: 25, marginHorizontal: 2 },
  empty: { color: '#315b7b', fontSize: 14 },
  clear: { color: '#315b7b', fontSize: 13, textAlign: 'center', padding: spacing.md },
});
