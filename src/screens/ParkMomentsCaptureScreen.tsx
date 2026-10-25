/**
 * Lane tooling only: the park day moments on one stage, so their frame rate can be measured in
 * release-like JS (EXPO_PUBLIC_MOTION_CAPTURE=ParkMomentsCapture with `expo start --no-dev`, where the
 * dev navigator and the debugger hooks do not run). Never in a store or OTA bundle: devRoutes folds it
 * away unless that capture flag is set.
 *
 * A row of picture buttons plays each moment (idb taps): the park arrival, the golden arrival, First
 * coin today!, Your ride's up! and the shelf landing (a real confirmed win, EXPO_PUBLIC_SHELF_ARRIVAL_ATTEMPT_ID,
 * opened on the real Park screen). The UI-thread frame probe (gamekit PerfOverlay) resets when a moment
 * starts, and when it ends the panel keeps that moment's own numbers (UI fps, fps p5, worst frame,
 * share of frames over 16.7 ms) on screen for the clip.
 */
import { useContext, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { takeCaptureMarks } from '../components/park/momentPerf';
import { getTaskAttempt } from '../api/endpoints/me/task-attempts';
import { AuthContext } from '../context/AuthProvider';
import { PerfOverlay, usePerfProbe } from '../gamekit/perf/PerfOverlay';
import FirstCoinRibbon from '../components/park/FirstCoinRibbon';
import ParkArrivalMoment from '../components/park/ParkArrivalMoment';
import { ARRIVAL } from '../components/park/parkArrival';
import type { ArrivalCard } from '../components/park/parkArrival';
import { RIDE_UP } from './LinePlay/components/RideUpCelebration';
import { RideUpSample } from './LinePlay/QueueStampPreviewScreen';
import { createEarnedShelfArrival } from '../services/collection/earnedShelf';
import { setBatterySaver, useBatterySaver, usePowerBudget } from '../power';
import * as RootNavigation from '../RootNavigation';

type Moment = 'arrival' | 'golden' | 'firstCoin' | 'firstCoinShort' | 'rideUp';

const CARDS: readonly ArrivalCard[] = [
  { kind: 'limited', taskId: 78, name: 'Space Mountain', count: 1, latitude: 33.8115, longitude: -117.9175 },
  { kind: 'coins', count: 34 },
  { kind: 'new', count: 7, latitude: null, longitude: null },
];

export default function ParkMomentsCaptureScreen() {
  const { player } = useContext(AuthContext);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const probe = usePerfProbe(true);
  // Battery Saver from the stage itself (the app's own switch), so a Saver run shows the thinned particles.
  const saver = useBatterySaver();
  const budget = usePowerBudget();
  const [playing, setPlaying] = useState<{ moment: Moment; key: number } | null>(null);
  const [last, setLast] = useState('tap a moment');
  const runs = useRef(0);
  const startedAt = useRef(0);
  // Where each long frame fell (ms since the tap, summed on the UI thread), so a hitch can be pinned to a beat.
  const since = useSharedValue(-1);
  const hitches = useSharedValue<number[]>([]);
  useFrameCallback(info => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt == null || since.value < 0) return;
    since.value += dt;
    if (dt > 34) hitches.value = [...hitches.value.slice(-40), Math.round(since.value - dt), Math.round(dt)];
  });

  const start = (moment: Moment) => {
    if (playing) return;
    runs.current += 1;
    probe.reset();
    takeCaptureMarks();
    hitches.value = [];
    since.value = 0;
    startedAt.current = Date.now();
    setPlaying({ moment, key: runs.current });
    // Ride up has no end callback: its window is its own beat sheet (settled by leaveAt + leaveMs).
    if (moment === 'rideUp') setTimeout(() => done(moment), RIDE_UP.leaveAt + RIDE_UP.leaveMs + 200);
  };
  const done = (moment: Moment) => {
    const s = probe.summary();
    const doneAt = Date.now() - startedAt.current;
    const head = `${moment} ${(doneAt / 1000).toFixed(2)}s  UI ${s.fpsAvg.toFixed(1)}  p5 ${s.fpsP5.toFixed(1)}\n` +
      `worst ${s.worstMs.toFixed(1)}ms  >16.7 ${s.over16Pct}%  frames ${s.frames}`;
    const marks = takeCaptureMarks().map(m => `${m.name.split('.').pop()}@${m.at - startedAt.current}`);
    // One more second on the frame clock after the moment ends, so a hitch at the unmount shows too.
    setTimeout(() => {
      const h = hitches.value;
      since.value = -1;
      const long: string[] = [];
      for (let i = 0; i + 1 < h.length; i += 2) long.push(`${h[i + 1]}@${h[i]}`);
      setLast(`${head}\nlong ${long.join(' ') || 'none'}\n${marks.join(' ')} end@${doneAt}`);
    }, 1000);
    setLast(head);
    setPlaying(null);
  };
  const shelf = async () => {
    const id = Number(process.env.EXPO_PUBLIC_SHELF_ARRIVAL_ATTEMPT_ID);
    if (!player || !Number.isSafeInteger(id) || id <= 0) { setLast('shelf: set EXPO_PUBLIC_SHELF_ARRIVAL_ATTEMPT_ID'); return; }
    try {
      const { attempt } = await getTaskAttempt(id);
      const earnedCoin = createEarnedShelfArrival(attempt);
      if (!earnedCoin) { setLast('shelf: that attempt has no confirmed coin'); return; }
      RootNavigation.navigate('Park', { park: Number(process.env.EXPO_PUBLIC_SHELF_ARRIVAL_PARK) || 8, player: player.id, earnedCoin });
    } catch { setLast('shelf: the attempt could not load'); }
  };

  const toss = { from: { x: width * 0.6, y: height * 0.55 }, to: { x: width - 48, y: height - insets.bottom - 110 }, hudTop: insets.top };
  return <View style={styles.root}>
    {/* A park-like stage: sky, grass and paths in the app's blue, white and gold. */}
    <View style={[styles.grass, { top: height * 0.32 }]} />
    <View style={[styles.path, { top: height * 0.5 }]} />
    <View style={[styles.pathDown, { left: width * 0.42 }]} />
    {playing?.moment === 'arrival' || playing?.moment === 'golden' ? (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <ParkArrivalMoment key={playing.key} parkName="Disneyland" cards={CARDS} golden={playing.moment === 'golden'}
          pose={playing.key % 3} onDone={() => done(playing.moment)} />
      </View>
    ) : null}
    {(playing?.moment === 'firstCoin' || playing?.moment === 'firstCoinShort') && <FirstCoinRibbon key={playing.key} toss={toss}
      short={playing.moment === 'firstCoinShort'} onDone={() => done(playing.moment)} />}
    {playing?.moment === 'rideUp' && <View style={[StyleSheet.absoluteFill, styles.recap, { paddingTop: insets.top + 24, paddingBottom: insets.bottom }]}>
      <RideUpSample />
    </View>}
    {/* Low on the screen, clear of every moment (the ribbons and the arrival live in the top half). */}
    <View pointerEvents="none" style={[styles.panel, { bottom: insets.bottom + 76 }]}>
      <PerfOverlay probe={probe} visible style={styles.graph} />
      <Text style={styles.last}>{`${saver ? 'SAVER ON' : 'saver off'}  particles x${budget.particleScale}\n`}{last}</Text>
    </View>
    {!playing && <View style={[styles.buttons, { bottom: insets.bottom + 16 }]}>
      {([['arrival', 'Arrive'], ['golden', 'Golden'], ['firstCoin', 'First coin'], ['firstCoinShort', 'Coin 2'], ['rideUp', 'Ride up']] as const).map(([m, label]) => (
        <Pressable key={m} accessibilityRole="button" accessibilityLabel={label} onPress={() => start(m)} style={styles.button}>
          <Text style={styles.buttonText}>{label}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel="Shelf" onPress={() => void shelf()} style={styles.button}>
        <Text style={styles.buttonText}>Shelf</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Saver" onPress={() => setBatterySaver(!saver)} style={styles.button}>
        <Text style={styles.buttonText}>Saver</Text>
      </Pressable>
    </View>}
  </View>;
}

/** How long the arrival takes (for the capture's own notes). */
export const CAPTURE_ARRIVAL_MS = ARRIVAL.clockMs;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#8fd3f7' },
  grass: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#9fd67a' },
  path: { position: 'absolute', left: 0, right: 0, height: 26, backgroundColor: '#fff3d6' },
  pathDown: { position: 'absolute', top: '32%', bottom: 0, width: 26, backgroundColor: '#fff3d6' },
  recap: { backgroundColor: '#06396c' },
  panel: { position: 'absolute', left: 6, backgroundColor: 'rgba(5,52,110,0.82)', borderRadius: 8, padding: 4 },
  graph: { position: 'relative', top: 0, right: 0, left: 0 },
  last: { color: '#ffffff', fontSize: 11, fontFamily: 'Menlo', marginTop: 2 },
  buttons: { position: 'absolute', left: 8, right: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  button: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: '#ffcf3b', borderBottomWidth: 3, borderBottomColor: '#d99a00' },
  buttonText: { fontFamily: 'Shark', fontSize: 16, color: '#05346e' },
});
