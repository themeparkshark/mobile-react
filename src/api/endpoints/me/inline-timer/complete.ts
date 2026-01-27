import api from '../../../api';
import { RidePartType } from '../../../../models/ride-part-type';

/**
 * Complete an in-line timer and collect rewards
 */
export default async function completeInLineTimer(
  sessionId: string
): Promise<{
  success: boolean;
  duration_seconds: number;
  rewards: {
    ride_parts: Array<{
      ride_part: RidePartType;
      quantity: number;
    }>;
    bonus_energy: number;
    experience: number;
  };
}> {
  const response = await api.post('/api/v2/me/inline-timer/complete', {
    session_id: sessionId,
  });
  return response.data;
}
