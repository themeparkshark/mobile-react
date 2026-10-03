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

function p5(samples: number[]): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.05)];
}

export default function FpsOverlay() {
  const started = useRef(Date.now());
  const [ui, setUi] = useState(0);
  const [js, setJs] = useState(0);
  const uiSamples = useRef<number[]>([]);
  const jsSamples = useRef<number[]>([]);

  const pushUi = (fps: number) => {
    setUi(fps);
    if (Date.now() - started.current > WARMUP_MS) uiSamples.current.push(fps);
  };

  useFrameCallback(frame => {
    'worklet';
    const g = globalThis as unknown as { __fpsT?: number; __fpsN?: number };
    if (g.__fpsT == null) { g.__fpsT = frame.timestamp; g.__fpsN = 0; }
    g.__fpsN = (g.__fpsN ?? 0) + 1;
    const dt = frame.timestamp - g.__fpsT;
    if (dt >= 500) {
      const fps = Math.round((g.__fpsN * 1000) / dt);
      g.__fpsT = frame.timestamp;
      g.__fpsN = 0;
      runOnJS(pushUi)(fps);
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
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', top: 54, right: 8, backgroundColor: 'rgba(5,52,110,0.85)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, zIndex: 9999 },
  text: { color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '700' },
});
