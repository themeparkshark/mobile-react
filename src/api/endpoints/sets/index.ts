import api from '../../api';
import { PrepItemSetType } from '../../../models/prep-item-set-type';

/**
 * Get all prep item sets with player progress
 */
export default async function getPrepItemSets(): Promise<{
  data: PrepItemSetType[];
  completed_count: number;
  total_count: number;
}> {
  const response = await api.get('/api/v2/sets');
  return response.data;
}
