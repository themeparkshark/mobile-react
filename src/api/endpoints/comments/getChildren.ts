import { ApiPaginatedResponseType } from '../../../models/api-paginated-response-type';
import { CommentType } from '../../../models/comment-type';
import client from '../../client';

export default async function getComments(
  comment: number,
  page: number
): Promise<ApiPaginatedResponseType<CommentType[]>> {
  const { data } = await client.get<ApiPaginatedResponseType<CommentType[]>>(
    `/comments/${comment}/children`,
    {
      params: {
        page,
      },
    }
  );

  return data;
}
