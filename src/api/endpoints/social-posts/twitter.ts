import client from '../../client-cms';
import { ApiResponseType } from '../../../models/api-response-type';
import { SocialPostType } from '../../../models/social-post-type';

export default async function current(): Promise<SocialPostType[]> {
  const { data } = await client.get<ApiResponseType<SocialPostType[]>>(
    '/twitter'
  );

  return data.data;
}
