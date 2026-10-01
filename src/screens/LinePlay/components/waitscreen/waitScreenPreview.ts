/**
 * Dev-only wait screen fixture (EXPO_PUBLIC_LINEPLAY_WAIT_PREVIEW=1 with the
 * LinePlay flow preview). Parts land every few seconds on a Level 2 coin until
 * it is ready, then it levels itself once, so simulator screenshots can catch
 * filling, ready and leveled without a backend. Never on in a release build.
 */
import { useEffect, useState } from 'react';
import type { LineWaitScreenSummary } from '../../../../api/endpoints/me/inline-timer/types';
import type { WaitCoin } from './useWaitScreenCoin';

export const waitScreenPreviewEnabled = (): boolean =>
  __DEV__ && process.env.EXPO_PUBLIC_LINEPLAY_WAIT_PREVIEW === '1';

/** Space Mountain's coin art as the server serves it. */
export const PREVIEW_WAIT_COIN: WaitCoin = {
  id: 1, rideName: 'Space Mountain',
  coinUrl: 'https://assets.themeparkshark.com/mobile/production/assets/r6pPIyzacnukCvbqkMqjqEB8BczIujFYwhc4YDYB.png',
  level: 2, maxLevel: 10, partsToNext: 4, energyToNext: 20, nextTierName: 'Gold', boss: null,
};

export const PREVIEW_STEP_MS = 10000;

/** 0, 1, 2, ... every PREVIEW_STEP_MS while the preview runs. */
export function usePreviewStep(enabled: boolean): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setStep(value => value + 1), PREVIEW_STEP_MS);
    return () => clearInterval(id);
  }, [enabled]);
  return step;
}

export function previewWaitScreen(step: number): LineWaitScreenSummary {
  return { coin_asset_id: 1, parts_banked: Math.min(4, 1 + step), in_line_now: 14, wait_ratio: 0.7, wait_ratio_samples: 23 };
}
