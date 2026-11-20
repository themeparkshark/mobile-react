import client from '../../client';
import { withPlainTaskNames } from '../../../helpers/plainRideName';

/**
 * Lane captures only (fix pass w5, T023): a development bundle started with EXPO_PUBLIC_DEV_RIDE_LIST_DELAY_MS holds the
 * ride list answer that long, so the arrive card's loading state and the kept ride list can be watched on a fast
 * scratch server. A store or OTA bundle (__DEV__ false, the variable unset) never waits.
 */
const DEV_DELAY_MS = typeof __DEV__ !== 'undefined' && __DEV__ ? Number(process.env.EXPO_PUBLIC_DEV_RIDE_LIST_DELAY_MS) || 0 : 0;

export default async function currentRedeemables() {
  if (DEV_DELAY_MS > 0) await new Promise(resolve => setTimeout(resolve, DEV_DELAY_MS));
  const { data } = await client.get('/me/current-redeemables');

  // Ride names on the map are plain (no trademark marks), like every other ride list.
  return withPlainTaskNames(data.data);
}
