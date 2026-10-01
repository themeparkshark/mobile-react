/**
 * PerfOverlay: the 60fps harness. Dev builds show a frame-time graph with UI
 * fps, fps p5 (the bad frames), JS fps and particle count; every build can
 * read the numbers for proof meta (fps_p5) via usePerfProbe().
 *
 *   const perf = usePerfProbe();          // UI-thread frame stats
 *   <PerfOverlay probe={perf} extra={() => `fx ${liveCount}`} />   // __DEV__ only
 *   onFinish(meta => ({ ...meta, fps_p5: perf.summary().fpsP5 }))
 *
 * The graph is one Skia path rebuilt on the UI thread from the stats ring;
 * the text updates at 4 Hz on JS. A 16.7 ms budget line is drawn in gold.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import {
  runOnJS,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  createFrameStats,
  recentFrames,
  recordFrame,
  summarize,
  type FrameStats,
  type PerfSummary,
} from '../core/perfStats';

export interface PerfProbe {
  stats: SharedValue<FrameStats>;
  tick: SharedValue<number>;
  /** Latest summary mirrored to JS (4 Hz). */
  summary: () => PerfSummary;
  jsFps: () => number;
  reset: () => void;
}

const EMPTY: PerfSummary = { fpsAvg: 0, fpsP5: 0, frameP95: 0, frameP99: 0, over16Pct: 0, worstMs: 0, frames: 0 };

export function usePerfProbe(enabled = true): PerfProbe {
  const stats = useSharedValue<FrameStats>(createFrameStats(240));
  const tick = useSharedValue(0);
  const acc = useSharedValue(0);
  const latest = useRef<PerfSummary>(EMPTY);
  const js = useRef({ frames: 0, since: Date.now(), fps: 0 });

  const publish = useMemo(() => (s: PerfSummary) => { latest.current = s; }, []);

  useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt == null) return;
    recordFrame(stats.value, dt);
    tick.value = tick.value + 1;
    acc.value += dt;
    if (acc.value >= 250) {
      acc.value = 0;
      runOnJS(publish)(summarize(stats.value));
    }
  }, enabled);

  useEffect(() => {
    if (!enabled) return undefined;
    let raf = 0;
    const loop = () => {
      const j = js.current;
      j.frames += 1;
      const now = Date.now();
      if (now - j.since >= 500) {
        j.fps = Math.round((j.frames * 1000) / (now - j.since));
        j.frames = 0;
        j.since = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return useMemo(() => ({
    stats,
    tick,
    summary: () => latest.current,
    jsFps: () => js.current.fps,
    reset: () => {
      stats.value = createFrameStats(240);
      latest.current = EMPTY;
    },
  }), [stats, tick]);
}

const W = 150;
const H = 44;
const FRAMES = 90;
const MAX_MS = 40;

export function PerfOverlay({ probe, extra, visible = __DEV__, style }: {
  probe: PerfProbe;
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
  /** Extra line (particles, sim ms, drift). */
  extra?: () => string;
  visible?: boolean;
}) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!visible) return undefined;
    const iv = setInterval(() => {
      const s = probe.summary();
      setText(`UI ${Math.round(s.fpsAvg)}  p5 ${Math.round(s.fpsP5)}  JS ${probe.jsFps()}\n` +
        `p95 ${s.frameP95}ms  >16.7 ${s.over16Pct}%${extra ? `\n${extra()}` : ''}`);
    }, 250);
    return () => clearInterval(iv);
  }, [probe, extra, visible]);

  const scratch = useSharedValue<number[]>([]);
  const path = useDerivedValue(() => {
    probe.tick.value;
    const frames = recentFrames(probe.stats.value, FRAMES, scratch.value);
    const p = Skia.Path.Make();
    for (let i = 0; i < frames.length; i++) {
      const x = (i / (FRAMES - 1)) * W;
      const y = H - Math.min(1, frames[i] / MAX_MS) * H;
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    return p;
  });
  if (!visible) return null;
  const budgetY = H - (16.7 / MAX_MS) * H;
  return (
    <View pointerEvents="none" style={[styles.panel, style]}>
      <Canvas style={{ width: W, height: H }}>
        <Line p1={vec(0, budgetY)} p2={vec(W, budgetY)} color="#ffcf3b" strokeWidth={1} />
        <Path path={path} style="stroke" strokeWidth={1.5} color="#ffffff" />
      </Canvas>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 110,
    right: 8,
    width: W + 12,
    padding: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(5,52,110,0.82)',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  text: { color: '#ffffff', fontSize: 10, fontFamily: 'Menlo', marginTop: 2 },
});
