import currentRedeemable from '../api/endpoints/me/current-redeemable';
import getCurrentLocation from '../helpers/get-current-location';

export default async function checkForRedeemable() {
  try {
    const location = await getCurrentLocation();
    if (!location) return undefined;
    return await currentRedeemable(location.latitude, location.longitude);
  } catch (error) {
    return undefined;
  }
}
