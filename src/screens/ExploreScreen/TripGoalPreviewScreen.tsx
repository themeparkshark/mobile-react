import { useCallback, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import PreviewMap from '../../dev/PreviewMap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../../design-system';
import type { TripGoalData } from '../../api/endpoints/me/trip-goal';
import type { PrepItemSetListItem } from '../../api/endpoints/me/prep-item-sets';
import TripGoalCard from './TripGoalCard';

const TICKET_ICON = require('../../../assets/images/ticket-icon.png');

const starter: TripGoalData = {
  rides: [
    { task_id: 1, asset_id: 1, park_id: 1, park_name: 'Magic Kingdom', ride_name: 'Space Mountain', coin_url: '', coin_owned: false, coin_level: null },
    { task_id: 2, asset_id: 2, park_id: 1, park_name: 'Magic Kingdom', ride_name: 'Pirates of the Caribbean', coin_url: '', coin_owned: false, coin_level: null },
    { task_id: 3, asset_id: 3, park_id: 2, park_name: 'EPCOT', ride_name: 'Spaceship Earth', coin_url: '', coin_owned: false, coin_level: null },
  ],
  goal: null,
  goal_unavailable: false,
  goal_plan: null,
  wallet: { tickets: 0, energy: 18, ticket_cost: 1, tickets_needed: 1 },
};

const previewSets: PrepItemSetListItem[] = [{
  id: 1, slug: 'churro_collection', name: 'Churro Collection',
  description: 'Find churros near home', icon_url: null, theme: 'churro',
  is_focused: false,
  theme_config: { label: 'Churros', color: '#F4CD72' }, rarity: 'common',
  time_gate: null, weather_gate: null, total_items: 40, collected_count: 3,
  progress_percentage: 7.5, is_complete: false, spare_count: 0,
  exchange_cost: 5, rewards_claimed: false,
  starter_milestone: { target: 5, collected: 3, is_unlocked: false,
    rewards_claimed: false, rewards: { energy: 10, tickets: 1, experience: 20 },
    wearable_choices: [] },
  completion_rewards: { energy: 50, tickets: 2, experience: 100,
    title: 'Churro Hunter', badge_url: null },
}];

/** Development-only visual QA using the real card with in-memory responses. */
export default function TripGoalPreviewScreen() {
  const state = useRef<TripGoalData>(starter);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const loadGoal = useCallback(async () => state.current, []);
  const loadCollections = useCallback(async () => previewSets, []);
  const saveGoal = useCallback(async (taskId: number) => {
    const ride = state.current.rides.find(item => item.task_id === taskId);
    if (!ride) throw new Error('Missing preview ride');
    state.current = { ...state.current, goal: ride, goal_plan: ride.coin_owned
      ? { current_level: 1, max_level: 5, next_level: 2, energy_cost: 10,
          energy_needed: 0, parts_cost: 2, parts_owned: 0, parts_needed: 2, maxed: false }
      : { current_level: null, max_level: 5, next_level: 2, energy_cost: 10,
          energy_needed: 0, parts_cost: null, parts_owned: 0, parts_needed: null, maxed: false } };
    return state.current;
  }, []);
  const removeGoal = useCallback(async () => {
    state.current = { ...state.current, goal: null, goal_plan: null };
    return state.current;
  }, []);
  const addTicket = () => {
    const tickets = state.current.wallet.tickets + 1;
    state.current = { ...state.current, wallet: { ...state.current.wallet,
      tickets, tickets_needed: Math.max(0, state.current.wallet.ticket_cost - tickets) } };
    setRefreshVersion(value => value + 1);
  };
  const collectCoin = () => {
    const goal = state.current.goal;
    if (!goal) return;
    if (goal.coin_owned) {
      state.current = { ...state.current,
        goal_plan: state.current.goal_plan ? { ...state.current.goal_plan,
          parts_owned: 2, parts_needed: 0 } : null };
      setRefreshVersion(value => value + 1);
      return;
    }
    const owned = { ...goal, coin_owned: true, coin_level: 1 };
    state.current = { ...state.current, goal: owned,
      rides: state.current.rides.map(ride => ride.task_id === goal.task_id ? owned : ride),
      goal_plan: { current_level: 1, max_level: 5, next_level: 2,
        energy_cost: 10, energy_needed: 0, parts_cost: 2, parts_owned: 1,
        parts_needed: 1, maxed: false } };
    setRefreshVersion(value => value + 1);
  };

  return <SafeAreaView style={styles.root}>
    <View style={styles.toolbar}>
      <Text style={styles.title}>HOME GOAL PREVIEW</Text>
      <Pressable accessibilityRole="button" onPress={addTicket}><Text style={styles.action}>Add Ticket</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={collectCoin}><Text style={styles.action}>
        {state.current.goal?.coin_owned ? 'Earn Parts' : 'Collect coin'}
      </Text></Pressable>
    </View>
    <View style={styles.scene}>
      <PreviewMap style={StyleSheet.absoluteFill} initialRegion={{
        latitude: 28.4194, longitude: -81.5812,
        latitudeDelta: 0.015, longitudeDelta: 0.015,
      }} />
      <TripGoalCard refreshVersion={refreshVersion} loadGoal={loadGoal}
        saveGoal={saveGoal} removeGoal={removeGoal} loadCollections={loadCollections} />
      <View style={styles.ticketGuarantee}><Image source={TICKET_ICON} style={styles.ticketIcon} /><Text style={styles.ticketText}>Park Ticket guaranteed within {Math.max(1, 2 - refreshVersion)} {refreshVersion > 0 ? 'pickup' : 'pickups'}</Text></View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a74c8' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, backgroundColor: '#0a74c8' },
  title: { color: '#fff', fontFamily: 'Knockout', fontSize: 16 },
  action: { color: '#ffdf48', fontFamily: 'Knockout', fontSize: 16 },
  scene: { flex: 1 },
  ticketGuarantee: { position: 'absolute', bottom: 35, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0879ca', borderWidth: 2, borderColor: '#fff', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 9 },
  ticketIcon: { width: 26, height: 26, resizeMode: 'contain' },
  ticketText: { color: '#fff', fontSize: 15, fontFamily: 'Knockout' },
});
