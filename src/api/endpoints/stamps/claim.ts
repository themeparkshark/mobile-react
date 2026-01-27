import api from '../../api';
import { StampType, StampRewardType } from '../../../models/stamp-type';

/**
 * Claim rewards for a newly earned stamp
 */
export default async function claimStamp(
  stampId: number
): Promise<{
  success: boolean;
  stamp: StampType;
  rewards: StampRewardType;
}> {
  const response = await api.post(`/api/v2/stamps/${stampId}/claim`);
  return response.data;
}
