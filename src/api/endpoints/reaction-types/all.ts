import { ApiResponseType } from '../../../models/api-response-type';
import { ReactionType } from '../../../models/reaction-type';
import client from '../../client';

export default async function all(): Promise<ReactionType[]> {
  const { data } = await client.get<ApiResponseType<ReactionType[]>>(
    '/reaction-types'
  );

  return data.data;
}
