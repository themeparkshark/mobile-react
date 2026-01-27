import api from '../../api';
import { PrepItemSetType, PrepItemSetRewardType } from '../../../models/prep-item-set-type';

/**
 * Claim rewards for completing a set
 */
export default async function claimSetRewards(
  setId: number
): Promise<{
  success: boolean;
  set: PrepItemSetType;
  rewards: PrepItemSetRewardType;
}> {
  const response = await api.post(`/api/v2/sets/${setId}/claim`);
  return response.data;
}
