/**
 * useWalkSense: accelerometer step and walk detection (expo-sensors, 50 Hz,
 * no permission prompt). It never pauses anything. Games read it to calm the
 * camera, widen forgiveness and log `walking` in their proof.
 *
 *   const walk = useWalkSense({ active: phase === 'playing' });
 *   const cam = useCamera({ ..., walking: walk.walking });
 *   const radius = BASE_RADIUS * walkForgiveness(walk.state.current);
 *
 * Sensors run only while `active` (battery). React state changes only when
 * walking starts or stops; the jostle value is a SharedValue for worklets.
 */

import { useEffect, useRef, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { Accelerometer } from 'expo-sensors';
import {
  createWalkSense,
  walkSample,
  WALK_EV_START,
  WALK_EV_STEP,
  WALK_EV_STOP,
  type WalkSenseConfig,
  type WalkSenseState,
} from '../core/walkSense';

export interface WalkSenseOptions {
  active?: boolean;
  intervalMs?: number;
  config?: Partial<WalkSenseConfig>;
  onStep?: (steps: number) => void;
  onWalkChange?: (walking: boolean) => void;
}

export interface WalkSense {
  walking: boolean;
  walkingSv: SharedValue<number>;
  jostleSv: SharedValue<number>;
  state: React.MutableRefObject<WalkSenseState>;
}

export function useWalkSense(opts: WalkSenseOptions = {}): WalkSense {
  const { active = true, intervalMs = 20, config } = opts;
  const state = useRef<WalkSenseState>(createWalkSense(config));
  const [walking, setWalking] = useState(false);
  const walkingSv = useSharedValue(0);
  const jostleSv = useSharedValue(0);
  const cb = useRef(opts);
  cb.current = opts;

  useEffect(() => {
    if (!active) return undefined;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const ok = await Accelerometer.isAvailableAsync();
        if (!ok || cancelled) return;
        Accelerometer.setUpdateInterval(intervalMs);
        sub = Accelerometer.addListener(({ x, y, z }) => {
          const s = state.current;
          const ev = walkSample(s, Date.now(), x, y, z);
          jostleSv.value = s.jostle;
          if (ev & WALK_EV_STEP) cb.current.onStep?.(s.steps);
          if (ev & (WALK_EV_START | WALK_EV_STOP)) {
            walkingSv.value = s.walking ? 1 : 0;
            setWalking(s.walking);
            cb.current.onWalkChange?.(s.walking);
          }
        });
      } catch {
        // No sensor (simulator): stay "still".
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active, intervalMs, jostleSv, walkingSv]);

  return { walking, walkingSv, jostleSv, state };
}
