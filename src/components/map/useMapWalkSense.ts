import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { createWalkSense, walkSample, WALK_EV_START, WALK_EV_STOP, type WalkSenseConfig } from '../../gamekit/core/walkSense';

/**
 * The map's step sensor: the gamekit walk detector (gamekit/core/walkSense.ts) with nothing extra. No React
 * state and no shared values (the map only needs the start and stop edges), so a sample costs a few
 * multiplies on JS and nothing renders. Runs only while `active` (the map on screen, the app in front).
 */
export function useMapWalkSense(active: boolean, intervalMs: number, config: Partial<WalkSenseConfig>, onWalkChange: (walking: boolean) => void): void {
  const cb = useRef(onWalkChange);
  cb.current = onWalkChange;
  useEffect(() => {
    if (!active) return undefined;
    const state = createWalkSense(config);
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!(await Accelerometer.isAvailableAsync()) || cancelled) return;
        Accelerometer.setUpdateInterval(intervalMs);
        sub = Accelerometer.addListener(({ x, y, z }) => {
          const ev = walkSample(state, Date.now(), x, y, z);
          if (ev & (WALK_EV_START | WALK_EV_STOP)) cb.current(state.walking);
        });
      } catch {
        // No sensor (a simulator): the follower runs on GPS alone.
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
      // Leaving the map: whatever the shark was doing, it is not walking any more.
      if (state.walking) cb.current(false);
    };
  }, [active, intervalMs]); // eslint-disable-line react-hooks/exhaustive-deps
}
