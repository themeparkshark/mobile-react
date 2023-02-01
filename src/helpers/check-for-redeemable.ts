import currentRedeemable from '../api/endpoints/me/current-redeemable';
import getCurrentLocation from '../helpers/get-current-location';

export default async function checkForRedeemable() {
  const location = await getCurrentLocation();

  try {
    return await currentRedeemable(location.latitude, location.longitude);
  } catch (error) {
    return undefined;
  }
}
