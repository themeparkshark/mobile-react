import { ApiResponseType } from '../../../models/api-response-type';
import { SocialPostType } from '../../../models/social-post-type';
import client from '../../client-cms';

export default async function current(): Promise<SocialPostType[]> {
  const { data } = await client.get<ApiResponseType<SocialPostType[]>>(
    '/instagram'
  );

  return data.data;
}
