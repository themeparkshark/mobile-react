import * as Location from 'expo-location';

export default async function () {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== 'granted') {
    setErrorMsg('Permission to access location was denied');
    return;
  }

  const location = await Location.getCurrentPositionAsync();

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}
