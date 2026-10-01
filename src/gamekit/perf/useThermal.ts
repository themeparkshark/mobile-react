/**
 * useThermal: the sustained-performance ladder (core/thermal) on the UI thread.
 *
 *   const thermal = useThermal({ active: playing });
 *   const t = THERMAL_SCALES[thermal.levelJs];        // React side: parallax / caustics / mesh switches
 *   <FxStage capacity={Math.min(capacity, t.particleCap)} ... />
 *   // worklet: if (thermal.step60.value && (frame & 1)) return;   // commit every other vsync
 *   onRunEnd: thermal.runEnd();                        // may recover one step between runs
 *   proof.meta.hz = thermal.hz(); proof.meta.thermal = THERMAL_NAMES[thermal.levelJs];
 *
 * `setNative(level)` feeds ProcessInfo.thermalState when WS9's module exists;
 * without it the frame-time fallback runs. `force(level)` pins a level for the
 * MiniGameTester (-1 = auto).
 */

import { useCallback, useMemo, useState } from 'react';
import { runOnJS, runOnUI, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { createThermal, thermalFrame, thermalNative, thermalRunEnd, type ThermalConfig, type ThermalState } from '../core/thermal';

export interface ThermalHandle {
  level: SharedValue<number>;
  step60: SharedValue<boolean>;
  levelJs: number;
  state: SharedValue<ThermalState>;
  setNative: (level: number) => void;
  runEnd: () => void;
  force: (level: number) => void;
  hz: () => number;
}

export function useThermal(opts: { active?: boolean; config?: Partial<ThermalConfig>; onChange?: (level: number, step60: boolean) => void } = {}): ThermalHandle {
  const state = useSharedValue<ThermalState>(createThermal(opts.config));
  const level = useSharedValue(0);
  const step60 = useSharedValue(false);
  const forced = useSharedValue(-1);
  const [levelJs, setLevelJs] = useState(0);
  const onChange = opts.onChange;
  const publish = useCallback((l: number, s60: boolean) => {
    setLevelJs(l);
    onChange?.(l, s60);
  }, [onChange]);

  useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt == null || forced.value >= 0) return;
    if (thermalFrame(state.value, dt)) {
      level.value = state.value.level;
      step60.value = state.value.step60;
      runOnJS(publish)(state.value.level, state.value.step60);
    }
  }, opts.active !== false);

  const setNative = useCallback((l: number) => {
    runOnUI((v: number) => {
      'worklet';
      if (thermalNative(state.value, v)) {
        level.value = state.value.level;
        step60.value = state.value.step60;
        runOnJS(publish)(state.value.level, state.value.step60);
      }
    })(l);
  }, [state, level, step60, publish]);

  const runEnd = useCallback(() => {
    runOnUI(() => {
      'worklet';
      if (forced.value >= 0) return;
      thermalRunEnd(state.value);
      level.value = state.value.level;
      step60.value = state.value.step60;
      runOnJS(publish)(state.value.level, state.value.step60);
    })();
  }, [state, level, step60, forced, publish]);

  const force = useCallback((l: number) => {
    runOnUI((v: number) => {
      'worklet';
      forced.value = v;
      const next = v >= 0 ? v : state.value.level;
      level.value = next;
      step60.value = v >= 2 || (v < 0 && state.value.step60);
    })(l);
    publish(l >= 0 ? l : 0, l >= 2);
  }, [forced, state, level, step60, publish]);

  const hz = useCallback(() => state.value.hz, [state]);

  return useMemo(() => ({ level, step60, levelJs, state, setNative, runEnd, force, hz }), [level, step60, levelJs, state, setNative, runEnd, force, hz]);
}
