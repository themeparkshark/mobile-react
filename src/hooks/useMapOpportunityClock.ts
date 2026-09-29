import { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { AppState } from 'react-native';
import { nextOpportunityRefresh, type TimedOpportunity } from '../screens/ExploreScreen/mapOpportunityTiming';

/** Timed map opportunities keep turning over even when the player stands still. */
export default function useMapOpportunityClock(
  items: readonly TimedOpportunity[],
  refresh: () => Promise<unknown>,
  enabled: boolean,
) {
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  const active = enabled && focused && foreground;
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    void refresh().catch(() => undefined);
  }, [active, refresh]);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      setNow(Date.now());
      void refresh().catch(() => undefined);
    }, nextOpportunityRefresh(items));
    return () => clearTimeout(timer);
  }, [active, items, now, refresh]);
  return now;
}
