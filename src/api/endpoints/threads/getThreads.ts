import { ApiResponseType } from '../../../models/api-response-type';
import { ThreadType } from '../../../models/thread-type';
import client from '../../client';

export default async function getThreads(
  page: number,
  options: {
    pinned?: boolean;
    sort?: 'hottest' | 'latest';
  }
): Promise<ThreadType[]> {
  const { data } = await client.get<ApiResponseType<ThreadType[]>>('/threads', {
    params: {
      page,
      pinned: options.pinned ?? false,
      sort: options.sort ?? 'latest',
    },
  });

  return data.data;
}
