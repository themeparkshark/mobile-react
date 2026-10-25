/**
 * Lane tooling only: the UI-thread frame probe on the REAL map for the park arrival
 * (EXPO_PUBLIC_MOTION_CAPTURE=ParkMapCapture with `expo start --no-dev`, never set in a
 * store or OTA bundle, where MAP_CAPTURE is false and this never mounts). In that build
 * the arrival plays on every park entry, and when it ends the panel keeps its own numbers
 * (UI fps, fps p5, worst frame, share of frames over 16.7 ms), every long frame with its
 * time from the trigger, and the moment's marks (build steps, start, handoff, done).
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { PerfOverlay, usePerfProbe } from '../../gamekit/perf/PerfOverlay';
import { takeCaptureMarks } from './momentPerf';

export const MAP_CAPTURE = process.env.EXPO_PUBLIC_MOTION_CAPTURE === 'ParkMapCapture';

export default function MapMomentProbe({ running, label }: { readonly running: boolean; readonly label: string }) {
  const probe = usePerfProbe(true);
  const [text, setText] = useState('arrival probe: waiting');
  const since = useSharedValue(-1);
  const hitches = useSharedValue<number[]>([]);
  const startedAt = useRef(0);
  const runs = useRef(0);
  useFrameCallback(info => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt == null || since.value < 0) return;
    since.value += dt;
    if (dt > 34) hitches.value = [...hitches.value.slice(-40), Math.round(since.value - dt), Math.round(dt)];
  });
  useEffect(() => {
    if (running) {
      runs.current += 1;
      probe.reset();
      takeCaptureMarks();
      hitches.value = [];
      since.value = 0;
      startedAt.current = Date.now();
      setText(`run ${runs.current} ${label}: playing`);
      return undefined;
    }
    if (startedAt.current === 0) return undefined;
    // The probe publishes at 4 Hz: read it a beat after the end, then one more second for the unmount.
    const doneAt = Date.now() - startedAt.current;
    const timer = setTimeout(() => {
      const s = probe.summary();
      const marks = takeCaptureMarks().map(m => `${m.name.split('.').pop()}@${m.at - startedAt.current}`);
      const h = hitches.value;
      since.value = -1;
      const long: string[] = [];
      for (let i = 0; i + 1 < h.length; i += 2) long.push(`${h[i + 1]}@${h[i]}`);
      setText(`run ${runs.current} ${label} ${(doneAt / 1000).toFixed(2)}s  UI ${s.fpsAvg.toFixed(1)}  p5 ${s.fpsP5.toFixed(1)}\n` +
        `worst ${s.worstMs.toFixed(1)}ms  >16.7 ${s.over16Pct}%  frames ${s.frames}\nlong ${long.join(' ') || 'none'}\n${marks.join(' ')}`);
    }, 1000);
    return () => clearTimeout(timer);
    // The probe and shared values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  return <View pointerEvents="none" style={styles.panel}>
    <PerfOverlay probe={probe} visible style={styles.graph} />
    <Text style={styles.text}>{text}</Text>
  </View>;
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', left: 6, right: 6, bottom: 150, backgroundColor: 'rgba(5,52,110,0.82)', borderRadius: 8, padding: 4, zIndex: 80 },
  graph: { position: 'relative', top: 0, right: 0, left: 0 },
  text: { color: '#ffffff', fontSize: 11, fontFamily: 'Menlo', marginTop: 2 },
});
