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
  return <PerfOverlay probe={probe} style={styles.at} />;
}

/** Whether the lane tools asked for the frame graph (dev builds only). */
export function loopPerfOn(): boolean {
  return __DEV__ && !!(globalThis as Record<string, unknown>).__loopsPerfOn;
}

const styles = StyleSheet.create({ at: { position: 'absolute', left: 6, bottom: 34, top: undefined, right: undefined } });
