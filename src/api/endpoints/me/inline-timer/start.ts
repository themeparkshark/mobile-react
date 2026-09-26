import api from '../../../api';
import type { LineSessionResponse } from './types';

/**
 * Start an in-line timer for a ride
 */
export default async function startInLineTimer(
  rideId: number,
  clientRequestId: string,
  latitude: number,
  longitude: number,
): Promise<LineSessionResponse> {
  const response = await api.post('/me/line-sessions', {
    ride_id: rideId,
    client_request_id: clientRequestId,
    latitude,
    longitude,
  }, { timeout: 8000 });
  return response.data;
}
