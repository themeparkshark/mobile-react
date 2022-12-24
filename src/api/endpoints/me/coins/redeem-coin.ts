import client from '../../../client';
import { TaskType } from '../../../../models/task-type';
import { ApiResponseType } from '../../../../models/api-response-type';
import { CoinType } from '../../../../models/coin-type';

export default async function redeemCoin(coin: CoinType): Promise<CoinType> {
  const { data } = await client.post<ApiResponseType<CoinType>>(
    `/coins/${coin.id}/redeem`
  );

  return data.data;
}
