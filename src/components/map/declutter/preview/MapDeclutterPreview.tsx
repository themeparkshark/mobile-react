/**
 * Development-only visual QA for the in-park map declutter
 * (EXPO_PUBLIC_DECLUTTER_PREVIEW=1): Universal Studios Florida during
 * Fin-ister Nights at production ride spots, the USF haunt fixture, timed
 * coins and keys, the HUD and both button columns, so captures need no login
 * or park check. EXPO_PUBLIC_DECLUTTER_SCENE=before draws the same scene with
 * the declutter off and the old stacked banners, for before/after shots.
 * Set the simulator location inside USF (28.4756, -81.4679). Never shipped.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { LogBox, StyleSheet, View } from 'react-native';
import Map from '../../../Map';
import RideControlBar from '../../../RideControlBar';
import NightShowPill from '../../alive/NightShowPill';
import type { NightShow } from '../../alive/nightShow';
import FrightPill from '../../../fright/FrightPill';
import type { FrightNight } from '../../../../hooks/useFrightNight';
import type { FrightEngine } from '../../../fright/useFrightEngine';
import type { FrightMapInput } from '../../fright';
import { usfFrightFixture } from '../../fright/preview/usfFixture';
import { offsetMeters } from '../../fright/geo';
import HelpButton from '../../../help/HelpButton';
import MapResourcePill from '../../../../screens/ExploreScreen/MapResourcePill';
import TaskMarker from '../../../../screens/ExploreScreen/TaskMarker';
import FindMarker from '../../../../screens/ExploreScreen/FindMarker';
import Coin from '../../../../screens/ExploreScreen/Coin';
import Key from '../../../../screens/ExploreScreen/Key';
import { BOTTOM_RIGHT_COLUMN, bottomLeftColumnHeight, buildParkLayout, parkMapInsets, rideTagFor } from '../../../../screens/ExploreScreen/parkMapLayout';
import MapStatusStack, { TONES, type StatusEntry } from '../../MapStatusStack';
import { HUD_BOTTOM } from '../../statusStack';
import { createDeclutterStore } from '../store';
import type { TaskType } from '../../../../models/task-type';
import type { LiveRide } from '../../../../api/endpoints/parks/live';
import { USF_RIDES } from './usfRides';

const noop = () => undefined;
/** Show times carry the park's own offset (Orlando, EDT), as the server sends them. */
const parkIso = (ms: number) => new Date(ms - 4 * 3600_000).toISOString().replace(/\.\d+Z$/, '-04:00');
// The player stands where the dev location starts (EXPO_PUBLIC_DEV_START_LAT/LNG), the finds around them.
const PLAYER = { latitude: Number(process.env.EXPO_PUBLIC_DEV_START_LAT) || 28.4756,
  longitude: Number(process.env.EXPO_PUBLIC_DEV_START_LNG) || -81.4679 };
// Clean captures: no dev warning toast over the map.
LogBox.ignoreAllLogs(true);
// Rides that close for the night during the event (the rest stay open).
const CLOSED_AT_NIGHT = new Set(['Animal Actors', 'Bourne', 'Fear Factor Live', 'Duff Brewery', 'StorePants', 'Simpson Game']);

// Scenes: after (default), before (declutter off, old banners), expanded (HUD stack open), day (no Fin-ister).
const SCENE = process.env.EXPO_PUBLIC_DECLUTTER_SCENE ?? 'after';
// Stress: +90 rides and +30 coins around the park (~150 markers).
const STRESS = process.env.EXPO_PUBLIC_DECLUTTER_STRESS === '1';
const STRESS_RIDES = STRESS ? Array.from({ length: 90 }, (_, i) => ({ id: 2000 + i, name: `Stress ${i}`,
  latitude: 28.4751 + (Math.floor(i / 9) + ((i * 37) % 10) / 20) * 0.00055, longitude: -81.4700 + ((i % 9) + ((i * 53) % 10) / 20) * 0.0004 })) : [];
// Camera: a fixed zoom ("16.4"), or "soak" (a pan and zoom tour every 2.5 s: centres across the park, zooms 15.8 to 19.4).
const CAM = process.env.EXPO_PUBLIC_DECLUTTER_CAM;
const SOAK_ZOOMS = [16.4, 15.8, 17.6, 18.8, 19.4, 17.0, 16.4, 18.2];

export default function MapDeclutterPreview() {
  const before = SCENE === 'before';
  const day = SCENE === 'day';
  const [now] = useState(() => Date.now());
  const store = useRef(createDeclutterStore()).current;
  const tonight = useMemo(() => usfFrightFixture(now, 'live'), [now]);
  const fright = useMemo<FrightMapInput | null>(() => day ? null : ({ tonight, active: true, nowOffsetMs: 0,
    player: PLAYER, spooky: true, quiet: true, doneKeys: [] }), [tonight, day]);
  const [camFocus, setCamFocus] = useState<{ latitude: number; longitude: number; zoom: number; requestId: number } | null>(null);
  useEffect(() => {
    if (!CAM) return;
    if (CAM !== 'soak') {
      const timer = setTimeout(() => setCamFocus({ ...PLAYER, zoom: Number(CAM), requestId: 1 }), 4000);
      return () => clearTimeout(timer);
    }
    let i = 0;
    const timer = setInterval(() => {
      const ride = USF_RIDES[(i * 7) % USF_RIDES.length];
      const zoom = SOAK_ZOOMS[i % SOAK_ZOOMS.length];
      i += 1;
      console.log(`DECLUTTER_SOAK step=${i} zoom=${zoom}`);
      setCamFocus({ latitude: ride.latitude, longitude: ride.longitude, zoom, requestId: Date.now() });
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  const tasks = useMemo(() => [...USF_RIDES, ...STRESS_RIDES].map((ride, index): TaskType => ({
    id: ride.id, name: ride.name, latitude: String(ride.latitude), longitude: String(ride.longitude), coin_url: '', coins: 10,
    completion_goal: 1, experience: 10, times_completed: index % 3 === 0 ? 1 : 0, asset_id: ride.id, ticket_cost: 1,
    active_to: index % 4 === 1 ? new Date(now + (3 + index) * 60_000).toISOString() : undefined,
    ...(ride.name === 'Revenge Of The Mummy' ? { limited: { active: true, ends_on: '2026-10-31', returns: false } } : {}),
  }) as unknown as TaskType), [now]);
  const live = useMemo(() => new globalThis.Map<number, LiveRide>(tasks.map(task => [task.id, {
    task_id: task.id, status: CLOSED_AT_NIGHT.has(task.name) ? 'CLOSED' : 'OPERATING', wait: 30, typical: 30, rush: null,
  } as LiveRide])), [tasks]);
  const adventureId = tasks.find(task => task.name === 'E.T. Adventure')?.id ?? null;
  const player = PLAYER;
  const near = (task: TaskType) => Math.hypot((Number(task.latitude) - player.latitude) * 111320,
    (Number(task.longitude) - player.longitude) * 111320 * 0.879) <= 60;

  // Timed finds right among the islands and haunts, like tonight's screenshot.
  const finds = useMemo(() => [
    { id: 'coin:1', kind: 'coin' as const, ...offsetMeters(player, 18, 40) },
    { id: 'coin:2', kind: 'coin' as const, ...offsetMeters(player, -30, 75) },
    { id: 'key:1', kind: 'key' as const, ...offsetMeters(player, -12, 52) },
    { id: 'coin:3', kind: 'coin' as const, ...offsetMeters(player, 45, -20) },
    ...(STRESS ? Array.from({ length: 30 }, (_, i) => ({ id: `coin:${10 + i}`, kind: 'coin' as const,
      ...offsetMeters(player, ((i * 71) % 400) - 200, ((i * 113) % 500) - 150) })) : []),
  ], []); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => buildParkLayout({
    nightMode: !day,
    rides: tasks.map(task => {
      const closed = !day && live.get(task.id)?.status === 'CLOSED';
      return { id: task.id, latitude: Number(task.latitude), longitude: Number(task.longitude), selected: false,
        adventure: task.id === adventureId, playable: false, goal: false, rush: false, near: near(task), closed,
        tag: rideTagFor({ selected: false, rush: false, adventure: task.id === adventureId, goal: false, owned: (task.times_completed ?? 0) > 0,
          limitedText: task.limited?.active ? 'Limited · leaves Oct 31' : null, expiresAt: task.active_to ? Date.parse(task.active_to) : null,
          near: near(task), now, closed }) };
    }),
    finds: finds.map(find => ({ id: find.id, latitude: find.latitude, longitude: find.longitude, kind: find.kind })),
    haunts: day ? [] : tonight.spots.filter(spot => spot.kind === 'haunt').map(spot => ({ key: spot.key, latitude: spot.latitude, longitude: spot.longitude,
      closed: spot.status === 'DOWN' || spot.status === 'CLOSED' })),
    reefs: day ? [] : tonight.spots.filter(spot => spot.kind === 'reef').map(spot => ({ key: spot.key, latitude: spot.latitude, longitude: spot.longitude, radius: spot.radius })),
    fixed: !day && tonight.encounter ? [{ id: 'encounter', latitude: tonight.encounter.latitude, longitude: tonight.encounter.longitude,
      kind: 'encounter' as const, radius: tonight.encounter.radius }] : [],
  }), [tasks, live, adventureId, finds, tonight, now, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const insets = useMemo(() => parkMapInsets({ hudBottom: HUD_BOTTOM, left: null, right: null,
    bottomLeft: bottomLeftColumnHeight(0), bottomRight: BOTTOM_RIGHT_COLUMN }), []);
  const declutter = useMemo(() => before ? null : { store, items, insets }, [before, store, items, insets]);

  // HUD: a Fin-ister pill, tonight's lagoon show teaser and Ride Control, as at USF tonight.
  const night = useMemo(() => ({ tonight, phase: 'live', modeOn: true, eventPark: true, leftEventPark: false, offset: 0,
    title: 'Fin-ister Nights', foreground: true, openCount: 1, now: () => Date.now(), refresh: async () => undefined,
    applyResult: noop, setCalm: noop } as unknown as FrightNight), [tonight]);
  const engine = useMemo(() => ({ quiet: false, pendingSync: 0, art: { chip: null }, setSheetOpen: noop, setPillBottom: noop,
    openRun: null, openSpot: null, doneKeys: [] } as unknown as FrightEngine), []);
  const show = useMemo(() => ({ kind: 'water', label: 'Lagoon show', where: 'Over the lagoon', starts_at: parkIso(now + 40 * 60_000),
    ends_at: parkIso(now + 60 * 60_000), duration_seconds: 1200, finale_seconds: 60, finale_fireworks: false,
    anchor: { latitude: 28.4762, longitude: -81.4677 }, curve: [], timezone: 'America/New_York' } as unknown as NightShow), [now]);
  const allEntries: StatusEntry[] = [
    { key: 'fright', label: 'Fin-ister Nights', tone: TONES.night, node: <FrightPill inline night={night} engine={engine} /> },
    { key: 'show', label: 'Lagoon show', tone: TONES.show, node: <NightShowPill inline show={show} phase="teaser" onSee={noop} /> },
    { key: 'control', label: 'Ride Control', tone: TONES.park, node: <RideControlBar inline control={null} tasks={tasks} onFocusTask={noop} /> },
  ];
  const entries = day ? allEntries.filter(entry => entry.key !== 'fright') : allEntries;

  return (
    <View style={styles.screen}>
      <View style={styles.header} />
      <View style={{ flex: 1, marginTop: -8 }}>
        {before ? (
          <View style={styles.oldHud} pointerEvents="box-none">
            <RideControlBar control={null} tasks={tasks} onFocusTask={noop} />
            <NightShowPill show={show} phase="teaser" onSee={noop} />
            {!day && <FrightPill night={night} engine={engine} onHelp={noop} />}
          </View>
        ) : <MapStatusStack entries={entries} defaultOpen={SCENE === 'expanded'} />}
        <Map fright={fright} declutter={declutter} controlsTop={HUD_BOTTOM + 76} onPress={noop} focusCoordinate={camFocus}
          sunOverride={day ? 50 : -16}>
          {tasks.map(task => (
            <TaskMarker key={task.id} task={task} isSelected={false} adventure={task.id === adventureId} near={near(task)}
              live={day ? undefined : live.get(task.id)} onPress={noop} aliveRank={0} />
          ))}
          {finds.map(find => (
            <FindMarker key={find.id} id={find.id} latitude={find.latitude} longitude={find.longitude}>
              {tag => find.kind === 'key'
                ? <Key tag={tag} onExpire={noop} model={{ id: 1, active_to: new Date(now + 6 * 60_000 + 28_000).toISOString() } as never} />
                : <Coin tag={tag} onExpire={noop} coin={{ id: Number(find.id.slice(5)), active_to: new Date(now + 2 * 60_000 + 22_000).toISOString() } as never} />}
            </FindMarker>
          ))}
        </Map>
      </View>
      {/* The two bottom button columns, at their real sizes. */}
      <View style={styles.left} pointerEvents="box-none">
        <HelpButton topic="park" size={44} style={{ marginBottom: 10, marginLeft: 13 }} label="How to play at the park" />
        <Image source={require('../../../../../assets/images/screens/explore/queuetimes.png')} style={{ width: 70, height: 72 }} contentFit="contain" />
      </View>
      <View style={styles.right} pointerEvents="box-none">
        <View style={{ marginBottom: 12, gap: 6, alignItems: 'flex-end' }}>
          <MapResourcePill icon="energy" label="Energy" count={100} onPress={noop} />
          <MapResourcePill icon="swords" label="Swords" count={0} muted onPress={noop} />
        </View>
        <View style={styles.avatar} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0768b9' },
  header: { height: 110, backgroundColor: '#0879ca', borderBottomWidth: 3, borderBottomColor: '#ffffff', zIndex: 30 },
  oldHud: { position: 'absolute', top: 12, left: 0, right: 0, zIndex: 25 },
  left: { position: 'absolute', left: 16, bottom: 32, zIndex: 10 },
  right: { position: 'absolute', right: 16, bottom: 32, zIndex: 10, alignItems: 'center' },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#0879ca', borderWidth: 4, borderColor: '#ffffff' },
});
