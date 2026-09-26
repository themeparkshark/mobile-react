import type { LogRidePayload } from '../api/endpoints/player-rides';
import type { DetectedRide } from './RideDetectionService';

export interface RideJournalRating {
  rating: number;
  reaction: string | null;
}

/** Save only unsaved detections; preserve every failed one for a later retry. */
export async function saveDetectedRideBatch(
  rides: readonly DetectedRide[],
  ratings: ReadonlyMap<string, RideJournalRating>,
  alreadySaved: ReadonlySet<string>,
  saveRide: (payload: LogRidePayload) => Promise<unknown>,
  removePending: (id: string) => Promise<void>,
): Promise<{ savedIds: Set<string>; failedIds: Set<string> }> {
  const savedIds = new Set(alreadySaved);
  const failedIds = new Set<string>();

  for (const ride of rides) {
    if (!savedIds.has(ride.id)) {
      const rating = ratings.get(ride.id);
      try {
        await saveRide({
          ride_id: ride.rideId,
          source_detection_id: ride.id,
          rating: rating?.rating || undefined,
          reaction: rating?.reaction || undefined,
          rode_at: new Date(ride.enteredAt).toISOString(),
        });
        savedIds.add(ride.id);
      } catch {
        failedIds.add(ride.id);
        continue;
      }
    }

    // A failed local cleanup must not turn a confirmed server save into a
    // failure. The same detection ID can be safely cleaned on the next retry.
    try { await removePending(ride.id); }
    catch { /* Keep this pending record for a later cleanup attempt. */ }
  }

  return { savedIds, failedIds };
}
