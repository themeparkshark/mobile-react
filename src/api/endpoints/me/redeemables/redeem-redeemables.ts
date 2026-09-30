import { ApiResponseType } from '../../../../models/api-response-type';
import { RedeemableType } from '../../../../models/redeemable-type';
import client from '../../../client';

/** The server decides every reward; there is no client multiplier. */
export default async function redeemRedeemable(
  redeemable: RedeemableType
): Promise<RedeemableType> {
  const { data } = await client.post<ApiResponseType<RedeemableType>>(
    `/redeemables/${redeemable.id}/redeem`
  );

  return data.data;
}
