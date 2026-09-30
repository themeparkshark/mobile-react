import { Profiler, type ComponentType, type ProfilerOnRenderCallback } from 'react';

/**
 * Development-only render trace for the map (EXPO_PUBLIC_WS2_PROFILE=1): logs
 * every ExploreScreen commit with its phase and duration, so a GPS or heading
 * tick can be counted in the Metro log. Never active in release builds.
 */
const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
  console.log(`[ws2-profiler] ${id} ${phase} actual=${actualDuration.toFixed(1)}ms base=${baseDuration.toFixed(1)}ms at=${commitTime.toFixed(0)}`);
};

export function ws2ProfilerEnabled(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_WS2_PROFILE === '1';
}

export function withWs2Profiler<P extends object>(Component: ComponentType<P>, id: string): ComponentType<P> {
  if (!ws2ProfilerEnabled()) return Component;
  const Profiled = (props: P) => <Profiler id={id} onRender={onRender}><Component {...props} /></Profiler>;
  Profiled.displayName = `Ws2Profiler(${id})`;
  return Profiled;
}
