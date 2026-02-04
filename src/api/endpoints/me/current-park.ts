import { ApiResponseType } from '../../../models/api-response-type';
import { ParkType } from '../../../models/park-type';
import client from '../../client';

export default async function currentPark(
  latitude: number,
  longitude: number
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
    const response = await client.post('/me/current-park', {
      latitude,
      longitude,
    });
    let data = response.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { /* already parsed */ }
    }
    return data?.data ?? null;
  } catch (error: any) {
    // 422 is expected when not at a park - don't use console.error (triggers dev modal)
    console.log('🦈 Not at a park or fetch failed:', error?.message || error);
    return null;
  }
}
