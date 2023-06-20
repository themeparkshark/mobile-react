import { ApiResponseType } from '../../../models/api-response-type';
import { ThreadType } from '../../../models/thread-type';
import client from '../../client';

export default async function getThread(thread: number): Promise<ThreadType> {
  const { data } = await client.get<ApiResponseType<ThreadType>>(
    `/threads/${thread}`
  );

  return data.data;
}
