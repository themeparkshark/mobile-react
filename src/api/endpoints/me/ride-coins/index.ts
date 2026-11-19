import api from '../../../api';
import { withPlainField } from '../../../../helpers/plainRideName';
import { RideCoinLevelType } from '../../../../models/ride-coin-level-type';

/**
 * Get player's ride coins with leveling info
 */
export default async function getRideCoins(timeoutMs = 10_000): Promise<{
  data: RideCoinLevelType[];
}> {
  const response = await api.get('/me/ride-coins', { timeout: timeoutMs });
  // One display name per ride (fix w3 T122): Ride Coins reads the shelf's names.
  const body = response.data;
  return body && Array.isArray(body.data) ? { ...body, data: withPlainField(body.data, 'ride_name') } : body;
}
