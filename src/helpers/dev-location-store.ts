import { LocationType } from '../models/location-type';

/**
 * Global dev location store — shared between LocationProvider (context)
 * and non-React helpers like get-current-location.
 * Only active when the joystick is on: dev builds, or the App Store review
 * account (LocationProvider decides; it never enables this for players).
 */
let devModeEnabled = false;
let devLocation: LocationType = { latitude: 28.4177, longitude: -81.5812 };

export function setDevModeEnabled(enabled: boolean) {
  devModeEnabled = enabled;
}

export function isDevModeEnabled(): boolean {
  return devModeEnabled;
}

export function setDevLocation(loc: LocationType) {
  devLocation = loc;
}

export function getDevLocation(): LocationType {
  return devLocation;
}
