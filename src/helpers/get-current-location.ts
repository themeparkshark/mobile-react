import * as Location from 'expo-location';
import { LocationType } from '../models/location-type';
import * as RootNavigation from '../RootNavigation';

export default async function (): Promise<LocationType> {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== 'granted') {
    RootNavigation.navigate('Error');

    return {
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0,
      longitudeDelta: 0,
    };
  }

  const location = await Location.getCurrentPositionAsync();

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    latitudeDelta: 0.00070,
    longitudeDelta: 0.00070,
  };
}
