import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { getTripGoal, setTripGoal, type TripGoalData } from '../api/endpoints/me/trip-goal';

export default function useTripGoal(refreshVersion = 0, enabled = true) {
  const [data, setData] = useState<TripGoalData | null>(null);
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await getTripGoal());
      setStale(false);
    } catch {
      // The last confirmed goal can still orient a guest, if labelled as such.
      setStale(true);
    }
  }, []);

  const choose = useCallback(async (taskId: number) => {
    const next = await setTripGoal(taskId);
    setData(next);
    setStale(false);
    return next;
  }, []);

  useFocusEffect(useCallback(() => { if (enabled) void refresh(); }, [enabled, refresh, refreshVersion]));
  return { data, stale, refresh, choose };
}
