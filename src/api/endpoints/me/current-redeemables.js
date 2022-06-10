import client from '../../client';

export default async function currentRedeemables() {
  const response = await client.get('/me/current-redeemables');

  return response.data;
}
