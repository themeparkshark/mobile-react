import { ApiResponseType } from '../../../models/api-response-type';
import { ThreadType } from '../../../models/thread-type';
import client from '../../client';

export default async function getThreads(
  page: number,
  options: {
    pinned?: boolean;
    sort?: 'hottest' | 'latest';
    team?: 'mouse' | 'globe' | 'shark';
    friends?: boolean;
  }
): Promise<ThreadType[]> {
  const params: any = {
    page,
    pinned: options.pinned ?? false,
    sort: options.sort ?? 'latest',
  };

  if (options.team) {
    params.team = options.team;
  }

  if (options.friends) {
    params.friends = true;
  }

  const { data } = await client.get<ApiResponseType<ThreadType[]>>('/threads', {
    params,
  });

  return data.data;
}
