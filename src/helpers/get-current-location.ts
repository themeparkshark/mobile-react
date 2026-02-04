import * as Location from 'expo-location';
import { LocationType } from '../models/location-type';
import { isDevModeEnabled, getDevLocation } from './dev-location-store';

export default async function (): Promise<LocationType | undefined> {
  // In dev joystick mode, return the mock location
  if (isDevModeEnabled()) {
    return getDevLocation();
  }

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
