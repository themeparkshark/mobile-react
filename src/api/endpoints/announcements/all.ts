import { AnnouncementType } from '../../../models/announcement-type';
import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';

export default async function current(): Promise<AnnouncementType[]> {
  const { data } = await client.get<ApiResponseType<AnnouncementType[]>>(
    '/announcements'
  );

  return data.data;
}
