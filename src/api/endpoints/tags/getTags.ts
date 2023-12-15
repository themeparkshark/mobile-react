import { ApiPaginatedResponseType } from '../../../models/api-paginated-response-type';
import { TagType } from '../../../models/tag-type';
import client from '../../client';

export default async function getTags(page: number): Promise<TagType[]> {
  const { data } = await client.get<ApiPaginatedResponseType<TagType[]>>(
    '/tags',
    {
      params: {
        page,
      },
    }
  );

  return data.data;
}
