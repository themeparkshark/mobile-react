import { ApiResponseType } from '../../../models/api-response-type';
import { CurrentRedeemableType } from '../../../models/current-redeemable-type';
import client from '../../client';
import { withPlainRedeemableName } from '../../../helpers/plainRideName';

export default async function currentRedeemable(
  latitude: number,
  longitude: number,
  /** Picture games only (Settings): the server's deal then names the picture game PLAY will deal (fix w4 T039). */
  options?: { readonly pictureOnly?: boolean },
): Promise<CurrentRedeemableType> {
  const { data } = await client.get<ApiResponseType<CurrentRedeemableType>>(
    '/me/current-redeemable',
    {
      params: {
        latitude,
        longitude,
        ...(options?.pictureOnly ? { picture_only: 1 } : {}),
      },
    }
  );

  // The coin under PLAY! is named like the guide card above it (hold R2).
  return withPlainRedeemableName(data.data);
}
