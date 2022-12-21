import currentPark from '../api/endpoints/me/current-park';
import getCurrentLocation from '../helpers/get-current-location';

export default async () => {
  const location = await getCurrentLocation();

  try {
    return await currentPark(location.latitude, location.longitude);
  } catch (error) {
    //
  }
};
