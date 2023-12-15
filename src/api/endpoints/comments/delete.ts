import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';

export default async function deleteComment(comment: number): Promise<void> {
  await client.delete<ApiResponseType<[]>>(`/comments/${comment}`);
}
