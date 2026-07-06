/**
 * useLinePlaySession — React binding for the LinePlaySession controller.
 *
 * Owns a single LinePlaySession instance for the lifetime of the hook, keeps a
 * live snapshot in state, and feeds the session location samples from the
 * shared LocationContext (NO new watcher — we consume the context's `location`
 * value that LocationProvider already streams).
 */

import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LocationContext } from '../../context/LocationProvider';
import {
  LinePlaySession,
  SessionSnapshot,
} from './LinePlaySession';

export interface UseLinePlaySession {
  readonly session: LinePlaySession;
  readonly snapshot: SessionSnapshot;
}

export function useLinePlaySession(): UseLinePlaySession {
  // One controller instance per hook mount.
  const session = useMemo(() => new LinePlaySession(), []);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => session.snapshot());
  const { location } = useContext(LocationContext);
  const lastFedRef = useRef<{ lat: number; lng: number } | null>(null);

  // Subscribe to controller snapshots.
  useEffect(() => {
    const unsub = session.subscribe(setSnapshot);
    return () => {
      unsub();
      session.dispose();
    };
  }, [session]);

  // Feed the shared location stream into the session for auto-pause detection.
  useEffect(() => {
    if (!location) return;
    const prev = lastFedRef.current;
    if (prev && prev.lat === location.latitude && prev.lng === location.longitude) {
      return; // debounce identical coords
    }
    lastFedRef.current = { lat: location.latitude, lng: location.longitude };
    session.ingestLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: Date.now(),
    });
  }, [session, location?.latitude, location?.longitude]);

  return { session, snapshot };
}
