import getCurrentLocation from '../helpers/get-current-location';
import currentRedeemable from '../api/endpoints/me/current-redeemable';

export default async function checkForRedeemable() {
  const location = await getCurrentLocation();

  try {
    const response = await currentRedeemable(
      location.latitude,
      location.longitude
    );

    return response;
  } catch (error) {
    return null;
  }
};
