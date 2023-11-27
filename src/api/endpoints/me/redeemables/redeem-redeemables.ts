import { ApiResponseType } from '../../../../models/api-response-type';
import client from '../../../client';
import { RedeemableType } from "../../../../models/redeemable-type";

export default async function redeemRedeemable(
  redeemable: RedeemableType,
  doubleXP: boolean
): Promise<RedeemableType> {
  const { data } = await client.post<ApiResponseType<RedeemableType>>(
    `/redeemables/${redeemable.id}/redeem`,
    {
      double_xp: doubleXP,
    }
  );

  return data.data;
}
