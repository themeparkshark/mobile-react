import client from '../../client';
import { AnnouncementType } from '../../../models/announcement-type';
import { ItemTypeType } from '../../../models/item-type-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function itemTypes(): Promise<ItemTypeType[]> {
  const { data } = await client.get<ApiResponseType<ItemTypeType[]>>(
    '/item-types'
  );

  return data.data;
}
