/**
 * Hook to initialize ride detection with background location,
 * ride data, and wait times integration.
 */
import { useEffect, useRef } from 'react';
import { getRides, RideType } from '../api/endpoints/rides';
import getWikiTimes from '../api/endpoints/parks/queue-times/getWikiTimes';
import rideDetectionService, {
  setDetectionRides,
  startDetection,
  stopDetection,
} from '../services/RideDetectionService';
import { PARK_WIKI_IDS } from '../constants/parkWaitTimes';

/**
 * Maps ThemeParks.wiki attraction names to our ride IDs.
 * Since wiki IDs are UUIDs and our rides use numeric IDs,
 * we match by name (case-insensitive, trimmed).
 */
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

export function useRideDetection(enabled: boolean, parkId?: number) {
  const ridesRef = useRef<RideType[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function init() {
      try {
        // Load rides
        const rides = await getRides(parkId);
        if (cancelled) return;
        ridesRef.current = rides;
        setDetectionRides(rides);

        // Start detection (requests permissions, starts foreground + background)
        await startDetection();

        // Initial wait times fetch
        await fetchAndSetWaitTimes(rides, parkId);

        // Poll wait times every 5 minutes
        intervalRef.current = setInterval(() => {
          fetchAndSetWaitTimes(ridesRef.current, parkId);
        }, 5 * 60 * 1000);
      } catch (e) {
        console.error('Failed to initialize ride detection:', e);
      }
    }

    init();

    return () => {
      cancelled = true;
      stopDetection();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, parkId]);
}

async function fetchAndSetWaitTimes(rides: RideType[], parkId?: number) {
  try {
    // If we have a specific park, just fetch that one
    const parkIds = parkId
      ? [parkId]
      : Array.from(new Set(rides.map(r => r.park_id)));

    const allEntries: { name: string; queue?: { STANDBY?: { waitTime: number | null } } }[] = [];

    for (const pid of parkIds) {
      if (!PARK_WIKI_IDS[pid]) continue;
      try {
        const entries = await getWikiTimes(pid);
        allEntries.push(...entries);
      } catch {
        // Individual park fetch failure is ok
      }
    }

    if (allEntries.length > 0) {
      const waitTimeMap = buildWaitTimeMap(allEntries, rides);
      rideDetectionService.setCurrentWaitTimes(waitTimeMap);
    }
  } catch (e) {
    console.warn('Failed to fetch wait times for detection:', e);
  }
}

export default useRideDetection;
