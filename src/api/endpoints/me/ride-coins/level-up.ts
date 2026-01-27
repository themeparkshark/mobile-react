import api from '../../../api';
import { RideCoinLevelType } from '../../../../models/ride-coin-level-type';

/**
 * Level up a ride coin using Energy + Ride Parts
 */
export default async function levelUpRideCoin(
  rideCoinId: number
): Promise<{
  success: boolean;
  ride_coin: RideCoinLevelType;
  spent: {
    energy: number;
    ride_parts: number;
  };
  unlocked_perks: string[];
}> {
  const response = await api.post(`/api/v2/me/ride-coins/${rideCoinId}/level-up`);
  return response.data;
}
