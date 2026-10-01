import CoinSocket from '../components/collection/CoinSocket';
import ShelfCoin from '../components/collection/ShelfCoin';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import TaskCoinModal from '../components/TaskCoinModal';
import GameIcon from '../ui/GameIcon';
import UnfoundCoinModal from '../components/UnfoundCoinModal';
import type { RideType } from '../api/endpoints/rides';
import type { TaskType } from '../models/task-type';
import { buildCoinGuide, type CoinGuideRow } from '../services/collection/coinGuide';
import { limitedLabel, outOfRotation } from '../services/collection/limitedCoins';

interface Props {
  /** Permanent coins; the Ride Passport count covers these only. */
  readonly rides: readonly TaskType[];
  /** Every limited coin, in rotation or not (Coin Map 2.0). */
  readonly limited?: readonly TaskType[];
  /** The park's ride catalog: rides without a coin get a Line Play row. */
  readonly catalogRides?: readonly RideType[];
  readonly parkId?: number;
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
  readonly onPlayRideInLine?: (ride: RideType) => void;
}

/**
 * Named, scannable companion to the shelf. Collapsed by default: it shows only
 * the one suggested coin (goal or nearest) and opens to the full searchable
 * list: every coin, limited coins with their rotation, and every cataloged ride
 * without a coin as a Line Play row, so no ride is a dead end.
 */
export default function ParkRideDirectory({ rides, limited = [], catalogRides = [], parkId, completed, isOwnPark = true,
  goalTaskId, nearbyRideId, nearbyRideReportedOpen = false, savedGoalReportedDown = false, rideTaskIds, rideOnly = false,
  onRideOnlyChange, onChooseGoal, onShowOnMap, onPlayInLine, onPlayRideInLine }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const ownedIds = useMemo(() => new Set(completed.map(task => task.id)), [completed]);
  const rideIds = useMemo(() => new Set(rideTaskIds ?? []), [rideTaskIds]);
  const filtered = useMemo(() => rideOnly && rideIds.size > 0 ? rides.filter(task => rideIds.has(task.id)) : rides,
    [rides, rideOnly, rideIds]);
  // Match rides against every coin, so a ride whose coin is not a passport ride
  // never turns into a Line Play row in the RIDES view.
  const rows = useMemo(() => {
    const all = buildCoinGuide({ parkId: parkId ?? 0, coins: [...rides, ...limited], rides: parkId ? catalogRides : [] });
    const shown = new Set([...filtered, ...limited].map(task => task.id));
    return all.filter(row => row.kind === 'line' || shown.has(row.task.id));
  }, [rides, filtered, limited, catalogRides, parkId]);
  const ordered = useMemo(() => [...rows].sort((a, b) => {
    // Goal, nearest, coins to find, owned coins, limited coins out of rotation, then Line Play rides.
    const rank = (row: CoinGuideRow) => row.kind === 'line' ? 5 : row.task.id === goalTaskId
      ? 0 : row.task.id === nearbyRideId && !ownedIds.has(row.task.id) ? 1 : ownedIds.has(row.task.id) ? 3
      : outOfRotation(row.task) ? 4 : 2;
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  }), [rows, ownedIds, goalTaskId, nearbyRideId]);
  useEffect(() => { if (rideOnly) { setExpanded(true); setQuery(''); } }, [rideOnly]);
  if (!rows.length) return null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matching = normalizedQuery
    ? ordered.filter(row => row.search.includes(normalizedQuery))
    : ordered;
  const suggested = ordered.filter(row => row.kind === 'coin' &&
    (row.task.id === goalTaskId || (row.task.id === nearbyRideId && !ownedIds.has(row.task.id))));
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
      placeholder={rideOnly ? 'Find a ride' : 'Find a ride or coin'}
      placeholderTextColor="#5b8aa6"
      autoCorrect={false}
      returnKeyType="search"
      accessibilityLabel={rideOnly ? 'Search rides in this park' : 'Search rides and coins in this park'}
      style={styles.search}
    />}
    {visible.map(guideRow => {
      if (guideRow.kind === 'line') {
        const ride = guideRow.ride;
        return <View key={guideRow.key} style={styles.rowWrap}>
          <Pressable disabled={!onPlayRideInLine} onPress={() => onPlayRideInLine?.(ride)}
            accessibilityRole={onPlayRideInLine ? 'button' : undefined}
            accessibilityLabel={`${ride.name}. Line Play, no coin at this ride.${onPlayRideInLine ? ' Play in line.' : ''}`}
            style={styles.row}>
            <View style={styles.coin}><GameIcon name="queue" size={24} /></View>
            <View style={styles.copy}>
              <Text style={styles.rideName} numberOfLines={2}>{ride.name}</Text>
              <Text style={styles.status} numberOfLines={1}>LINE PLAY · GAMES WHILE YOU WAIT</Text>
            </View>
            {onPlayRideInLine && <View style={styles.playChip}><Text style={styles.playChipText}>PLAY IN LINE</Text></View>}
          </Pressable>
        </View>;
      }
      const task = guideRow.task;
      const owned = ownedIds.has(task.id);
      const goal = task.id === goalTaskId;
      const nearby = !owned && !goal && task.id === nearbyRideId;
      const badge = limitedLabel(task.limited);
      const resting = !owned && outOfRotation(task);
      const row = <View style={[styles.row, (goal || nearby) && styles.goalRow]}>
        {owned
          ? <ShelfCoin coinUrl={task.coin_url} size={42}
              level={completed.find(coin => coin.id === task.id)?.coin_level ?? null} />
          : <CoinSocket size={42} coinUrl={task.coin_url} onLight goal={goal} />}
        <View style={styles.copy}>
          <Text style={styles.rideName} numberOfLines={2}>{task.name}</Text>
          {badge && <View style={styles.limitedBadge}>
            <Text style={styles.limitedText} numberOfLines={1}>{badge.toUpperCase()}</Text>
          </View>}
          <Text style={[styles.status, (goal || nearby) && styles.goalStatus]} numberOfLines={1}>{owned
            ? !isOwnPark ? 'IN THIS COLLECTION' : goal ? 'ON YOUR SHELF · MASTERY GOAL' : 'ON YOUR SHELF'
            : !isOwnPark ? 'NOT YET COLLECTED' : resting ? 'NOT IN PLAY RIGHT NOW' : goal ? 'YOUR NEXT COIN' : nearby
              ? nearbyRideReportedOpen ? 'REPORTED OPEN NEARBY' : 'NEAREST COIN AREA'
              : 'READY TO DISCOVER'}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>;
      return <View key={guideRow.key} style={styles.rowWrap}>
        {owned
          ? <TaskCoinModal task={task} trigger={row} readOnly={!isOwnPark}
              level={completed.find(coin => coin.id === task.id)?.coin_level ?? null}
              onPlayInLine={rideIds.has(task.id) && onPlayInLine ? () => onPlayInLine(task) : undefined}
              timesCompleted={completed.find(coin => coin.id === task.id)?.times_completed} />
          : <UnfoundCoinModal task={task} trigger={row} limited={task.limited}
              kind={rideIds.size > 0 ? rideIds.has(task.id) ? 'ride' : 'coin' : undefined}
              onChooseGoal={onChooseGoal && !resting ? () => onChooseGoal(task.id) : undefined}
              onPlayInLine={rideIds.has(task.id) && onPlayInLine && !resting ? () => onPlayInLine(task) : undefined}
              onShowOnMap={onShowOnMap && !resting ? () => onShowOnMap(task) : undefined} />}
      </View>;
    })}
    {expanded && visible.length === 0 && <Text style={styles.empty}>No rides or coins match that name.</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
      accessibilityLabel={expanded ? 'Close the coin guide' : `Open the coin guide, ${rows.length} rides and coins`}
      onPress={() => { setExpanded(!expanded); setQuery(''); }}
      style={styles.toggle}>
      <GameIcon name={expanded ? 'close' : 'search'} size={22} />
      <Text style={styles.toggleText}>{expanded ? 'CLOSE COIN GUIDE' : `FIND A RIDE OR COIN (${rows.length})`}</Text>
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
  // Limited badge: the header's gold goal palette, so it reads as part of the same set.
  limitedBadge: { alignSelf: 'flex-start', backgroundColor: '#fff4cc', borderColor: '#ffcf3b', borderWidth: 1.5,
    borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1, marginTop: 3 },
  limitedText: { fontFamily: 'Knockout', color: '#8a5a00', fontSize: 11, letterSpacing: 0.5 },
  playChip: { backgroundColor: '#ffcf3b', borderColor: '#ffffff', borderWidth: 2, borderBottomWidth: 3,
    borderBottomColor: '#d99a00', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  playChipText: { fontFamily: 'Shark', color: '#05346e', fontSize: 13 },
  chevron: { fontFamily: 'Knockout', fontSize: 28, color: '#0869aa', lineHeight: 31 },
  empty: { fontFamily: 'Knockout', color: '#386783', fontSize: 15,
    textAlign: 'center', paddingVertical: 18 },
  toggle: { flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: '#ffcf3b',
    borderColor: '#ffffff', borderWidth: 2, borderBottomWidth: 4, borderBottomColor: '#d99a00',
    borderRadius: 12, alignItems: 'center', marginTop: 8, paddingVertical: 9 },
  toggleText: { fontFamily: 'Shark', color: '#05346e', fontSize: 16 },
});
