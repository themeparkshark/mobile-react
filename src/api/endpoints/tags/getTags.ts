import { ApiResponseType } from '../../../models/api-response-type';
import { ReactionType } from '../../../models/reaction-type';
import client from '../../client';
import { TagType } from "../../../models/tag-type";
import { ApiPaginatedResponseType } from "../../../models/api-paginated-response-type";

export default async function getTags(page: number): Promise<TagType[]> {
  const { data } = await client.get<ApiPaginatedResponseType<TagType[]>>(
    '/tags',
    {
      params: {
        page,
      },
    },
  );

  return data.data;
}
