import { ApiResponseType } from '../../../models/api-response-type';
import { CommentType } from '../../../models/comment-type';
import client from '../../client';

export default async function getComments(
  thread: number,
  page: number
): Promise<CommentType[]> {
  const { data } = await client.get<ApiResponseType<CommentType[]>>(
    `/threads/${thread}/comments`,
    {
      params: {
        page,
      },
    }
  );

  return data.data;
}
