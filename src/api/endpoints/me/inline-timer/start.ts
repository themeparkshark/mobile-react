import api from '../../../api';

/**
 * Start an in-line timer for a ride
 */
export default async function startInLineTimer(
  rideId: number,
  estimatedWaitMinutes: number
): Promise<{
  success: boolean;
  session_id: string;
  ride_name: string;
  started_at: string;
}> {
  const response = await api.post('/api/v2/me/inline-timer/start', {
    ride_id: rideId,
    estimated_wait_minutes: estimatedWaitMinutes,
  });
  return response.data;
}
