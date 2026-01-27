import api from '../../../api';
import { PlayerRidePartType } from '../../../../models/ride-part-type';

/**
 * Get player's ride parts inventory
 */
export default async function getRideParts(): Promise<{
  data: PlayerRidePartType[];
  total: number;
}> {
  const response = await api.get('/api/v2/me/ride-parts');
  return response.data;
}
