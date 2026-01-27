import api from '../../../api';
import { RideCoinLevelType } from '../../../../models/ride-coin-level-type';

/**
 * Get player's ride coins with leveling info
 */
export default async function getRideCoins(): Promise<{
  data: RideCoinLevelType[];
}> {
  const response = await api.get('/api/v2/me/ride-coins');
  return response.data;
}
