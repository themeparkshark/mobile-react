import { ApiResponseType } from '../../../models/api-response-type';
import { ThreadType } from '../../../models/thread-type';
import client from '../../client';

export default async function getThreads(page: number): Promise<ThreadType[]> {
  const { data } = await client.get<ApiResponseType<ThreadType[]>>('/threads', {
    params: {
      page,
    },
  });

  return data.data;
}
