import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getNightShow } from '../../../api/endpoints/parks/nightShow';
import { showPhase, showTimes, type NightShow, type ShowPhase } from './nightShow';

/**
 * Tonight's night show for the park on the map: fetched when the park changes,
 * refreshed every 20 minutes and right after a performance ends (for the next
 * one), only while the map is on screen and the app is open.
 */
export default function useNightShow(parkId: number | null, active: boolean): { show: NightShow | null; phase: ShowPhase } {
  const [show, setShow] = useState<NightShow | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [version, setVersion] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  const on = active && foreground && parkId !== null;

  useEffect(() => { setShow(null); }, [parkId]);
  useEffect(() => {
    if (!on || parkId === null) return;
    let current = true;
    void getNightShow(parkId).then(next => { if (current) setShow(next); });
    const timer = setInterval(() => setVersion(value => value + 1), 20 * 60_000);
    return () => { current = false; clearInterval(timer); };
  }, [on, parkId, version]);

  // Phase clock: every 15 s, and exactly at the start and end.
  useEffect(() => {
    if (!on || !show) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    const times = showTimes(show);
    const edges = times ? [times.start, times.end].map(at => at - Date.now()).filter(ms => ms > 0 && ms < 2 ** 31 - 1) : [];
    const edgeTimers = edges.map(ms => setTimeout(() => setNow(Date.now()), ms + 50));
    return () => { clearInterval(timer); edgeTimers.forEach(clearTimeout); };
  }, [on, show]);

  const phase = showPhase(show, now);
  // After the show, look for a later performance.
  useEffect(() => {
    if (phase === 'done' && on) setVersion(value => value + 1);
  }, [phase, on]);
  return { show, phase };
}
