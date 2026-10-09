import { ApiResponseType } from '../../../models/api-response-type';
import { ReactionTypeType } from '../../../models/reaction-type-type';
import client from '../../client';

export default async function all(): Promise<ReactionTypeType[]> {
  const { data } = await client.get<ApiResponseType<ReactionTypeType[]>>(
    '/reaction-types'
  );

  // Runs at every launch from ForumProvider: anything but a list (an odd
  // proxy reply, an old server) means "no reactions", never a crash.
  return Array.isArray(data?.data) ? data.data : [];
}
