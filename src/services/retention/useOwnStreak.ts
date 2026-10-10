import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getDailyThree, type DailyThreePayload } from '../../api/endpoints/retention';

/** The own Daily 3 streak for the Profile flame, or null while the flag is off, the route 404s or it has not loaded. */
export function ownStreakOf(payload: DailyThreePayload | null | undefined): { readonly days: number; readonly best: number } | null {
  if (!payload || !payload.enabled || !('streak' in payload) || !payload.streak) return null;
  const days = Number(payload.streak.days) || 0;
  const best = Number(payload.streak.best) || 0;
  return { days, best };
}

/** Reads `/me/daily-three` once per focus of the host screen; errors (old server) leave it null. */
export default function useOwnStreak(enabled = true) {
  const [streak, setStreak] = useState<{ readonly days: number; readonly best: number } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!enabled) return undefined;
    let live = true;
    void getDailyThree().then(p => { if (live) setStreak(ownStreakOf(p)); }).catch(() => undefined);
    return () => { live = false; };
  }, [enabled]));
  return streak;
}
