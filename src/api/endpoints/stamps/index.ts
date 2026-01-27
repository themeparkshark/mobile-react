import api from '../../api';
import { StampType } from '../../../models/stamp-type';

/**
 * Get all stamps with player progress
 */
export default async function getStamps(): Promise<{
  data: StampType[];
  earned_count: number;
  total_count: number;
}> {
  const response = await api.get('/api/v2/stamps');
  return response.data;
}
