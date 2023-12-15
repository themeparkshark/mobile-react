import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';

export default async function reportComment(
  comment: number,
  reason: string
): Promise<[]> {
  const { data } = await client.post<ApiResponseType<[]>>(
    `/comments/${comment}/report`,
    {
      reason,
    }
  );

  return data.data;
}
