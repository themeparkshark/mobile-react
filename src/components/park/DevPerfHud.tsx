/**
 * Dev-only frame graph for clips of the park day moments (EXPO_PUBLIC_PERF_HUD=1):
 * the gamekit PerfOverlay (UI fps, fps p5, JS fps and the frame-time graph) in a
 * corner, and the sampler perfMark() reads to log each moment's window. Renders
 * nothing (and records nothing) in any other build.
 */
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { PerfOverlay, usePerfProbe } from '../../gamekit/perf/PerfOverlay';
import { PERF_HUD, registerPerfSampler } from './momentPerf';

function Hud({ top, left }: { readonly top: number; readonly left: number }) {
  const probe = usePerfProbe(true);
  useEffect(() => {
    registerPerfSampler(() => {
      const s = probe.summary();
      return s.frames > 0 ? { fps: s.fpsAvg, fpsP5: s.fpsP5, worstMs: s.worstMs } : null;
    }, probe.reset);
    return () => registerPerfSampler(null, null);
  }, [probe]);
  return <PerfOverlay probe={probe} visible style={[styles.hud, { top, left }]} />;
}

export default function DevPerfHud({ top = 560, left = 112 }: { readonly top?: number; readonly left?: number }) {
  if (!PERF_HUD) return null;
  return <Hud top={top} left={left} />;
}

const styles = StyleSheet.create({ hud: { position: 'absolute', right: 'auto', zIndex: 999 } });
