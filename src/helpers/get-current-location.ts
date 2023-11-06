import * as Location from 'expo-location';
import { LocationType } from '../models/location-type';

export default async function (): Promise<LocationType | undefined> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      return;
    }

    const location = await Location.getCurrentPositionAsync();

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    //
  }
}
