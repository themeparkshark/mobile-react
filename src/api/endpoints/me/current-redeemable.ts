import { ApiResponseType } from '../../../models/api-response-type';
import { CurrentRedeemableType } from '../../../models/current-redeemable-type';
import client from '../../client';
import { withPlainRedeemableName } from '../../../helpers/plainRideName';

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

  // The coin under PLAY! is named like the guide card above it (hold R2).
  return withPlainRedeemableName(data.data);
}
