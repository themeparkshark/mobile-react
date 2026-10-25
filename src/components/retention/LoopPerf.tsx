import { StyleSheet } from 'react-native';
import { useEffect } from 'react';
import { PerfOverlay, usePerfProbe } from '../../gamekit/perf/PerfOverlay';

/**
 * Dev only: the frame graph over a daily-loop moment (UI fps, fps p5, JS fps), for clip proof. Mounted only
 * when a lane tool turns it on (it never ships on screen), and it reports its numbers to the lane tools through
 * globalThis.__loopsPerf (summary, reset).
 */
export default function LoopPerf() {
  const probe = usePerfProbe(true);
  useEffect(() => {
    const g = globalThis as Record<string, unknown>;
    g.__loopsPerf = { summary: () => probe.summary(), reset: () => probe.reset() };
    return () => { delete g.__loopsPerf; };
  }, [probe]);
  return <PerfOverlay probe={probe} visible style={styles.at} />;
}

/**
 * Release-like frame-time captures only (EXPO_PUBLIC_LOOPS_PERF=1 with `expo start --no-dev`, the lane's perf
 * simulator): store builds never set it, so it folds away and the graph never ships on screen.
 */
export const LOOPS_PERF_CAPTURE = process.env.EXPO_PUBLIC_LOOPS_PERF === '1';

/** Whether the lane tools asked for the frame graph (dev builds, or a release-like perf capture). */
export function loopPerfOn(): boolean {
  return LOOPS_PERF_CAPTURE || (__DEV__ && !!(globalThis as Record<string, unknown>).__loopsPerfOn);
}

const styles = StyleSheet.create({ at: { position: 'absolute', left: 6, bottom: 34, top: undefined, right: undefined } });
