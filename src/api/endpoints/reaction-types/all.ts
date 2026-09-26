import { ApiResponseType } from '../../../models/api-response-type';
import { ReactionTypeType } from '../../../models/reaction-type-type';
import client from '../../client';

export default async function all(): Promise<ReactionTypeType[]> {
  const { data } = await client.get<ApiResponseType<ReactionTypeType[]>>(
    '/reaction-types'
  );

  return data.data;
}
