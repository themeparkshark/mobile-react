import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';

export default async function deleteReaction(reaction: number): Promise<[]> {
  const { data } = await client.delete<ApiResponseType<[]>>(
    `/reactions/${reaction}`
  );

  return data.data;
}
