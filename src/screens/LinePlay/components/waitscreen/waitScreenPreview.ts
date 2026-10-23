/**
 * Dev-only wait screen fixture (EXPO_PUBLIC_LINEPLAY_WAIT_PREVIEW=1 with the
 * LinePlay flow preview). Parts land every few seconds on a Level 2 coin until
 * it is ready, then it levels itself once, so simulator screenshots can catch
 * filling, ready and leveled without a backend. Never on in a release build.
 */
import { useEffect, useState } from 'react';
import type { LineWaitScreenSummary } from '../../../../api/endpoints/me/inline-timer/types';
import type { WaitCoin } from './useWaitScreenCoin';
import type { WaitSource } from '../../../../services/lineplay/LinePlaySession';

/** The preview's sign time when the session has none: a posted 60. */
export const PREVIEW_WAIT = { plannedWaitMinutes: 60, waitSource: 'posted' } as const;

/**
 * The sign time the wait card AND its hero show: the session's, or the
 * preview's in the dev preview. Both read this one value, so the SIGN SAYS
 * number and the details line can never disagree.
 */
export function shownWait(session: { readonly plannedWaitMinutes: number; readonly waitSource: WaitSource }):
  { readonly plannedWaitMinutes: number; readonly waitSource: WaitSource } {
  // The preview keeps a real sign time (so it matches "The sign at the line says ..."); it only fills in a missing one.
  return waitScreenPreviewEnabled() && session.waitSource === 'estimate' ? PREVIEW_WAIT
    : { plannedWaitMinutes: session.plannedWaitMinutes, waitSource: session.waitSource };
}

export const waitScreenPreviewEnabled = (): boolean =>
  __DEV__ && process.env.EXPO_PUBLIC_LINEPLAY_WAIT_PREVIEW === '1';

/** Space Mountain's coin art as the server serves it. */
export const PREVIEW_WAIT_COIN: WaitCoin = {
  id: 1, rideName: 'Space Mountain',
  coinUrl: 'https://assets.themeparkshark.com/mobile/production/assets/r6pPIyzacnukCvbqkMqjqEB8BczIujFYwhc4YDYB.png',
  level: 2, maxLevel: 10, partsToNext: 4, energyToNext: 20, nextTierName: 'Gold', boss: null,
};

export const PREVIEW_STEP_MS = 10000;

/** When this app run's preview clock started (a saved preview session can be hours old). */
const PREVIEW_T0 = Date.now();
/** The preview's wait stops growing here: 20 + 6 x 12 = 92 minutes, past the Marathon mark. */
export const PREVIEW_MAX_STEPS = 6;

/**
 * The preview's time in line, from seconds since the preview started: 20
 * minutes, then 12 more every PREVIEW_STEP_MS, up to 1h 32m, with the
 * seconds still ticking.
 */
export function previewElapsedSeconds(realSeconds: number): number {
  const s = Math.max(0, Math.floor(realSeconds));
  return (20 + Math.min(PREVIEW_MAX_STEPS, Math.floor((s * 1000) / PREVIEW_STEP_MS)) * 12) * 60 + (s % 60);
}

export interface ShownClock {
  readonly elapsedSeconds: number;
  readonly verifiedEligibleSeconds: number;
  readonly verifiedPresenceAt: number | null;
  readonly creditedParts: number | null;
}

/** The preview's Parts so far this wait: 1, then one more every step, up to 4 (a full Level 2 coin). */
export function previewCreditedParts(realSeconds: number): number {
  return 1 + Math.min(3, Math.floor((Math.max(0, realSeconds) * 1000) / PREVIEW_STEP_MS));
}

/**
 * The one clock the wait card AND its hero read: time in line, the
 * server-checked time near the ride and the Parts it has earned. In the dev preview both run on the
 * preview's fast clock and count as checked just now, so a capture shows the
 * real live state (a running countdown, the Marathon mark past an hour)
 * instead of "Time near the ride: 0:00" beside 1h 32m in line.
 */
export function shownClock(
  session: { readonly elapsedSeconds: number; readonly verifiedEligibleSeconds: number; readonly verifiedPresenceAt: number | null;
    readonly creditedParts: number | null },
  now: number = Date.now(),
): ShownClock {
  if (!waitScreenPreviewEnabled()) {
    return { elapsedSeconds: session.elapsedSeconds, verifiedEligibleSeconds: session.verifiedEligibleSeconds,
      verifiedPresenceAt: session.verifiedPresenceAt, creditedParts: session.creditedParts };
  }
  const real = (now - PREVIEW_T0) / 1000;
  const elapsed = previewElapsedSeconds(real);
  return { elapsedSeconds: elapsed, verifiedEligibleSeconds: elapsed, verifiedPresenceAt: now, creditedParts: previewCreditedParts(real) };
}

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

/**
 * Whether this wait earns Ride Parts, for the wait card and its hero alike:
 * the session's answer, or "yes" in the dev preview (which fills a coin), so
 * the card never says "No Parts at this ride" beside a filling Parts ring.
 */
export function shownRewards(
  session: { readonly serverSessionId: unknown; readonly rewardUnavailable: boolean },
  ride: { readonly lineRewardsReady?: boolean },
): { readonly tracking: boolean; readonly unavailable: boolean; readonly ready: boolean | undefined } {
  return waitScreenPreviewEnabled() ? { tracking: true, unavailable: false, ready: true }
    : { tracking: session.serverSessionId != null, unavailable: session.rewardUnavailable, ready: ride.lineRewardsReady };
}

export function previewWaitScreen(step: number): LineWaitScreenSummary {
  return { coin_asset_id: 1, parts_banked: Math.min(4, 1 + step), in_line_now: 14, wait_ratio: 0.7, wait_ratio_samples: 23 };
}
