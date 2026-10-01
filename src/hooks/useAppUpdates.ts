import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * OTA update policy.
 *
 * Cold start: the native layer checks once (Expo.plist EXUpdatesCheckOnLaunch
 * ALWAYS, launch wait 0 ms), downloads in the background and applies the
 * update on the NEXT cold start. JS does not check again at launch.
 *
 * Long sessions: when the app returns to the foreground after a long time,
 * fetch at most once per FOREGROUND_CHECK_INTERVAL_MS. The download is applied
 * on the next cold start. The JS is never reloaded mid-session: a reload
 * drops queue-play state, and the old restart prompt crashed Fabric.
 */
export const FOREGROUND_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Internal tester builds (channel "internal-tunnel") pick up fixes within a minute of returning to the app. */
export const INTERNAL_FOREGROUND_CHECK_INTERVAL_MS = 60 * 1000;

export function foregroundCheckInterval(channel: string | null | undefined): number {
  return channel === 'internal-tunnel' ? INTERNAL_FOREGROUND_CHECK_INTERVAL_MS : FOREGROUND_CHECK_INTERVAL_MS;
}

export function shouldCheckOnForeground(lastCheckAt: number, now: number, inFlight: boolean, interval = FOREGROUND_CHECK_INTERVAL_MS): boolean {
  return !inFlight && now - lastCheckAt >= interval;
}

export async function fetchUpdateForNextLaunch(updates: Pick<typeof Updates, 'checkForUpdateAsync' | 'fetchUpdateAsync'>): Promise<boolean> {
  const check = await updates.checkForUpdateAsync();
  if (!check.isAvailable) return false;
  const result = await updates.fetchUpdateAsync();
  return result.isNew;
}

export function useAppUpdates() {
  // The native launch check counts as the first check of this session.
  const lastCheckAt = useRef(Date.now());
  const inFlight = useRef(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return undefined;
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (!shouldCheckOnForeground(lastCheckAt.current, now, inFlight.current, foregroundCheckInterval(Updates.channel))) return;
      lastCheckAt.current = now;
      inFlight.current = true;
      fetchUpdateForNextLaunch(Updates)
        .catch(() => false)
        .finally(() => {
          inFlight.current = false;
        });
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);
}
