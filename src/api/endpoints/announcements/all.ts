import { AnnouncementType } from '../../../models/announcement-type';
import client from '../../client';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function current(): Promise<AnnouncementType[]> {
  const { data } = await client.get<ApiResponseType<AnnouncementType[]>>(
    '/announcements'
  );

  return data.data;
}
