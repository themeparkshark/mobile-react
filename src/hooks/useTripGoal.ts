import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { celebrateAdventureTicket, getTripGoal, setTripGoal, type TripGoalData } from '../api/endpoints/me/trip-goal';
import { AuthContext } from '../context/AuthProvider';

/** Reads and writes belong to one signed-in player; a slow read cannot undo their choice. */
export default function useTripGoal(refreshVersion = 0, enabled = true) {
  const { player } = useContext(AuthContext);
  const owner = enabled ? player?.id ?? null : null;
  const current = useRef(owner), mounted = useRef(false), generation = useRef(0);
  const latestRefresh = useRef<() => Promise<void>>(async () => undefined);
  const mutation = useRef(false), refreshPending = useRef(false);
  current.current = owner;
  const [frame, setFrame] = useState<{ owner: number; data: TripGoalData; stale: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  const refresh = useCallback(async () => {
    if (!owner) return;
    if (mutation.current) { refreshPending.current = true; return; }
    const request = ++generation.current;
    try {
      const data = await getTripGoal();
      if (mounted.current && current.current === owner && generation.current === request) setFrame({ owner, data, stale: false });
    } catch {
      if (mounted.current && current.current === owner && generation.current === request) {
        setFrame(old => old?.owner === owner ? { ...old, stale: true } : null);
      }
    }
  }, [owner]);
  latestRefresh.current = refresh;
  const change = useCallback(async (write: () => Promise<TripGoalData>): Promise<TripGoalData | null> => {
    if (!owner || mutation.current) return null;
    mutation.current = true; setBusy(true);
    const request = ++generation.current;
    try {
      const data = await write();
      if (!mounted.current || current.current !== owner || generation.current !== request) return null;
      setFrame({ owner, data, stale: false });
      return data;
    } finally {
      mutation.current = false;
      if (mounted.current) {
        setBusy(false);
        if (refreshPending.current) { refreshPending.current = false; void latestRefresh.current(); }
      }
    }
  }, [owner, refresh]);
  const choose = useCallback((taskId: number) => change(() => setTripGoal(taskId)), [change]);
  const data = frame?.owner === owner ? frame.data : null;
  const celebrate = useCallback((ticketId: number) => change(async () => {
    const ticket = await celebrateAdventureTicket(ticketId);
    // Keep the immutable server souvenir without introducing another read/write race.
    if (!data || data.adventure_ticket?.id !== ticket.id) throw new Error('Adventure changed. Refresh your ticket.');
    return { ...data, adventure_ticket: ticket };
  }), [change, data]);
  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { generation.current++; };
  }, [refresh, refreshVersion]));
  return { data, stale: frame?.owner === owner ? frame.stale : false, busy, refresh, choose, celebrate };
}
