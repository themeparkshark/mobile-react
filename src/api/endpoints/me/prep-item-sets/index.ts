import axios from 'axios';
import { PrepItemSetType } from '../../../../models/prep-item-set-type';
import { ApiResponseType } from '../../../../models/api-response-type';
import config from '../../../../config';

/**
 * Get all prep item sets with player's progress.
 * Returns active and completed sets.
 */
export async function getPrepItemSets(): Promise<ApiResponseType<PrepItemSetType[]>> {
  const response = await axios.get(`${config.apiUrl}/me/prep-item-sets`);
  return response.data;
}

/**
 * Get a single set with detailed item info.
 */
export async function getPrepItemSet(setId: number): Promise<ApiResponseType<PrepItemSetType>> {
  const response = await axios.get(`${config.apiUrl}/me/prep-item-sets/${setId}`);
  return response.data;
}

/**
 * Get currently active sets only.
 */
export async function getActivePrepItemSets(): Promise<ApiResponseType<PrepItemSetType[]>> {
  const response = await axios.get(`${config.apiUrl}/me/prep-item-sets/active`);
  return response.data;
}

/**
 * Claim completion rewards for a finished set.
 */
export async function claimSetRewards(setId: number): Promise<ApiResponseType<{
  energy: number;
  tickets: number;
  experience: number;
  exclusive_item?: any;
  badge_url?: string;
  title?: string;
}>> {
  const response = await axios.post(`${config.apiUrl}/me/prep-item-sets/${setId}/claim`);
  return response.data;
}

export default getPrepItemSets;
