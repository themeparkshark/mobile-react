import { ApiResponseType } from '../../../../models/api-response-type';
import { QueueTimeType } from '../../../../models/queue-time-type';
import client from '../../../client';

export default async function get(park: number): Promise<QueueTimeType[]> {
  const { data } = await client.get<ApiResponseType<QueueTimeType[]>>(
    `/parks/${park}/queue-times`
  );

  return data.data;
}
