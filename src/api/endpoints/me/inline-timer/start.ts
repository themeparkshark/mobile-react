import api from '../../../api';
import type { LineSessionResponse } from './types';

export interface OfflineEntry {
  /** Phone-clock time of the entry fix, when the start is sent late (L1). */
  readonly clientStartedAt?: number | null;
  readonly accuracyMeters?: number | null;
}

/**
 * Start an in-line timer for a ride. An entry saved offline sends its own
 * fix and phone-clock time; the server corrects clock skew and backdates.
 */
export default async function startInLineTimer(
  rideId: number,
  clientRequestId: string,
  latitude: number,
  longitude: number,
  entry?: OfflineEntry,
): Promise<LineSessionResponse> {
  const accuracy = typeof entry?.accuracyMeters === 'number' && Number.isFinite(entry.accuracyMeters) &&
    entry.accuracyMeters >= 0 ? Math.min(10_000, entry.accuracyMeters) : undefined;
  const response = await api.post('/me/line-sessions', {
    ride_id: rideId,
    client_request_id: clientRequestId,
    latitude,
    longitude,
    accuracy_meters: accuracy,
    ...(entry?.clientStartedAt && Number.isFinite(entry.clientStartedAt)
      ? { client_started_at: Math.round(entry.clientStartedAt), client_now: Date.now() } : {}),
  }, { timeout: 8000 });
  return response.data;
}
