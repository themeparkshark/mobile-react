import api from '../../../api';
import { RideCoinLevelType } from '../../../../models/ride-coin-level-type';
import type { LevelUpUnlocks } from '../../../../components/coin/progressionModel';

export interface LevelUpResult {
  success: boolean;
  ride_coin: RideCoinLevelType;
  spent: {
    energy: number;
    ride_parts: number;
  };
  /** Progression v2: XP paid for the level-up and what the new level unlocked. */
  xp?: number;
  unlocks?: LevelUpUnlocks | null;
}

/**
 * Level up a ride coin using Energy + Ride Parts
 */
export default async function levelUpRideCoin(
  rideCoinId: number,
  expectedLevel: number,
): Promise<LevelUpResult> {
  const response = await api.post(`/me/ride-coins/${rideCoinId}/level-up`, {
    expected_level: expectedLevel,
  });
  return response.data;
}
