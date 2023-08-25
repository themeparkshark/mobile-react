import { ApiResponseType } from '../../../models/api-response-type';
import { SocialPostType } from '../../../models/social-post-type';
import client from '../../client';

export default async function youtube(): Promise<SocialPostType[]> {
  const { data } = await client.get<ApiResponseType<SocialPostType[]>>(
    '/social-posts',
    {
      params: {
        source: 'youtube',
      },
    }
  );

  return data.data;
}
