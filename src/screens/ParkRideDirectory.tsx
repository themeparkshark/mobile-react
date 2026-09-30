import CoinSocket from '../components/collection/CoinSocket';
import ShelfCoin from '../components/collection/ShelfCoin';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import TaskCoinModal from '../components/TaskCoinModal';
import GameIcon from '../ui/GameIcon';
import UnfoundCoinModal from '../components/UnfoundCoinModal';
import type { TaskType } from '../models/task-type';

interface Props {
  readonly rides: readonly TaskType[];
  readonly completed: readonly TaskType[];
  readonly isOwnPark?: boolean;
  readonly goalTaskId?: number | null;
  readonly nearbyRideId?: number | null;
  readonly nearbyRideReportedOpen?: boolean;
  readonly savedGoalReportedDown?: boolean;
  readonly rideTaskIds?: readonly number[];
  readonly rideOnly?: boolean;
  readonly onRideOnlyChange?: (rideOnly: boolean) => void;
  readonly onChooseGoal?: (taskId: number) => Promise<void>;
  readonly onShowOnMap?: (task: TaskType) => void;
  readonly onPlayInLine?: (task: TaskType) => void;
}

/**
 * Named, scannable companion to the shelf. Collapsed by default: it shows only
 * the one suggested coin (goal or nearest) and opens to the full searchable list.
 */
export default function ParkRideDirectory({ rides, completed, isOwnPark = true, goalTaskId, nearbyRideId,
  nearbyRideReportedOpen = false, savedGoalReportedDown = false, rideTaskIds, rideOnly = false,
  onRideOnlyChange, onChooseGoal, onShowOnMap, onPlayInLine }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const ownedIds = useMemo(() => new Set(completed.map(task => task.id)), [completed]);
  const rideIds = useMemo(() => new Set(rideTaskIds ?? []), [rideTaskIds]);
  const filtered = rideOnly && rideIds.size > 0 ? rides.filter(task => rideIds.has(task.id)) : rides;
  const ordered = useMemo(() => [...filtered].sort((a, b) => {
    const rank = (task: TaskType) => task.id === goalTaskId
      ? 0 : task.id === nearbyRideId && !ownedIds.has(task.id) ? 1 : ownedIds.has(task.id) ? 3 : 2;
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  }), [filtered, ownedIds, goalTaskId, nearbyRideId]);
  useEffect(() => { if (rideOnly) { setExpanded(true); setQuery(''); } }, [rideOnly]);
  if (!rides.length) return null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matching = normalizedQuery
    ? ordered.filter(task => task.name.toLocaleLowerCase().includes(normalizedQuery))
    : ordered;
  const suggested = ordered.filter(task => task.id === goalTaskId || (task.id === nearbyRideId && !ownedIds.has(task.id)));
  const visible = expanded ? matching : suggested.slice(0, 1);

  return <View style={styles.wrap}>
    <View style={styles.headingRow}>
      <Text style={styles.heading}>{rideOnly ? 'RIDE PASSPORT' : 'COIN GUIDE'}</Text>
      {rideOnly && <Text style={styles.count}>{filtered.filter(task => ownedIds.has(task.id)).length}/{filtered.length}</Text>}
    </View>
    {!!rideTaskIds?.length && onRideOnlyChange && <View style={styles.filterRow}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: !rideOnly }}
        onPress={() => { onRideOnlyChange(false); setQuery(''); }}
        style={[styles.filterButton, !rideOnly && styles.filterSelected]}>
        <Text style={[styles.filterText, !rideOnly && styles.filterTextSelected]}>ALL COINS</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: rideOnly }}
        onPress={() => { onRideOnlyChange(true); setQuery(''); }}
        style={[styles.filterButton, rideOnly && styles.filterSelected]}>
        <Text style={[styles.filterText, rideOnly && styles.filterTextSelected]}>RIDES</Text>
      </Pressable>
    </View>}
    {expanded && <TextInput
      value={query}
      onChangeText={setQuery}
      placeholder={rideOnly ? 'Find a ride' : 'Find a park coin'}
      placeholderTextColor="#5b8aa6"
      autoCorrect={false}
      returnKeyType="search"
      accessibilityLabel={rideOnly ? 'Search rides in this park' : 'Search park coins'}
      style={styles.search}
    />}
    {visible.map(task => {
      const owned = ownedIds.has(task.id);
      const goal = task.id === goalTaskId;
      const nearby = !owned && !goal && task.id === nearbyRideId;
      const row = <View style={[styles.row, (goal || nearby) && styles.goalRow]}>
        {owned
          ? <ShelfCoin coinUrl={task.coin_url} size={42}
              level={completed.find(coin => coin.id === task.id)?.coin_level ?? null} />
          : <CoinSocket size={42} coinUrl={task.coin_url} onLight goal={goal} />}
        <View style={styles.copy}>
          <Text style={styles.rideName} numberOfLines={2}>{task.name}</Text>
          <Text style={[styles.status, (goal || nearby) && styles.goalStatus]} numberOfLines={1}>{owned
            ? !isOwnPark ? 'IN THIS COLLECTION' : goal ? 'ON YOUR SHELF · MASTERY GOAL' : 'ON YOUR SHELF'
            : !isOwnPark ? 'NOT YET COLLECTED' : goal ? 'YOUR NEXT COIN' : nearby
              ? nearbyRideReportedOpen ? 'REPORTED OPEN NEARBY' : 'NEAREST COIN AREA'
              : 'READY TO DISCOVER'}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>;
      return <View key={task.id} style={styles.rowWrap}>
        {owned
          ? <TaskCoinModal task={task} trigger={row} readOnly={!isOwnPark}
              level={completed.find(coin => coin.id === task.id)?.coin_level ?? null}
              onPlayInLine={rideIds.has(task.id) && onPlayInLine ? () => onPlayInLine(task) : undefined}
              timesCompleted={completed.find(coin => coin.id === task.id)?.times_completed} />
          : <UnfoundCoinModal task={task} trigger={row}
              kind={rideIds.size > 0 ? rideIds.has(task.id) ? 'ride' : 'coin' : undefined}
              onChooseGoal={onChooseGoal ? () => onChooseGoal(task.id) : undefined}
              onPlayInLine={rideIds.has(task.id) && onPlayInLine ? () => onPlayInLine(task) : undefined}
              onShowOnMap={onShowOnMap ? () => onShowOnMap(task) : undefined} />}
      </View>;
    })}
    {expanded && visible.length === 0 && <Text style={styles.empty}>No coins match that name.</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
      accessibilityLabel={expanded ? 'Close the coin guide' : `Open the coin guide, ${filtered.length} coins`}
      onPress={() => { setExpanded(!expanded); setQuery(''); }}
      style={styles.toggle}>
      <GameIcon name={expanded ? 'close' : 'search'} size={22} />
      <Text style={styles.toggleText}>{expanded ? 'CLOSE COIN GUIDE' : `FIND A COIN (${filtered.length})`}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, backgroundColor: '#eaf9ff', borderColor: '#fff', borderWidth: 2,
    borderRadius: 15, padding: 10 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontFamily: 'Shark', color: '#075a99', fontSize: 20 },
  count: { fontFamily: 'Knockout', color: '#326f98', fontSize: 13 },
  filterRow: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: '#d5effc',
    borderRadius: 10, padding: 3, marginTop: 9, gap: 3 },
  filterButton: { borderRadius: 8, paddingHorizontal: 13, paddingVertical: 5 },
  filterSelected: { backgroundColor: '#087ac2' },
  filterText: { fontFamily: 'Knockout', color: '#07518a', fontSize: 14 },
  filterTextSelected: { color: '#fff' },
  intro: { fontFamily: 'Knockout', color: '#386783', fontSize: 13,
    lineHeight: 17, marginTop: 3, marginBottom: 8 },
  search: { backgroundColor: '#fff', borderColor: '#9bd7f5', borderWidth: 2,
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11,
    color: '#093e71', fontFamily: 'Knockout', fontSize: 16, marginBottom: 4 },
  rowWrap: { marginTop: 7 },
  row: { minHeight: 67, backgroundColor: '#fff', borderColor: '#c5eafb', borderWidth: 2,
    borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9,
    paddingVertical: 6, gap: 10 },
  goalRow: { borderColor: '#f8c536', backgroundColor: '#fff8de' },
  coin: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0e84ca',
    borderWidth: 2, borderColor: '#ffce45', alignItems: 'center', justifyContent: 'center' },
  ownedCoin: { backgroundColor: '#fff8d8' },
  coinArt: { width: 34, height: 34 },
  question: { fontFamily: 'Shark', color: '#fff', fontSize: 24 },
  copy: { flex: 1 },
  rideName: { fontFamily: 'Shark', color: '#093e71', fontSize: 16, lineHeight: 19 },
  status: { fontFamily: 'Knockout', color: '#4184a7', fontSize: 12, letterSpacing: 0.5,
    marginTop: 2 },
  goalStatus: { color: '#9c6800' },
  chevron: { fontFamily: 'Knockout', fontSize: 28, color: '#0869aa', lineHeight: 31 },
  empty: { fontFamily: 'Knockout', color: '#386783', fontSize: 15,
    textAlign: 'center', paddingVertical: 18 },
  toggle: { flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: '#ffcf3b',
    borderColor: '#ffffff', borderWidth: 2, borderBottomWidth: 4, borderBottomColor: '#d99a00',
    borderRadius: 12, alignItems: 'center', marginTop: 8, paddingVertical: 9 },
  toggleText: { fontFamily: 'Shark', color: '#05346e', fontSize: 16 },
});
