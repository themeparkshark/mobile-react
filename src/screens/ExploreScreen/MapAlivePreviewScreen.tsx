import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LiveRide } from '../../api/endpoints/parks/live';
import Map from '../../components/Map';
import { CoinCollectFlight } from '../../components/map/alive/CoinCollectFlight';
import { crowdHaze } from '../../components/map/alive/parkPulse';
import { NightShowLayer } from '../../components/map/alive/NightShowLayer';
import NightShowPill from '../../components/map/alive/NightShowPill';
import { GhostSharks } from '../../components/map/alive/GhostSharks';
import type { NightShow } from '../../components/map/alive/nightShow';
import { LocationContext } from '../../context/LocationProvider';
import type { TaskType } from '../../models/task-type';
import TaskMarker from './TaskMarker';

/**
 * Development-only visual QA for the living map (EXPO_PUBLIC_MAP_ALIVE_PREVIEW=1):
 * the real map and islands with in-memory live waits, cycling the sun through
 * day, golden hour, dusk and night, then the arrival burst and the collect
 * flight, so a simulator can be screenshotted or recorded without taps.
 * EXPO_PUBLIC_MAP_ALIVE_SCENE pins one scene. Never shipped in release.
 */
export const MAP_ALIVE_SCENES = ['day', 'golden', 'dusk', 'night', 'arrival', 'collect', 'walk', 'show', 'water'] as const;
type Scene = typeof MAP_ALIVE_SCENES[number];
const SUN: Record<Scene, number> = { day: 50, golden: 4, dusk: -4, night: -16, arrival: 50, collect: 50, show: -16, water: -16, walk: 50 };
const HOLD_MS = 9000;

const at = (base: { latitude: number; longitude: number }, north: number, east: number) => ({
  latitude: String(base.latitude + north / 111320),
  longitude: String(base.longitude + east / (111320 * Math.cos(base.latitude * Math.PI / 180))),
});
const task = (id: number, name: string, spot: { latitude: string; longitude: string }, extra: Partial<TaskType> = {}): TaskType => ({
  id, name, ...spot, coin_url: '', coins: 10, completion_goal: 1, experience: 10, times_completed: 0, asset_id: id, ticket_cost: 1, ...extra,
});
const noop = () => undefined;

export default function MapAlivePreviewScreen() {
  const locationContext = useContext(LocationContext);
  const { location } = locationContext;
  // The first known spot (Disneyland by default) anchors every fixture, even if location blinks out.
  const baseRef = useRef<{ latitude: number; longitude: number } | null>(null);
  if (!baseRef.current && location) baseRef.current = { latitude: location.latitude, longitude: location.longitude };
  const base = baseRef.current ?? { latitude: 33.8121, longitude: -117.919 };
  const pinned = process.env.EXPO_PUBLIC_MAP_ALIVE_SCENE as Scene | undefined;
  const [index, setIndex] = useState(0);
  const scene: Scene = pinned && MAP_ALIVE_SCENES.includes(pinned) ? pinned : MAP_ALIVE_SCENES[index % MAP_ALIVE_SCENES.length];
  useEffect(() => {
    console.log(`MAP_ALIVE_SCENE ${scene}`);
    if (pinned) return;
    const timer = setTimeout(() => setIndex(value => value + 1), HOLD_MS);
    return () => clearTimeout(timer);
  }, [index, scene, pinned]);
  // The arrival scene steps into range a moment after it starts.
  const [inRange, setInRange] = useState(false);
  useEffect(() => {
    setInRange(false);
    if (scene !== 'arrival') return;
    const timer = setTimeout(() => setInRange(true), 1500);
    return () => clearTimeout(timer);
  }, [scene]);

  const fixtures = useMemo(() => {
    const now = Date.now();
    const tasks = [
      task(21, 'Space Voyage', at(base, 60, -40)),
      task(22, 'Pirate Cove', at(base, -50, 55), { times_completed: 2, coin_level: 3 }),
      task(23, 'Jungle River', at(base, 115, 70)),
      task(24, 'Haunted Hotel', at(base, -105, -70)),
      task(25, 'Snow Summit', at(base, 150, -110), { limited: { active: true, ends_at: new Date(now + 30 * 86400_000).toISOString(), ends_on: '2026-10-31', returns: false } }),
      task(26, 'Tiki Twirl', at(base, 14, 10)),
      task(27, 'Castle Carousel', at(base, -10, -95)),
    ];
    const live: Record<number, LiveRide> = {
      21: { task_id: 21, status: 'OPERATING', wait: 85, typical: 50, rush: null },
      22: { task_id: 22, status: 'OPERATING', wait: 35, typical: 35, rush: null },
      23: { task_id: 23, status: 'OPERATING', wait: 5, typical: 20, rush: null },
      24: { task_id: 24, status: 'DOWN', wait: null, typical: null, rush: null },
      25: { task_id: 25, status: 'OPERATING', wait: 20, typical: 25, rush: null },
      26: { task_id: 26, status: 'OPERATING', wait: 60, typical: 30, rush: null },
      27: { task_id: 27, status: 'CLOSED', wait: null, typical: null, rush: null },
    };
    const haze = crowdHaze(tasks.map(t => ({ ...live[t.id], latitude: Number(t.latitude), longitude: Number(t.longitude) })));
    return { tasks, live, haze };
  }, [base.latitude, base.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // A short fake show that is 40 s in (into its finale) when the scene starts.
  const showFixture = useMemo<NightShow | null>(() => {
    if (scene !== 'show' && scene !== 'water') return null;
    const start = Date.now() - 34_000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const anchor = { latitude: base.latitude + 150 / 111320, longitude: base.longitude };
    return { kind: scene === 'water' ? 'water' : 'fireworks', label: scene === 'water' ? 'Water show' : 'Fireworks', where: 'Over the castle',
      starts_at: iso(start), ends_at: iso(start + 60_000), duration_seconds: 60, finale_seconds: 22, finale_fireworks: scene !== 'water',
      anchor, curve: [[0, 0.5], [0.3, 0.8], [0.5, 0.4], [0.62, 1], [0.98, 1], [1, 0]], timezone: 'America/Los_Angeles' };
  }, [scene, index]); // eslint-disable-line react-hooks/exhaustive-deps
  const ghosts = useMemo(() => scene === 'show' ? [
    { id: 1, name: 'Ava', latitude: base.latitude - 30 / 111320, longitude: base.longitude - 40 / 92000, seen_at: '', fade: 1, meters: 40 },
    { id: 2, name: 'Marco', latitude: base.latitude + 40 / 111320, longitude: base.longitude + 50 / 92000, seen_at: '', fade: 0.6, meters: 60 },
  ] : [], [scene, base.latitude, base.longitude]);
  // The walk scene moves the shark ~2 m every 0.8 s (a stroll), so the sparkle trail shows.
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    if (scene !== 'walk') return;
    const timer = setInterval(() => setStep(value => value + 1), 800);
    return () => clearInterval(timer);
  }, [scene]);
  const walking = scene === 'walk' ? { ...(location ?? {}), latitude: base.latitude + (step * 1.6) / 111320,
    longitude: base.longitude + (step * 1.2) / 92000 } : null;
  const [size, setSize] = useState({ width: 0, height: 0 });
  return <LocationContext.Provider value={walking ? { ...locationContext, location: walking as typeof location } : locationContext}>
  <View style={styles.root} onLayout={event => setSize(event.nativeEvent.layout)}>
    <Map sunOverride={SUN[scene]} crowdHaze={fixtures.haze}
      focusCoordinate={showFixture ? { latitude: base.latitude + 90 / 111320, longitude: base.longitude, zoom: 17.2, requestId: index } : null}>
      {showFixture && <NightShowLayer show={showFixture} live />}
      <GhostSharks ghosts={ghosts} />
      {fixtures.tasks.map((t, rank) => <TaskMarker key={t.id} task={t} onPress={noop} isSelected={false}
        near={t.id === 26 || t.id === 22} playable={scene === 'arrival' && inRange && t.id === 26} live={fixtures.live[t.id]} aliveRank={rank} />)}
    </Map>
    {scene === 'collect' && size.width > 0 && <CoinCollectFlight key={index} from={{ x: size.width / 2 + 30, y: size.height / 2 - 30 }}
      to={{ x: size.width - 48, y: size.height - 70 }} label="New coin on your shelf!" reducedMotion={false} onDone={noop} />}
    {scene === 'collect' && <View style={styles.avatar} />}
    {showFixture && <View style={styles.pill}><NightShowPill show={{ ...showFixture, starts_at: '2026-10-05T21:30:00-07:00' }}
      phase={scene === 'show' ? 'live' : 'teaser'} onSee={noop} /></View>}
    <View pointerEvents="none" style={styles.label}><Text style={styles.labelText}>MAP ALIVE {scene}</Text></View>
  </View>
  </LocationContext.Provider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#bfe5ff', paddingTop: 54 },
  avatar: { position: 'absolute', right: 20, bottom: 42, width: 56, height: 56, borderRadius: 28, backgroundColor: '#0879ca', borderWidth: 3, borderColor: '#fff' },
  pill: { position: 'absolute', top: 60, left: 0, right: 0 },
  label: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  labelText: { fontFamily: 'Knockout', fontSize: 12, color: '#05346e' },
});
