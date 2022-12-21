import * as Location from 'expo-location';
import { LocationType } from '../models/location-type';
import { ParkType } from '../models/park-type';

export default async function (): Promise<LocationType> {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== 'granted') {
    return {
      latitude: 0,
      longitude: 0,
    };
  }

  const location = await Location.getCurrentPositionAsync();

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}
