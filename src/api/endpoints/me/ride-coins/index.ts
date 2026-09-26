import api from '../../../api';
import { RideCoinLevelType } from '../../../../models/ride-coin-level-type';

/**
 * Get player's ride coins with leveling info
 */
export default async function getRideCoins(timeoutMs = 10_000): Promise<{
  data: RideCoinLevelType[];
}> {
  const response = await api.get('/me/ride-coins', { timeout: timeoutMs });
  return response.data;
}
