import { useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AdventureTicket, TripGoalData } from '../../api/endpoints/me/trip-goal';
import type { LiveRide } from '../../api/endpoints/parks/live';
import Map from '../../components/Map';
import { LocationContext } from '../../context/LocationProvider';
import type { TaskType } from '../../models/task-type';
import AdventureTicketCard from './AdventureTicketCard';
import DwellCard from './DwellCard';
import GuestInvite from './GuestInvite';
import MapResourcePill from './MapResourcePill';
import TaskMarker from './TaskMarker';
import TooFarDialog from './TooFarDialog';
import { adventurePlayGate, rankDetours } from './adventureTicketPresentation';

/**
 * Development-only visual QA for WS2 (EXPO_PUBLIC_TRIP_GOAL_PREVIEW=1 plus
 * EXPO_PUBLIC_WS2_PREVIEW=cycle): every map surface WS2 changed, on the real
 * map and components with in-memory data, one scene every few seconds so a
 * simulator can be screenshotted without taps. Never shipped in release.
 */
export const WS2_SCENES = ['markers', 'adventure-chip', 'adventure-sheet', 'adventure-far', 'adventure-detour',
  'adventure-celebrate', 'adventure-complete', 'dwell', 'find-guide', 'too-far', 'guest'] as const;
export type Ws2Scene = typeof WS2_SCENES[number];
const HOLD_MS = 8000;

const at = (base: { latitude: number; longitude: number }, north: number, east: number) => ({
  latitude: String(base.latitude + north / 111320),
  longitude: String(base.longitude + east / (111320 * Math.cos(base.latitude * Math.PI / 180))),
});
const task = (id: number, name: string, spot: { latitude: string; longitude: string }, extra: Partial<TaskType> = {}): TaskType => ({
  id, name, ...spot, coin_url: '', coins: 10, completion_goal: 1, experience: 10, times_completed: 0, asset_id: id, ticket_cost: 1, ...extra,
});
const ride = (id: number, name: string) => ({ task_id: id, asset_id: id, ride_id: id, ride_name: name, coin_url: '', park_id: 1,
  park_name: 'Universal Studios Hollywood', coin_owned: false, coin_level: null, adventure_ready: true });
const ticket = (phase: AdventureTicket['phase'], base: { latitude: number; longitude: number }, far = false): AdventureTicket => {
  const spot = at(base, far ? 320 : 5, far ? 120 : 3);
  const r = { task_id: 1, asset_id: 1, ride_id: 1, ride_name: 'Space Voyage', coin_url: '', lat: Number(spot.latitude), lng: Number(spot.longitude), radius: 40 };
  return { id: 7, park_id: 1, park_day: '2026-09-30', started_at: '2026-09-30T16:00:00Z', ride: r, ride_choices: [r], phase,
    discover: phase === 'discover' ? null : { ...r, kind: 'coin_win', confirmed_at: '2026-09-30T17:00:00Z', attempt_id: 44 },
    play: phase === 'celebrate' || phase === 'complete' ? { ...r, kind: 'queue_story', confirmed_at: '2026-09-30T17:30:00Z',
      chapter_title: 'Lost Signal', route_name: 'Quiet stars' } : null,
    celebrated_at: phase === 'complete' ? '2026-09-30T18:00:00Z' : null, origin: 'arrival', play_hint: null };
};
const data = (t: AdventureTicket): TripGoalData => ({ adventure_enabled: true, adventure_ticket: t,
  rides: [ride(1, 'Space Voyage'), ride(2, 'Pirate Cove'), ride(3, 'Jungle River'), ride(4, 'Haunted Hotel'), ride(5, 'Snow Summit')],
  goal: null, goal_unavailable: false, goal_plan: null, wallet: { tickets: 3, energy: 40, ticket_cost: 1, tickets_needed: 0 } });

const noop = () => undefined;
const later = async () => undefined;

export default function Ws2PreviewScene() {
  const { location } = useContext(LocationContext);
  const base = location ?? { latitude: 34.1381, longitude: -118.3534 };
  const [index, setIndex] = useState(0);
  const scene = WS2_SCENES[index % WS2_SCENES.length];
  useEffect(() => {
    console.log(`WS2_SCENE ${scene}`);
    const timer = setTimeout(() => setIndex(value => value + 1), HOLD_MS);
    return () => clearTimeout(timer);
  }, [index, scene]);

  const fixtures = useMemo(() => {
    const now = Date.now();
    const tasks = [
      task(11, 'Space Voyage', at(base, 55, -35), { times_completed: 0 }),
      task(12, 'Pirate Cove', at(base, -45, 60), { times_completed: 2, coin_level: 3 }),
      task(13, 'Jungle River', at(base, 110, 90)),
      task(14, 'Haunted Hotel', at(base, -120, -80)),
      task(15, 'Snow Summit', at(base, 150, -120), { active_from: new Date(now + 2 * 3600_000).toISOString() }),
      task(16, 'Tiki Twirl', at(base, 8, 6), { active_to: new Date(now + 4 * 60_000).toISOString() }),
    ];
    const live: Record<number, LiveRide> = {
      13: { task_id: 13, status: 'OPERATING', wait: 10, typical: 35, rush: { wait: 10, ends_at: new Date(now + 20 * 60_000).toISOString() } as LiveRide['rush'] },
      14: { task_id: 14, status: 'DOWN', wait: null, typical: null, rush: null },
    };
    return { tasks, live };
  }, [base.latitude, base.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  const markers = <>
    {fixtures.tasks.map(t => <TaskMarker key={`${scene}-${t.id}`} task={t} onPress={noop}
      isSelected={t.id === 11} distanceMeters={t.id === 11 ? 65 : null} adventure={t.id === 12}
      near={t.id === 16} playable={t.id === 16} clusterCount={t.id === 13 ? 4 : 0} live={fixtures.live[t.id]}
      restingUntil={t.id === 15 ? Date.parse(t.active_from!) : null} revealDelay={(t.id - 11) * 90} />)}
  </>;

  const adventureCard = (phase: AdventureTicket['phase'], options: { far?: boolean; open?: boolean; picker?: boolean; closed?: boolean } = {}) => {
    const t = ticket(phase, base, options.far);
    const d = data(t);
    return <AdventureTicketCard key={scene} ticket={t} data={d} closed={!!options.closed} stale={false} top={64}
      gate={adventurePlayGate(t, base)} initialOpen={options.open} initialPicker={options.picker}
      detours={rankDetours(d.rides, { parkId: 1, currentTaskId: 1, location: base,
        coords: new globalThis.Map(fixtures.tasks.map(item => [item.id - 10, { latitude: Number(item.latitude), longitude: Number(item.longitude) }])),
        live: new globalThis.Map([[2, { task_id: 2, status: 'OPERATING', wait: 15, typical: 20, rush: null }], [3, { task_id: 3, status: 'OPERATING', wait: 40, typical: 30, rush: null }],
          [4, { task_id: 4, status: 'DOWN', wait: null, typical: null, rush: null }]]) })}
      slam={scene === 'adventure-chip' ? [1] : []}
      onDiscover={noop} onPlay={later} onFindLine={noop} onShelf={noop} onSelect={later} onDismiss={later}
      onCelebrate={later} onRefresh={later} />;
  };

  if (scene === 'guest') return <View style={styles.root}><GuestInvite /><Label scene={scene} /></View>;
  const far = at(base, 480, 260);
  return <View style={styles.root}>
    <Map focusCoordinate={scene === 'markers' ? { latitude: base.latitude + 0.0002, longitude: base.longitude, requestId: 1, zoom: 17.8 } : null}
      guideTarget={scene === 'find-guide' ? { latitude: Number(far.latitude), longitude: Number(far.longitude), requestId: index } : null}>
      {scene === 'markers' || scene === 'find-guide' || scene === 'dwell' ? markers : null}
    </Map>
    {scene === 'markers' && <View style={styles.pills}>
      <MapResourcePill icon="energy" label="Energy" count={110} />
      <MapResourcePill icon="swords" label="Swords" count={0} muted />
    </View>}
    {scene === 'adventure-chip' && adventureCard('play')}
    {scene === 'adventure-sheet' && adventureCard('discover', { open: true })}
    {scene === 'adventure-far' && adventureCard('play', { far: true, open: true })}
    {scene === 'adventure-detour' && adventureCard('play', { open: true, picker: true, closed: true })}
    {scene === 'adventure-celebrate' && adventureCard('celebrate', { open: true })}
    {scene === 'adventure-complete' && adventureCard('complete')}
    {scene === 'dwell' && <DwellCard rideName="Space Voyage" top={64} onPlay={noop} onDismiss={noop} />}
    <TooFarDialog visible={scene === 'too-far'} distanceMeters={42} requiredMeters={14} homeItem={false} onClose={noop} />
    <Label scene={scene} />
  </View>;
}

function Label({ scene }: { scene: string }) {
  return <View pointerEvents="none" style={styles.label}><Text style={styles.labelText}>WS2 {scene}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#bfe5ff', paddingTop: 54 },
  pills: { position: 'absolute', right: 16, bottom: 140, gap: 6, alignItems: 'flex-end' },
  label: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  labelText: { fontFamily: 'Knockout', fontSize: 12, color: '#05346e' },
});
