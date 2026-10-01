/**
 * useGyroParallax: device attitude to a low-passed parallax offset on the UI
 * thread (expo-sensors DeviceMotion, no permission prompt on iOS for attitude).
 *
 *   const par = useGyroParallax({ active: playing, enabled: !walk.walking && !reducedMotion });
 *   const backdrop = useDerivedValue(() => [{ translateX: par.x.value * 0.25 }, { translateY: par.y.value * 0.25 }]);
 *
 * Walking (QUEUE REALITY) or reduced motion eases the world back to centre;
 * it never pauses anything.
 */

import { useEffect } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { DeviceMotion } from 'expo-sensors';
import { createParallax, stepParallax, type ParallaxConfig, type ParallaxState } from '../core/parallax';

export interface GyroParallaxOptions {
  active?: boolean;
  /** False while walking, in reduced motion or on a low thermal tier. */
  enabled?: boolean;
  config?: Partial<ParallaxConfig>;
  intervalMs?: number;
  /** Feed attitude from elsewhere (tester, recorded traces, the simulator) instead of the sensor. */
  source?: { pitch: SharedValue<number>; roll: SharedValue<number> };
}

export interface GyroParallax {
  x: SharedValue<number>;
  y: SharedValue<number>;
  state: SharedValue<ParallaxState>;
}

export function useGyroParallax(opts: GyroParallaxOptions = {}): GyroParallax {
  const { active = true, enabled = true, config, intervalMs = 33, source } = opts;
  const state = useSharedValue<ParallaxState>(createParallax(config));
  const pitch = useSharedValue(0);
  const roll = useSharedValue(0);
  const on = useSharedValue(enabled ? 1 : 0);
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  useEffect(() => {
    on.value = enabled ? 1 : 0;
  }, [enabled, on]);

  useEffect(() => {
    if (!active || source) return undefined;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const ok = await DeviceMotion.isAvailableAsync();
        if (!ok || cancelled) return;
        DeviceMotion.setUpdateInterval(intervalMs);
        sub = DeviceMotion.addListener((m) => {
          const r = m.rotation;
          if (!r) return;
          pitch.value = r.beta;
          roll.value = r.gamma;
        });
      } catch {
        // No sensor (simulator): parallax stays at 0.
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active, intervalMs, pitch, roll, source]);

  useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt == null) return;
    const s = state.value;
    const p = source ? source.pitch.value : pitch.value;
    const r = source ? source.roll.value : roll.value;
    stepParallax(s, p, r, dt > 50 ? 50 : dt, on.value === 1);
    x.value = s.x;
    y.value = s.y;
  }, active);

  return { x, y, state };
}
