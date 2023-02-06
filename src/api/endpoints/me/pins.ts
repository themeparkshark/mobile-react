import { ApiResponseType } from '../../../models/api-response-type';
import { NotificationType } from '../../../models/notification-type';
import client from '../../client';
import {PinType} from '../../../models/pin-type';
import {ItemType} from '../../../models/item-type';

export default async function getPins(
  page: number
): Promise<ItemType[]> {
  const { data } = await client.get<ApiResponseType<ItemType[]>>(
    '/me/pins',
    {
      params: {
        page,
      },
    }
  );

  return data.data;
}
