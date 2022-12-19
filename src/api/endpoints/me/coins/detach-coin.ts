import client from '../../../client';
import { CoinType } from '../../../../models/coin-type';
import { ApiResponseType } from '../../../../models/api-response-type';

export default async function detachCoin(coin: CoinType) {
  await client.delete<ApiResponseType<[]>>(`/me/coins/${coin.id}`);
}
