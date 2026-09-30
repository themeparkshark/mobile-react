import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BOSS_NAMES, type BossId, type BossRaid } from '../api/endpoints/parks/raid';
import type { RideControlClaim, RideControlPark } from '../api/endpoints/parks/rideControl';
import Map from '../components/Map';
import LiveEventsPill from '../components/LiveEventsPill';
import BossMapDeparture from '../components/boss/BossMapDeparture';
import { Circle } from '../components/map/Circle';
import useBossMapMoment from '../hooks/useBossMapMoment';
import type { TaskType } from '../models/task-type';
import TaskMarker from './ExploreScreen/TaskMarker';

/** Actual native map/components; every battle receipt here is a local practice fixture. */
export default function BossMapPreviewScreen() {
  const [boss, setBoss] = useState<BossId>('kraken'), [run, setRun] = useState(0), [selected, setSelected] = useState(false);
  const fixture = useMemo(() => {
    const stamp = new Date().toISOString();
    const claim: RideControlClaim = { park_id: 1, asset_id: 13, park_day: '2026-09-29', confirmed_at: stamp,
      ride_name: 'Practice space attraction', team: 'mouse', points: 25, controller: 'mouse', previous_controller: 'globe', flipped: true,
      scores: { mouse: 35, globe: 30, shark: 0 } };
    const ride = { asset_id: 13, controller: 'mouse' as const, scores: claim.scores, margin: 5, contested: false,
      carried_over: false, captain: null, your_points: 25, flipped_at: stamp };
    const control: RideControlPark = { park_day: claim.park_day, rides_held: { mouse: 1, globe: 0, shark: 0 },
      leading_team: 'mouse', your_team: 'mouse', your_team_is_underdog: false, rides: [ride], points: {}, player_daily_cap: 50 };
    const raid: BossRaid = { id: 900000 + run + Date.now(), task_id: 900109, boss, ride_name: claim.ride_name,
      latitude: 34.13838, longitude: -118.35576, hp_max: 5000, hp_left: 0, status: 'defeated', starts_at: stamp, ends_at: stamp,
      fighters: 1, teams: { mouse: 50, globe: 0, shark: 0 }, feed: [], top: [], mvp_is_you: true, ride_control: claim,
      energy_cost: 10, reach_meters: 200, you: { attacks: 1, attacks_left: 4, damage: 50,
        reward: { outcome: 'defeated', coins: 50, xp: 100, energy: 20, parts: 2, tickets: 1 } },
      remote: { joined: false, ticket_cost: 1, damage_rate: 0.6, fighters: 0 } };
    const task: TaskType = { id: 900109, name: claim.ride_name, latitude: String(raid.latitude), longitude: String(raid.longitude),
      asset_id: 13, coin_url: '', coins: 0, experience: 0, completion_goal: 1, times_completed: 0 };
    return { control, ride, raid, task };
  }, [boss, run]);
  const map = useBossMapMoment({ playerId: 900005, parkId: 1, available: true, control: fixture.control,
    refreshControl: async () => fixture.control });
  return <View style={styles.screen}>
    <View style={styles.header}><Text style={styles.title}>Boss map practice</Text>
      <Text style={styles.note}>Local fixture · no account Energy, damage or rewards change</Text></View>
    <View style={{ flex: 1 }}>
      <View style={styles.receipt} pointerEvents="box-none"><LiveEventsPill raid={null} rushes={[]} onBoss={() => undefined} onRush={() => undefined}
        mapMoment={map.moment} mapFlag={map.flag} onMapMoment={() => setSelected(true)} onDismissMoment={map.dismiss} /></View>
      <Map onPress={() => setSelected(false)} controlsTop={88} focusCoordinate={map.moment ? { ...map.moment.impact.coordinate, requestId: map.moment.impact.raidId } : null}>
        <TaskMarker task={fixture.task} isSelected={selected} control={fixture.ride} onPress={() => setSelected(value => !value)}
          flagRaiseKey={map.flag && (map.moment?.phase === 'flag' || map.moment?.phase === 'settled') ? map.moment.impact.key : undefined} />
        {map.moment && (map.moment.phase === 'exit' || map.moment.phase === 'flag') &&
          <Circle center={map.moment.impact.coordinate} radius={65} fillColor="rgba(255,207,59,0.12)" strokeColor="#ffcf3b" strokeWidth={2} />}
        {map.moment?.phase === 'exit' && <BossMapDeparture impact={map.moment.impact} onComplete={map.finishExit} />}
      </Map>
    </View>
    <View style={styles.controls}>
      <View style={styles.choices}>{(['kraken', 'robo_shark', 'ghost_squid'] as const).map(id => <Pressable key={id} accessibilityRole="button"
        accessibilityLabel={`Select ${BOSS_NAMES[id]} map practice`} onPress={() => { map.dismiss(); setBoss(id); setRun(value => value + 1); }}
        style={[styles.choice, boss === id && styles.chosen]}><Text style={styles.choiceText}>{BOSS_NAMES[id]}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Play confirmed boss map fixture" style={styles.play}
        onPress={() => { void map.enqueue(fixture.raid); }}><Text style={styles.playText}>Play confirmed map moment</Text></Pressable>
      <Text style={styles.phase}>{map.moment ? `Practice phase: ${map.moment.phase}` : 'Choose a boss, then play its map exit'}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#075083' }, header: { paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10 },
  title: { fontFamily: 'Shark', fontSize: 24, color: '#ffdc61', textAlign: 'center' },
  note: { fontFamily: 'Knockout', fontSize: 12, color: '#dff4ff', textAlign: 'center', marginTop: 4 },
  receipt: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25 }, controls: { padding: 12, paddingBottom: 30, gap: 10 },
  choices: { flexDirection: 'row', gap: 6 }, choice: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 2,
    borderColor: '#90b5ce', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  chosen: { backgroundColor: '#177bbe', borderColor: '#ffdc61' },
  choiceText: { fontFamily: 'Shark', fontSize: 14, color: '#fff', textAlign: 'center' },
  play: { minHeight: 48, borderRadius: 14, backgroundColor: '#ffdc61', alignItems: 'center', justifyContent: 'center' },
  playText: { fontFamily: 'Shark', fontSize: 18, color: '#143b56' }, phase: { fontFamily: 'Knockout', color: '#dff4ff', textAlign: 'center', fontSize: 13 },
});
