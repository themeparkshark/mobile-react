import client from '../../../client';
import { TaskType } from '../../../../models/task-type';
import { ApiResponseType } from '../../../../models/api-response-type';
import { CoinType } from '../../../../models/coin-type';

export default async function redeemCoin(
  coin: CoinType,
  doubleXP: boolean
): Promise<CoinType> {
  const { data } = await client.post<ApiResponseType<CoinType>>(
    `/coins/${coin.id}/redeem`,
    {
      double_xp: doubleXP,
    }
  );

  return data.data;
}
