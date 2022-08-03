import client from '../../../client';

export default async function detachCoin(coin) {
  const response = await client.delete(`/me/coins/${coin.id}`);

  return response.data;
}
