import { ApiResponseType } from '../../../models/api-response-type';
import { ReactionType } from '../../../models/reaction-type';
import client from '../../client';

export default async function addThreadReaction(
  thread: number,
  reactionType: number
): Promise<ReactionType> {
  const { data } = await client.post<ApiResponseType<ReactionType>>(
    `/threads/${thread}/add-reaction`,
    {
      reaction_type_id: reactionType,
    }
  );

  return data.data;
}
