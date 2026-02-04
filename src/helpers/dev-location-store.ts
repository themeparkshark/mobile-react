import { LocationType } from '../models/location-type';

/**
 * Global dev location store — shared between LocationProvider (context)
 * and non-React helpers like get-current-location.
 * Only active when __DEV__ && devMode is enabled.
 */
let devModeEnabled = false;
let devLocation: LocationType = { latitude: 28.4177, longitude: -81.5812 };

export function setDevModeEnabled(enabled: boolean) {
  devModeEnabled = enabled;
}

export function isDevModeEnabled(): boolean {
  return __DEV__ && devModeEnabled;
}

export function setDevLocation(loc: LocationType) {
  devLocation = loc;
}

export function getDevLocation(): LocationType {
  return devLocation;
}
