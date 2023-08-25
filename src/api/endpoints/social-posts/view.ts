import { ApiResponseType } from '../../../models/api-response-type';
import { SocialPostType } from '../../../models/social-post-type';
import client from '../../client';

export default async function view(
  socialPost: SocialPostType
): Promise<SocialPostType> {
  const { data } = await client.post<ApiResponseType<SocialPostType>>(
    `/social-posts/${socialPost.id}/view`
  );

  return data.data;
}
