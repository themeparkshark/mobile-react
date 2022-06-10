import * as Location from 'expo-location';

export default async function () {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== 'granted') {
    setErrorMsg('Permission to access location was denied');
    return;
  }

  return await Location.getCurrentPositionAsync();
}
