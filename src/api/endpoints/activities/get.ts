import { ActivityType } from '../../../models/activity-type';
import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';

export default async function getActivities(
  player: number
): Promise<ActivityType[]> {
  const { data } = await client.get<ApiResponseType<ActivityType[]>>(
    `/players/${player}/activities`
  );

  return data.data;
}
