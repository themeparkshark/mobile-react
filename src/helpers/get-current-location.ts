import * as Location from 'expo-location';
import { LocationType } from '../models/location-type';

export default async function (): Promise<LocationType | undefined> {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== 'granted') {
    return undefined;
  }

  const location = await Location.getCurrentPositionAsync();

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}
