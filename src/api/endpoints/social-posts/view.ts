import { ApiResponseType } from '../../../models/api-response-type';
import { SocialPostType } from '../../../models/social-post-type';
import client from '../../client';
import { QUIET_COIN_BROADCAST } from '../../broadcastFilter';

/** Records the view; `coins` is what the server actually paid (null on an older API). */
export default async function view(
  socialPost: SocialPostType
): Promise<{ readonly post: SocialPostType; readonly coins: number | null }> {
  const { data } = await client.post<ApiResponseType<SocialPostType> & { granted?: { coins?: number } }>(
    `/social-posts/${socialPost.id}/view`,
    undefined,
    // The Watch card shows its own +25 moment; skip the duplicate banner.
    { [QUIET_COIN_BROADCAST]: true } as Record<string, unknown>,
  );

  const coins = data.granted?.coins;
  return { post: data.data, coins: typeof coins === 'number' ? coins : null };
}
