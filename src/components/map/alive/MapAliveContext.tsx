/**
 * One ambient clock for the whole living map.
 *
 * Every idle loop on the map (bobbing coins, wait glows, glints, clouds, birds)
 * derives its motion from this single shared value instead of running its own
 * animation, so pausing the map is one switch: the clock stops when the map
 * tab is out of focus, the app is in the background, a full-screen flow covers
 * the map, or Reduce Motion is on. A frame governor watches UI-thread frame
 * times and drops to the `lite` tier (30 Hz, fewer sprites) when the phone
 * struggles, and to `calm` if even that is too much.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { makeMutable, runOnJS, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import {
  ALIVE_CAPS, aliveTier, clockStepDue, governFrames, governIdle, GOVERNOR_START,
  type AliveCaps, type AliveTier, type FrameGovernor,
} from './ambientBudget';
import { soakLog, SOAK_TRACE } from '../declutter/soakLog';
import { DAYLIGHT, type SkyLight } from './skyLight';

export interface MapAlive {
  /** Seconds of ambient time; frozen while the map is paused or calm. */
  readonly clock: SharedValue<number>;
  readonly tier: AliveTier;
  readonly caps: AliveCaps;
  /** The clock is ticking right now. */
  readonly running: boolean;
  /**
   * The map is on screen in a foreground app, whatever the tier. Live UI that
   * is information rather than ambience (countdowns, Rush sparkle) runs on this.
   */
  readonly active: boolean;
  readonly reducedMotion: boolean;
  /** Time-of-day lighting for the park (golden hour, dusk, night lamps). */
  readonly light: SkyLight;
}

const STILL: MapAlive = {
  clock: makeMutable(0), tier: 'calm', caps: ALIVE_CAPS.calm, running: false, active: false, reducedMotion: true, light: DAYLIGHT,
};

export const MapAliveContext = createContext<MapAlive>(STILL);

/** The living map's clock, tier and light. Outside a map it is a still, calm default. */
export function useMapAlive(): MapAlive {
  return useContext(MapAliveContext);
}

const WINDOW_MS = 2000;

/** Drives the ambient clock for one map. `focused` and `paused` come from the screen. */
export function useMapAliveEngine({ focused, paused, frozen = false, light }: {
  readonly focused: boolean;
  readonly paused: boolean;
  /**
   * A short cover (a catch over the map) only stops the clock. Unlike `paused`, it never changes the
   * context value, so no consumer re-renders and no ambient canvas or marker unmounts under it.
   */
  readonly frozen?: boolean;
  readonly light: SkyLight;
}): MapAlive {
  const reducedMotion = useReducedGameMotion();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  // The governor's counters change every 2 s window; only its strain changes
  // what renders. Counters live in a ref so a healthy map does not re-render
  // (with every marker under it) 30 times a minute.
  const governorRef = useRef<FrameGovernor>(GOVERNOR_START);
  const [governor, setGovernorState] = useState<FrameGovernor>(GOVERNOR_START);
  const setGovernor = useCallback((update: (state: FrameGovernor) => FrameGovernor) => {
    const next = update(governorRef.current);
    const strainChanged = next.strain !== governorRef.current.strain;
    governorRef.current = next;
    if (strainChanged) setGovernorState(next);
  }, []);
  // Development QA on a loaded simulator can pin the tier (EXPO_PUBLIC_MAP_ALIVE_TIER=full|lite); Reduce Motion still wins.
  const pinned = __DEV__ ? process.env.EXPO_PUBLIC_MAP_ALIVE_TIER : undefined;
  const governed = aliveTier({ reducedMotion, strain: governor.strain });
  const tier: AliveTier = !reducedMotion && (pinned === 'full' || pinned === 'lite') ? pinned : governed;
  const caps = ALIVE_CAPS[tier];
  const active = focused && appActive;
  const running = active && !paused && caps.hz > 0;

  // A calm phone (strain 2) has no clock to measure; probe lite again after a rest.
  useEffect(() => {
    if (governor.strain !== 2) return;
    const timer = setInterval(() => setGovernor(state => governIdle(state, Date.now())), 15_000);
    return () => clearInterval(timer);
  }, [governor.strain, setGovernor]);

  const windows = useRef(0);
  const onWindow = useCallback((avgMs: number) => {
    if (__DEV__ && ++windows.current % 5 === 0) console.log(`MAP_ALIVE fps=${(1000 / avgMs).toFixed(1)} frame=${avgMs.toFixed(1)}ms`);
    // UI-thread frame time (the ambient clock's 2 s window), for the Release soak trace.
    if (SOAK_TRACE) soakLog(`perf ui_frame_ms=${avgMs.toFixed(1)}`);
    setGovernor(state => governFrames(state, avgMs, Date.now()));
  }, [setGovernor]);

  const clock = useSharedValue(0);
  const elapsed = useSharedValue(0);
  const frames = useSharedValue(0);
  // Seconds between clock updates. Time based, not frame counted: with
  // ProMotion enabled (CADisableMinimumFrameDurationOnPhone) frames arrive at
  // 120 Hz, and "every other frame" would still be 60 updates a second.
  const stepS = useSharedValue(caps.hz > 0 ? 1 / caps.hz : 0);
  const sinceStep = useSharedValue(0);
  const windowSum = useSharedValue(0);
  const windowFrames = useSharedValue(0);
  useEffect(() => { stepS.value = caps.hz > 0 ? 1 / caps.hz : 0; }, [caps.hz, stepS]);

  const frame = useFrameCallback(info => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt === null || dt <= 0) return;
    // A long gap means the loop was paused: never jump the scene forward.
    const step = Math.min(dt, 100) / 1000;
    elapsed.value += step;
    frames.value += 1;
    sinceStep.value += step;
    if (clockStepDue(sinceStep.value, stepS.value)) {
      sinceStep.value = 0;
      clock.value = elapsed.value;
    }
    if (dt < 250) {
      windowSum.value += dt;
      windowFrames.value += 1;
    }
    if (windowSum.value >= WINDOW_MS) {
      runOnJS(onWindow)(windowSum.value / windowFrames.value);
      windowSum.value = 0;
      windowFrames.value = 0;
    }
  }, false);

  useEffect(() => {
    windowSum.value = 0;
    windowFrames.value = 0;
    frame.setActive(running && !frozen);
    return () => frame.setActive(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, frozen]);

  return useMemo(() => ({ clock, tier, caps, running, active, reducedMotion, light }),
    [clock, tier, caps, running, active, reducedMotion, light]);
}

export function MapAliveProvider({ value, children }: { readonly value: MapAlive; readonly children: ReactNode }) {
  return <MapAliveContext.Provider value={value}>{children}</MapAliveContext.Provider>;
}
