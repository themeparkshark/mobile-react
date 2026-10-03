/**
 * Dev only (EXPO_PUBLIC_FPS_OVERLAY=1): UI-thread and JS-thread frames per
 * second, sampled every 500 ms, for performance captures.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { runOnJS, useFrameCallback } from 'react-native-reanimated';

export default function FpsOverlay() {
  const [ui, setUi] = useState(0);
  const [js, setJs] = useState(0);
  const [minUi, setMinUi] = useState(120);
  const [minJs, setMinJs] = useState(120);

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
      runOnJS(setUi)(fps);
    }
  });

  useEffect(() => {
    let frames = 0;
    let start = Date.now();
    let raf = 0;
    const tick = () => {
      frames += 1;
      const now = Date.now();
      if (now - start >= 500) { setJs(Math.round((frames * 1000) / (now - start))); frames = 0; start = now; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => { if (ui > 0) setMinUi(m => Math.min(m, ui)); }, [ui]);
  useEffect(() => { if (js > 0) setMinJs(m => Math.min(m, js)); }, [js]);

  return (
    <View pointerEvents="none" style={styles.box}>
      <Text style={styles.text}>UI {ui} fps (min {minUi})</Text>
      <Text style={styles.text}>JS {js} fps (min {minJs})</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', top: 54, right: 8, backgroundColor: 'rgba(5,52,110,0.85)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, zIndex: 9999 },
  text: { color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '700' },
});
