import { ApiResponseType } from '../../../models/api-response-type';
import { CommentType } from '../../../models/comment-type';
import client from '../../client';

export default async function getComments(
  thread: number,
  page: number,
  options?: {
    sort?: 'most_reactions' | 'latest';
  }
): Promise<CommentType[]> {
  const { data } = await client.get<ApiResponseType<CommentType[]>>(
    `/threads/${thread}/comments`,
    {
      params: {
        page,
        sort: options?.sort ?? 'latest',
      },
    }
  );

  return data.data;
}
