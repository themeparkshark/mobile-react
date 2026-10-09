import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Map from '../components/Map';
import TrailHost from '../components/trail/TrailHost';
import MapResourcePill from './ExploreScreen/MapResourcePill';
import { TrailContext, type MotionAccess, type TrailContextType } from '../services/trail/TrailProvider';
import type { TrailBox, TrailReward, TrailState, TrailTier } from '../services/trail/trailModel';

/**
 * Development-only visual QA for Trail Boxes (EXPO_PUBLIC_TRAIL_PREVIEW=<scene>):
 * the real park map with the real Trail pill over the Energy pill, the sheet,
 * the odds page and the opening reveal, on in-memory state shaped exactly like
 * the server's. Never shipped in release.
 *
 * Scenes: map, catchup (the walk lands after the app was closed), sheet,
 * ready, inside, ask (motion pre-ask), reveal (a Gold box), reveal3 (three in a row).
 */
const SCENES = ['map', 'catchup', 'sheet', 'ready', 'inside', 'ask', 'reveal', 'reveal3', 'home'] as const;
const START = (process.env.EXPO_PUBLIC_TRAIL_PREVIEW ?? 'map') as string;
const noop = async () => undefined;
const ASSETS = 'https://assets.themeparkshark.com/mobile/production/assets/';

const box = (id: number, tier: TrailTier, goal: number, progress: number, status: TrailBox['status'], slot: number | null): TrailBox => ({
  id, tier, goal_steps: goal, progress_steps: progress, status, slot, source: 'arrival', earned_at: '2026-10-08T16:00:00Z',
});

function fixture(scene: string, step: number): TrailState {
  const ready = scene === 'ready' || scene.startsWith('reveal')
    ? (scene === 'reveal' ? [box(9, 'gold', 10000, 10000, 'ready', null)]
      : [box(9, 'gold', 10000, 10000, 'ready', null), box(10, 'red', 5000, 5000, 'ready', null), box(11, 'blue', 2000, 2000, 'ready', null)])
    : scene === 'catchup' && step > 0 ? [box(1, 'blue', 2000, 2000, 'ready', null)] : [];
  const walking = scene === 'catchup' && step > 0
    ? [box(4, 'red', 5000, 1420, 'walking', 0), box(2, 'gold', 10000, 7800, 'walking', 1), box(3, 'blue', 2000, 1180, 'walking', 2)]
    : [box(1, 'blue', 2000, scene === 'catchup' ? 820 : 1380, 'walking', 0), box(2, scene.startsWith('reveal') ? 'red' : 'gold', 10000, scene === 'catchup' ? 6600 : 7180, 'walking', 1),
      box(3, 'red', 5000, scene === 'catchup' ? 0 : 640, 'walking', 2)];
  const waiting = scene === 'catchup' && step > 0 ? [box(5, 'blue', 2000, 0, 'queued', null)]
    : [box(4, 'red', 5000, 0, 'queued', null), box(5, 'blue', 2000, 0, 'queued', null)];
  const steps = scene === 'catchup' && step > 0 ? 14870 : 12460;
  return {
    enabled: true, slots: 3, rack: 6, walking, waiting, ready,
    today: { park_id: 10, park_name: 'Epic Universe', park_day: '2026-10-08', steps, meters: Math.round(steps * 0.75) },
    best_day: { park_day: '2026-10-08', steps, meters: Math.round(steps * 0.75) },
    lifetime: { steps: 84210, meters: 63158, boxes_opened: 11 },
    week: scene === 'ready' ? { steps: 26200, goal_steps: 25000, goal_hit: true, goal_options: [10000, 25000, 50000] }
      : { steps: steps + 6100, goal_steps: 25000, goal_hit: false, goal_options: [10000, 25000, 50000] },
    wheels: false, gold_in: 3, next_ride_box: 1,
    odds: {
      gold_pity: 8, exclusives: ['Propeller Hat', 'Party Inflatable Duck', 'Blue Inflatable Duck', 'Green Inflatable Duck'],
      tiers: [
        { tier: 'blue', goal_steps: 2000, coins: 30, chance_bp: 6000, always: [], bonus: [
          { kind: 'energy', amount: 10, chance_bp: 4000 }, { kind: 'tickets', amount: 1, chance_bp: 3200 }, { kind: 'coins', amount: 30, chance_bp: 2300 },
          { kind: 'mystery_box', amount: 1, chance_bp: 500 }] },
        { tier: 'red', goal_steps: 5000, coins: 75, chance_bp: 3000, always: [], bonus: [
          { kind: 'tickets', amount: 2, chance_bp: 3000 }, { kind: 'mystery_box', amount: 1, chance_bp: 2500 },
          { kind: 'energy', amount: 25, chance_bp: 2500 }, { kind: 'exclusive', amount: 1, chance_bp: 2000 }] },
        { tier: 'gold', goal_steps: 10000, coins: 175, chance_bp: 1000, always: [{ kind: 'mystery_box', amount: 1 }], bonus: [
          { kind: 'exclusive', amount: 1, chance_bp: 5500 }, { kind: 'mystery_box', amount: 1, chance_bp: 1500 }, { kind: 'tickets', amount: 3, chance_bp: 3000 }] },
      ],
    },
    exclusives: [
      { item_id: 168, name: 'Propeller Hat', icon_url: `${ASSETS}v4pmQB4e8CQ1UIWyUVei5GuXIva0UzrahR24DU0l.png`, owned: true },
      { item_id: 54, name: 'Party Inflatable Duck', icon_url: `${ASSETS}AzMgxAaIRVnqTnsVxJI7I6PM8N11kU6nEZfhyBhC.png`, owned: false },
      { item_id: 193, name: 'Blue Inflatable Duck', icon_url: `${ASSETS}mSiN8uw5KKnt5l7bFnCHDNAOl0XRzRpkGOSfWYM4.png`, owned: true },
      { item_id: 191, name: 'Green Inflatable Duck', icon_url: `${ASSETS}PNPGlk5m14A5sNvkufUhhm7Bl31EA4eogoaHpYPX.png`, owned: false },
    ],
    sync: scene === 'sheet' ? { credited_steps: 2410, ready_box_ids: [], goal_box: null, missed: [{ reason: 'ride', steps: 380 }] } : undefined,
  };
}

const REWARDS: Record<number, TrailReward[]> = {
  9: [{ kind: 'coins', amount: 175 }, { kind: 'mystery_box', amount: 1 }, { kind: 'exclusive', amount: 1, name: 'Party Inflatable Duck',
    icon_url: 'https://assets.themeparkshark.com/mobile/production/assets/AzMgxAaIRVnqTnsVxJI7I6PM8N11kU6nEZfhyBhC.png' }],
  10: [{ kind: 'coins', amount: 75 }, { kind: 'tickets', amount: 2 }],
  11: [{ kind: 'coins', amount: 30 }, { kind: 'energy', amount: 10 }],
};

export default function TrailPreviewScreen() {
  // A clear 44 pt target in the top-left corner steps to the next scene (no Metro restart).
  const [sceneIndex, setSceneIndex] = useState(Math.max(0, SCENES.indexOf(START as typeof SCENES[number])));
  const SCENE: string = SCENES[sceneIndex % SCENES.length];
  return <Scene key={SCENE} scene={SCENE} onNext={() => setSceneIndex(i => i + 1)} />;
}

function Scene({ scene: SCENE, onNext }: { readonly scene: string; readonly onNext: () => void }) {
  useEffect(() => { console.log(`TRAIL_SCENE ${SCENE}`); }, [SCENE]);
  const [step, setStep] = useState(0);
  const [state, setState] = useState<TrailState>(() => fixture(SCENE, 0));
  const opened = useRef(new Set<number>());
  useEffect(() => {
    if (SCENE !== 'catchup') return undefined;
    const t = setTimeout(() => { setStep(1); setState(fixture(SCENE, 1)); }, 6000);
    return () => clearTimeout(t);
  }, []);
  const value = useMemo<TrailContextType>(() => ({
    enabled: true, state, parkId: 10, syncing: false, syncVersion: step, motion: (SCENE === 'ask' ? 'ask' : 'granted') as MotionAccess,
    refresh: noop, flush: noop, front: noop, setGoal: noop, setWheels: noop, askMotion: async () => 'granted' as MotionAccess,
    open: async (id: number) => {
      await new Promise(r => setTimeout(r, 400));
      opened.current.add(id);
      return { ...state, opened: { box: box(id, 'gold', 1, 1, 'opened', null), rewards: REWARDS[id] ?? REWARDS[11], replayed: false } };
    },
  }), [state, step]);

  const preview = SCENE === 'sheet' || SCENE === 'ready' || SCENE === 'ask' ? 'sheet'
    : SCENE === 'inside' ? 'inside' : SCENE.startsWith('reveal') ? 'reveal' : undefined;
  const home = SCENE === 'home';
  return (
    <TrailContext.Provider value={home ? { ...value, parkId: null } : value}>
      <View style={styles.root}>
        <Map>{null}</Map>
        <View style={styles.column}>
          <View style={{ marginBottom: 12, gap: 6, alignItems: 'flex-end' }}>
            <TrailHost active preview={preview} inPark={!home} />
            {!home && <MapResourcePill icon="energy" label="Energy" count={42} />}
          </View>
          <View style={styles.avatar} />
        </View>
        <Pressable onPress={onNext} accessibilityLabel="Next preview scene" style={styles.next} />
      </View>
    </TrailContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  column: { position: 'absolute', right: 16, bottom: 32, alignItems: 'center' },
  next: { position: 'absolute', left: 0, top: 60, width: 44, height: 44 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#0879ca', borderWidth: 3, borderColor: '#fff' },
});
