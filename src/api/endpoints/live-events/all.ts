import { ApiResponseType } from '../../../models/api-response-type';
import { LiveEventType } from '../../../models/live-event-type';
import client from '../../client';

export default async function getLiveEvents(): Promise<LiveEventType[]> {
  const { data } = await client.get<ApiResponseType<LiveEventType[]>>(
    '/live-events'
  );

  return data.data;
}
