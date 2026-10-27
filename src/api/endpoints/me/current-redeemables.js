import client from '../../client';
import { withPlainTaskNames } from '../../../helpers/plainRideName';

export default async function currentRedeemables() {
  const { data } = await client.get('/me/current-redeemables');

  // Ride names on the map are plain (no trademark marks), like every other ride list.
  return withPlainTaskNames(data.data);
}
