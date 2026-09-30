import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import type { AdventureTicket } from '../../api/endpoints/me/trip-goal';
import { adventureStamps, newlyEarnedStamps } from './adventureTicketPresentation';

const KEY = 'adventure_seen_stamps';

/**
 * Remembers which stamps the player has already seen on the map, per ticket.
 * The first map focus after a new stamp returns its index so the chip can play
 * the slam; markSeen() records it. A brand-new ticket starts as "seen" so the
 * stamps it arrived with do not replay.
 */
export default function useAdventureStampMoment(ticket: AdventureTicket | null, available: boolean) {
  const [seen, setSeen] = useState<{ id: number; stamps: boolean[] } | null>(null);
  const [ready, setReady] = useState(false);
  const stamps = ticket ? adventureStamps(ticket) : null;
  const key = stamps ? stamps.join(',') : '';

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(KEY).then(raw => {
      if (!active) return;
      setReady(true);
      try { setSeen(raw ? JSON.parse(raw) : null); } catch { setSeen(null); }
    }).catch(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const write = useCallback((id: number, value: boolean[]) => {
    setSeen({ id, stamps: value });
    void SecureStore.setItemAsync(KEY, JSON.stringify({ id, stamps: value })).catch(() => undefined);
  }, []);

  // A ticket this device never saw starts from what it already has.
  useEffect(() => {
    if (!ticket || !stamps || !ready) return;
    if (!seen || seen.id !== ticket.id) write(ticket.id, stamps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id, key, seen?.id, ready, write]);

  const slam = ticket && stamps && available && seen?.id === ticket.id ? newlyEarnedStamps(seen.stamps, stamps) : [];
  const markSeen = useCallback(() => { if (ticket && stamps) write(ticket.id, stamps); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticket?.id, key, write]);
  return { slam, markSeen };
}
