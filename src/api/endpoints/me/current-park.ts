import { noteCurrentPark } from '../../../screens/stampbook/dirty';
import { ApiResponseType } from '../../../models/api-response-type';
import { ParkType } from '../../../models/park-type';
import client from '../../client';

export default async function currentPark(
  latitude: number,
  longitude: number,
  accuracyMeters?: number | null
): Promise<ParkType | null> {
  // Guard against invalid coordinates (prevents 422 errors)
  if (
    latitude === undefined ||
    latitude === null ||
    longitude === undefined ||
    longitude === null ||
    isNaN(latitude) ||
    isNaN(longitude)
  ) {
    return null;
  }

  try {
    // Accuracy lets the server ignore a drifted fix instead of dropping the park.
    const accuracy = typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters > 0
      ? accuracyMeters : undefined;
    const response = await client.post('/me/current-park', {
      latitude,
      longitude,
      ...(accuracy !== undefined ? { accuracy } : {}),
    });
    let data = response.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { /* already parsed */ }
    }
    const park = data?.data ?? null;
    noteCurrentPark(park?.id);
    return park;
  } catch (error: any) {
    // The location check returns 422 outside a park. Preserve real network
    // failures for the caller so a queue guest does not lose the known park
    // every time connectivity drops.
    if (error?.response?.status === 422) return null;
    throw error;
  }
}
