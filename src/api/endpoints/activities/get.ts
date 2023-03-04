import { AnnouncementType } from '../../../models/announcement-type';
import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';
import {ActivityType} from '../../../models/activity-type';

export default async function getActivities(user: number): Promise<ActivityType[]> {
  const { data } = await client.get<ApiResponseType<ActivityType[]>>(
    `/users/${user}/activities`
  );

  return data.data;
}
