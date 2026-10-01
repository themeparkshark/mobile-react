/**
 * useLinePlaySession — React binding for the LinePlaySession controller.
 *
 * Owns a single LinePlaySession instance for the lifetime of the hook, keeps a
 * live snapshot in state, and feeds the session location samples from the
 * shared LocationContext (NO new watcher — we consume the context's `location`
 * value that LocationProvider already streams).
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { LocationContext } from '../../context/LocationProvider';
import { setLinePlayDetectionRide } from '../RideDetectionService';
import {
  LinePlaySession,
  SessionSnapshot,
  isRecentQueueSample,
} from './LinePlaySession';

export interface UseLinePlaySession {
  readonly session: LinePlaySession;
  readonly snapshot: SessionSnapshot;
}

export function useLinePlaySession(): UseLinePlaySession {
  // One controller instance per hook mount.
  const session = useMemo(() => new LinePlaySession(), []);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => session.snapshot());
  const { location, latestLocationSampleRef, setAccuracyMode } = useContext(LocationContext);
  const queueTracking = snapshot.state === 'active' || snapshot.state === 'paused' || snapshot.state === 'ending';
  const lastFedRef = useRef<{ lat: number; lng: number } | null>(null);
  const positionRequestInFlightRef = useRef(false);
  const lastPositionRequestAtRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const requestFreshQueuePosition = useCallback((): boolean => {
    if (AppState.currentState !== 'active' || positionRequestInFlightRef.current ||
        Date.now() - lastPositionRequestAtRef.current < 45_000) return false;
    positionRequestInFlightRef.current = true;
    lastPositionRequestAtRef.current = Date.now();
    void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      .then(position => {
        if (!mountedRef.current) return;
        const sample = { latitude: position.coords.latitude, longitude: position.coords.longitude,
          timestamp: position.timestamp, accuracyMeters: position.coords.accuracy,
          speedMps: position.coords.speed };
        if (!isRecentQueueSample(sample)) return;
        session.ingestLocation(sample);
        return session.heartbeat(sample);
      })
      .catch(() => undefined)
      .finally(() => {
        positionRequestInFlightRef.current = false;
        if (mountedRef.current) void session.refreshSharedState();
      });
    return true;
  }, [session]);

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
    const raw = latestLocationSampleRef.current;
    if (!isRecentQueueSample(raw)) return;
    const prev = lastFedRef.current;
    if (prev && prev.lat === raw.latitude && prev.lng === raw.longitude) {
      return; // debounce identical coords
    }
    lastFedRef.current = { lat: raw.latitude, lng: raw.longitude };
    session.ingestLocation(raw);
  }, [session, latestLocationSampleRef, location?.latitude, location?.longitude]);

  // Ride detection logs the LinePlay ride, not a neighbor whose zone overlaps
  // the queue. Ending the session (or leaving this screen) keeps it for the
  // visit in progress, so riding right after "I reached boarding" still counts.
  const linePlayRideId = queueTracking ? snapshot.ride?.rideId ?? null : null;
  useEffect(() => {
    if (linePlayRideId == null) return;
    setLinePlayDetectionRide(linePlayRideId);
    return () => setLinePlayDetectionRide(null);
  }, [linePlayRideId]);

  // Do not make a stationary guest wait for the 30-second heartbeat before
  // attempting a verified session when the launch sample is stale or missing.
  useEffect(() => {
    if (!queueTracking || snapshot.serverSessionId ||
        isRecentQueueSample(latestLocationSampleRef.current)) return;
    requestFreshQueuePosition();
  }, [queueTracking, snapshot.serverSessionId, latestLocationSampleRef, requestFreshQueuePosition]);

  // The server credits time between nearby samples, capped at 90 seconds.
  // Use raw OS fixes so a stationary guest can be credited without treating
  // old coordinates as ongoing presence when the watcher stops reporting.
  useEffect(() => {
    if (snapshot.state !== 'active' && snapshot.state !== 'paused' && snapshot.state !== 'ending') return;
    const timer = setInterval(() => {
      const latest = latestLocationSampleRef.current;
      if (isRecentQueueSample(latest)) {
        void session.heartbeat(latest).finally(() => session.refreshSharedState());
        return;
      }
      // Stationary iOS location watchers may suppress callbacks. Ask for one
      // fresh fix at a bounded rate; if unavailable, refresh shared play only.
      if (!requestFreshQueuePosition()) {
        void session.refreshSharedState();
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [session, snapshot.state, requestFreshQueuePosition]);

  // JS timers may be suspended while the phone is locked. On return, get a
  // fresh coordinate immediately; an old pre-lock coordinate must not stand
  // in for current queue presence. The server reconciles elapsed time from
  // the background samples it actually received.
  useEffect(() => {
    if (!queueTracking) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        .then(position => {
          const sample = { latitude: position.coords.latitude,
            longitude: position.coords.longitude, timestamp: position.timestamp,
            accuracyMeters: position.coords.accuracy, speedMps: position.coords.speed };
          if (isRecentQueueSample(sample)) return session.heartbeat(sample);
        })
        .catch(() => undefined)
        .finally(() => { void session.refreshSharedState(); });
    });
    return () => subscription.remove();
  }, [queueTracking, session]);

  // The shared watcher can use a lower-power mode for a stationary wait.
  // Restoring navigation mode is tied to this screen's lifetime as well as
  // session completion, so leaving the screen cannot strand the whole app in
  // a coarse tracking mode.
  useEffect(() => {
    if (!queueTracking) return;
    setAccuracyMode('queue');
    return () => setAccuracyMode('navigation');
  }, [queueTracking, setAccuracyMode]);

  return { session, snapshot };
}
