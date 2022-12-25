import getCurrentLocation from '../helpers/get-current-location';
import currentRedeemable from '../api/endpoints/me/current-redeemable';

export default async function checkForRedeemable() {
  const location = await getCurrentLocation();

  try {
    return await currentRedeemable(location.latitude, location.longitude);
  } catch (error) {
    return undefined;
  }
}
