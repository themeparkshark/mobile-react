import { ApiResponseType } from '../../../../models/api-response-type';
import { PumpkinType } from '../../../../models/pumpkin-type';
import client from '../../../client';

export default async function redeemPumpkin(
  pumpkin: PumpkinType,
  doubleXP: boolean
): Promise<PumpkinType> {
  const { data } = await client.post<ApiResponseType<PumpkinType>>(
    `/pumpkins/${pumpkin.id}/redeem`,
    {
      double_xp: doubleXP,
    }
  );

  return data.data;
}
