import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';

export default async function reportThread(
  thread: number,
  reason: string
): Promise<[]> {
  const { data } = await client.post<ApiResponseType<[]>>(
    `/threads/${thread}/report`,
    {
      reason,
    }
  );

  return data.data;
}
