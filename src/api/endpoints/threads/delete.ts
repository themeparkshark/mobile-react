import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';

export default async function deleteThread(thread: number): Promise<[]> {
  const { data } = await client.delete<ApiResponseType<[]>>(
    `/threads/${thread}`
  );

  return data.data;
}
