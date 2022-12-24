import client from '../../client';

export default async function currentRedeemables() {
  const { data } = await client.get('/me/current-redeemables');

  return data.data;
}
