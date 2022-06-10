import currentPark from '../api/endpoints/me/current-park';
import getCurrentLocation from '../helpers/get-current-location';

export default async () => {
  const location = await getCurrentLocation();

  try {
    const response = await currentPark(
      location.coords.latitude,
      location.coords.longitude
    );

    return response.data;
  } catch (error) {
    return null;
  }
};
