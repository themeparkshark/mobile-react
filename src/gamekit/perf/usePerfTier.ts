/**
 * usePerfTier: automatic full / lite / min quality tier on the UI thread.
 *
 *   const tier = usePerfTier({ active: playing, onChange: (t) => log('tier', t) });
 *   const scale = TIER_SCALES[tier.tierJs];            // React side (shader on/off)
 *   const n = tierCount(tier.tier.value, 16);           // worklet side (burst counts)
 *   proof.meta.perf_tier = TIER_NAMES[tier.tierJs];
 *
 * The first 60 frames after warm-up pick the tier (Current Quest: lite when
 * p95 > 14 ms); later it only steps down, with hysteresis. `force(t)` pins a
 * tier for the MiniGameTester.
 */

import { useCallback, useMemo, useState } from 'react';
import { runOnJS, runOnUI, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { createTierProbe, tierFrame, TIER_FULL, type TierConfig, type TierProbe } from '../core/perfTier';

export interface PerfTierHandle {
  /** UI-thread tier (0 full, 1 lite, 2 min). */
  tier: SharedValue<number>;
  /** Mirrored tier for React (re-renders only on change). */
  tierJs: number;
  probe: SharedValue<TierProbe>;
  /** Pin a tier (-1 = auto). */
  force: (t: number) => void;
}

export function usePerfTier(opts: { active?: boolean; config?: Partial<TierConfig>; start?: number; onChange?: (t: number) => void } = {}): PerfTierHandle {
  const probe = useSharedValue<TierProbe>(createTierProbe(opts.config, opts.start ?? TIER_FULL));
  const tier = useSharedValue(opts.start ?? TIER_FULL);
  const [tierJs, setTierJs] = useState(opts.start ?? TIER_FULL);
  const onChange = opts.onChange;
  const start = opts.start ?? TIER_FULL;
  const publish = useCallback((t: number) => {
    setTierJs(t);
    onChange?.(t);
  }, [onChange]);

  useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt == null) return;
    if (tierFrame(probe.value, dt)) {
      tier.value = probe.value.tier;
      runOnJS(publish)(probe.value.tier);
    }
  }, opts.active !== false);

  const force = useCallback((t: number) => {
    runOnUI((v: number) => {
      'worklet';
      probe.value.forced = v;
      if (v >= 0) {
        probe.value.tier = v;
        tier.value = v;
      } else {
        // Back to auto: re-measure from the start tier.
        const cfg = probe.value.cfg;
        probe.value = createTierProbe(cfg, start);
        tier.value = start;
      }
    })(t);
    publish(t >= 0 ? t : start);
  }, [probe, tier, publish, start]);

  return useMemo(() => ({ tier, tierJs, probe, force }), [tier, tierJs, probe, force]);
}
