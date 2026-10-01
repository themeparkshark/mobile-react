/**
 * useRideDetection — Smart GPS Ride Detection Hook
 * 
 * TWO MODES:
 * 
 * 1. BACKGROUND (phone locked / app not active):
 *    - GPS tracks silently via background location task
 *    - Detections queue to AsyncStorage without any UI
 *    - When user opens app back up, batch confirm screen appears
 *      showing ALL rides detected while away
 * 
 * 2. FOREGROUND (app open and active):
 *    - GPS tracks in real-time
 *    - After each ride detected, single-ride popup appears immediately
 *    - User confirms or dismisses inline
 * 
 * NOTHING is auto-logged. Every detection requires user confirmation.
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getRides, RideType } from '../api/endpoints/rides';
import getWikiTimes from '../api/endpoints/parks/queue-times/getWikiTimes';
import rideDetectionService, {
  setDetectionRides,
  startDetection,
  stopDetection,
  getPendingDetections,
  DetectedRide,
} from '../services/RideDetectionService';
import { PARK_WIKI_IDS } from '../constants/parkWaitTimes';
import { navigationRef, navigate } from '../RootNavigation';
import { rideDetectionEmitter } from '../services/RideDetectionEmitter';
import { LocationContext } from '../context/LocationProvider';
import useLivePoll from './useLivePoll';

/** Posted waits sharpen detection confidence: every 5 min on screen, every 15 min in a pocket. */
export const WAIT_TIMES_FOREGROUND_MS = 5 * 60 * 1000;
export const WAIT_TIMES_BACKGROUND_MS = 15 * 60 * 1000;

/** Tracks whether we've already navigated to batch confirm to prevent double navigation (BUG 8 fix) */
let batchConfirmNavigating = false;

/**
 * Check pending queue and navigate to batch confirm if there are rides.
 * Guards against double navigation and nav-not-ready.
 */
async function checkAndShowPendingRides(): Promise<boolean> {
  // Prevent double navigation (BUG 8 fix)
  if (batchConfirmNavigating) return false;

  // Check if navigation is ready (ISSUE 9 fix)
  if (!navigationRef.isReady()) return false;

  try {
    const pending = await getPendingDetections();
    if (pending.length === 0) return false;

    // Filter to medium/high confidence only
    const meaningful = pending.filter(d => d.confidence !== 'low');
    if (meaningful.length === 0) {
      // Remove low confidence detections individually, not clearAll
      // to prevent race with new detections added between read and clear (ISSUE 10 fix)
      for (const d of pending) {
        await rideDetectionService.removePendingDetection(d.id);
      }
      return false;
    }

    // Check we're not already on the batch confirm screen
    const currentRoute = navigationRef.getCurrentRoute();
    if (currentRoute?.name === 'RideBatchConfirm' || currentRoute?.name === 'RideLog') return false;

    batchConfirmNavigating = true;
    navigate('RideBatchConfirm', { detections: meaningful } as any);

    // Reset flag after a short delay to allow re-navigation later
    setTimeout(() => { batchConfirmNavigating = false; }, 2000);
    return true;
  } catch (e) {
    batchConfirmNavigating = false;
    console.warn('Failed to check pending ride detections:', e);
    return false;
  }
}

export function useRideDetection(enabled: boolean, parkId?: number | null) {
  const { location, latestLocationSampleRef } = useContext(LocationContext);
  const ridesRef = useRef<RideType[]>([]);
  const [ridesLoaded, setRidesLoaded] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const initialCheckDoneRef = useRef(false);

  // The map's foreground watcher is already providing raw OS samples. Use its
  // latest fresh fix for ride entry and exit, including after navigating away.
  useEffect(() => {
    if (!enabled || appStateRef.current !== 'active') return;
    const sample = latestLocationSampleRef.current;
    if (!sample || Date.now() - sample.timestamp > 30_000 ||
        sample.timestamp > Date.now() + 5_000) return;
    rideDetectionService.processForegroundLocation(sample.latitude, sample.longitude);
  }, [enabled, location?.latitude, location?.longitude, latestLocationSampleRef]);

  // Handle foreground single-ride detection
  useEffect(() => {
    if (!enabled) return;

    const handleForegroundDetection = (detection: DetectedRide) => {
      if (appStateRef.current === 'active') {
        rideDetectionEmitter.emit('rideDetected', detection);
      }
    };

    rideDetectionService.onForegroundDetection = handleForegroundDetection;

    return () => {
      rideDetectionService.onForegroundDetection = null;
    };
  }, [enabled]);

  // AppState listener — check pending rides when coming back to foreground
  useEffect(() => {
    if (!enabled) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      const wasBackground = appStateRef.current === 'background' || appStateRef.current === 'inactive';
      const nowForeground = nextState === 'active';

      if (wasBackground && nowForeground) {
        // User just opened the app back up
        setTimeout(() => {
          checkAndShowPendingRides();
        }, 500);
      }

      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [enabled]);

  // Initialize detection service
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function init() {
      try {
        const rides = await getRides();
        if (cancelled) return;
        ridesRef.current = rides;
        setDetectionRides(rides);

        await startDetection();
        if (cancelled) return;
        const sample = latestLocationSampleRef.current;
        if (sample && Date.now() - sample.timestamp <= 30_000 &&
            sample.timestamp <= Date.now() + 5_000) {
          rideDetectionService.processForegroundLocation(sample.latitude, sample.longitude);
        }

        // Wait times poll below (useLivePoll) once the rides are known.
        setRidesLoaded(true);

        // On initial mount, check for pending detections from a previous session
        if (!initialCheckDoneRef.current) {
          initialCheckDoneRef.current = true;
          setTimeout(() => {
            checkAndShowPendingRides();
          }, 2000);
        }
      } catch (e) {
        console.error('Failed to initialize ride detection:', e);
      }
    }

    init();

    return () => {
      cancelled = true;
      stopDetection();
      setRidesLoaded(false);
    };
  }, [enabled]);

  // Only the park the guest is in: the themeparks.wiki feed for each park is a
  // large download, and fetching all eleven every 5 minutes cost far more
  // radio and parsing than detection ever used.
  const refreshWaitTimes = useCallback(() => fetchAndSetWaitTimes(ridesRef.current, parkId ?? null), [parkId]);
  useLivePoll(refreshWaitTimes, WAIT_TIMES_FOREGROUND_MS, {
    enabled: enabled && ridesLoaded, backgroundMs: WAIT_TIMES_BACKGROUND_MS, key: parkId ?? null,
  });
}

export function waitTimeParkIds(rides: readonly RideType[], parkId: number | null): number[] {
  const ids = parkId != null ? [parkId] : Array.from(new Set(rides.map(r => r.park_id)));
  return ids.filter(pid => PARK_WIKI_IDS[pid]);
}

async function fetchAndSetWaitTimes(rides: RideType[], parkId: number | null) {
  if (!rides.length) return;
  try {
    const parkIds = waitTimeParkIds(rides, parkId);
    const allEntries: { name: string; queue?: { STANDBY?: { waitTime: number | null } } }[] = [];

    // Fetch all parks in parallel (ISSUE 11 fix)
    const results = await Promise.allSettled(parkIds.map(pid => getWikiTimes(pid)));

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allEntries.push(...result.value);
      }
    }

    if (allEntries.length > 0) {
      const waitTimeMap = buildWaitTimeMap(allEntries, parkId != null ? rides.filter(r => r.park_id === parkId) : rides);
      rideDetectionService.setCurrentWaitTimes(waitTimeMap);
    }
  } catch (e) {
    console.warn('Failed to fetch wait times for detection:', e);
  }
}

function buildWaitTimeMap(
  wikiEntries: { name: string; queue?: { STANDBY?: { waitTime: number | null } } }[],
  rides: RideType[],
): Map<number, number> {
  const map = new Map<number, number>();
  const nameToRide = new Map<string, RideType>();

  for (const ride of rides) {
    nameToRide.set(ride.name.toLowerCase().trim(), ride);
  }

  for (const entry of wikiEntries) {
    const waitTime = entry.queue?.STANDBY?.waitTime;
    if (waitTime == null || waitTime < 0) continue;

    const match = nameToRide.get(entry.name.toLowerCase().trim());
    if (match) {
      map.set(match.id, waitTime);
    }
  }

  return map;
}

export default useRideDetection;
