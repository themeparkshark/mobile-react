import api from '../../../api';
import { RideCoinLevelType } from '../../../../models/ride-coin-level-type';

/**
 * Level up a ride coin using Energy + Ride Parts
 */
export default async function levelUpRideCoin(
  rideCoinId: number,
  expectedLevel: number,
): Promise<{
  success: boolean;
  ride_coin: RideCoinLevelType;
  spent: {
    energy: number;
    ride_parts: number;
  };
}> {
  const response = await api.post(`/me/ride-coins/${rideCoinId}/level-up`, {
    expected_level: expectedLevel,
  });
  return response.data;
}
