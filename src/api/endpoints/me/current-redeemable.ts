import { ApiResponseType } from '../../../models/api-response-type';
import { CurrentRedeemableType } from '../../../models/current-redeemable-type';
import client from '../../client';

export default async function currentRedeemable(
  latitude: number,
  longitude: number
): Promise<CurrentRedeemableType> {
  const { data } = await client.get<ApiResponseType<CurrentRedeemableType>>(
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
