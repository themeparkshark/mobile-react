/**
 * Dev and capture builds only (EXPO_PUBLIC_FPS_OVERLAY=1): UI-thread and
 * JS-thread frames per second over 500 ms windows. The first 2 s (startup)
 * are ignored; it shows the live value and the 5th percentile (p5) so one
 * hitch is visible without a single launch stall pinning the number.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { runOnJS, useFrameCallback } from 'react-native-reanimated';

const WARMUP_MS = 2000;

/** Captures: start a fresh window (e.g. when the Friends list gains focus) so p5 measures only what follows. */
const resetters = new Set<() => void>();
export function resetFpsStats(): void {
  for (const reset of resetters) reset();
}

function p5(samples: number[]): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.05)];
}

export default function FpsOverlay() {
  const started = useRef(Date.now());
  const [ui, setUi] = useState(0);
  const [js, setJs] = useState(0);
  // Long UI frames since the last reset: over 50 ms, over 100 ms (the hitch rule), and the worst one.
  const [long, setLong] = useState({ over50: 0, over100: 0, worst: 0 });
  const uiSamples = useRef<number[]>([]);
  const jsSamples = useRef<number[]>([]);
  useEffect(() => {
    const reset = () => { uiSamples.current = []; jsSamples.current = []; started.current = Date.now() - WARMUP_MS + 300; setLong({ over50: 0, over100: 0, worst: 0 }); };
    resetters.add(reset);
    return () => { resetters.delete(reset); };
  }, []);

  const pushUi = (fps: number, over50: number, over100: number, worst: number) => {
    setUi(fps);
    if (Date.now() - started.current > WARMUP_MS) setLong(l => ({ over50: l.over50 + over50, over100: l.over100 + over100, worst: Math.max(l.worst, worst) }));
    if (Date.now() - started.current > WARMUP_MS) uiSamples.current.push(fps);
  };

  useFrameCallback(frame => {
    'worklet';
    const g = globalThis as unknown as { __fpsT?: number; __fpsN?: number; __fps50?: number; __fps100?: number; __fpsWorst?: number };
    if (g.__fpsT == null) { g.__fpsT = frame.timestamp; g.__fpsN = 0; g.__fps50 = 0; g.__fps100 = 0; g.__fpsWorst = 0; }
    g.__fpsN = (g.__fpsN ?? 0) + 1;
    const gap = frame.timeSincePreviousFrame ?? 0;
    if (gap > 50) g.__fps50 = (g.__fps50 ?? 0) + 1;
    if (gap > 100) g.__fps100 = (g.__fps100 ?? 0) + 1;
    if (gap > (g.__fpsWorst ?? 0)) g.__fpsWorst = gap;
    const dt = frame.timestamp - g.__fpsT;
    if (dt >= 500) {
      const fps = Math.round((g.__fpsN * 1000) / dt);
      const o50 = g.__fps50 ?? 0; const o100 = g.__fps100 ?? 0; const worst = Math.round(g.__fpsWorst ?? 0);
      g.__fpsT = frame.timestamp;
      g.__fpsN = 0; g.__fps50 = 0; g.__fps100 = 0; g.__fpsWorst = 0;
      runOnJS(pushUi)(fps, o50, o100, worst);
    }
  });

  useEffect(() => {
    let frames = 0;
    let start = Date.now();
    let raf = 0;
    const tick = () => {
      frames += 1;
      const now = Date.now();
      if (now - start >= 500) {
        const fps = Math.round((frames * 1000) / (now - start));
        setJs(fps);
        if (now - started.current > WARMUP_MS) jsSamples.current.push(fps);
        frames = 0;
        start = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <View pointerEvents="none" style={styles.box}>
      <Text style={styles.text}>UI {ui} fps (p5 {p5(uiSamples.current)})</Text>
      <Text style={styles.text}>JS {js} fps (p5 {p5(jsSamples.current)})</Text>
      <Text style={styles.text}>{uiSamples.current.length} samples</Text>
      <Text style={styles.text}>long UI frames: {long.over50} &gt;50ms, {long.over100} &gt;100ms, worst {long.worst}ms</Text>
      {typeof (globalThis as { __stampOpenMs?: number }).__stampOpenMs === 'number' && (
        <Text style={styles.text}>Stamp Book open {(globalThis as { __stampOpenMs?: number }).__stampOpenMs}ms</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', top: 54, right: 8, backgroundColor: 'rgba(5,52,110,0.85)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, zIndex: 9999 },
  text: { color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '700' },
});
