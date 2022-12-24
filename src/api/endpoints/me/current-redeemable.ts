import client from '../../client';
import { TaskType } from '../../../models/task-type';
import { RedeemableType } from '../../../models/redeemable-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function currentRedeemable(
  latitude: number,
  longitude: number
): Promise<RedeemableType> {
  const { data } = await client.get<ApiResponseType<RedeemableType>>(
    '/me/current-redeemable',
    {
      params: {
        latitude,
        longitude,
      },
    }
  );

  return data.data;
}
