import * as Location from 'expo-location';
import { createContext, FC, ReactNode, useContext, useState } from 'react';
import { useAsyncEffect, useDebounce, useIntervalWhen } from 'rooks';
import currentPark from '../api/endpoints/me/current-park';
import { LocationType } from '../models/location-type';
import { ParkType } from '../models/park-type';
import { AuthContext } from './AuthProvider';

export interface LocationContextType {
  readonly location: LocationType | undefined;
  readonly requestLocation: () => void;
  readonly requestPark: () => void;
  readonly park?: ParkType;
  readonly parkLoaded: boolean;
  readonly permissionGranted: boolean;
}

export const LocationContext = createContext<LocationContextType>(
  {} as LocationContextType
);

export const LocationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationType | undefined>();
  const [park, setPark] = useState<ParkType>();
  const { user } = useContext(AuthContext);
  const [parkLoaded, setParkLoaded] = useState<boolean>(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const debouncedSetLocation = useDebounce(setLocation, 5000, {
    leading: true,
  });

  const getCurrentLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync();

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      //
    }
  };

  const requestLocation = async () => {
    const newLocation = await getCurrentLocation();

    if (
      newLocation &&
      location &&
      newLocation.longitude === location.longitude &&
      newLocation.latitude === location.latitude
    ) {
      return;
    }

    debouncedSetLocation(newLocation);
  };

  const requestPark = async () => {
    if (!location) {
      await requestLocation();
      setParkLoaded(false);
      setPark(null);
      return;
    }

    try {
      const newPark = await currentPark(location.latitude, location.longitude);

      setParkLoaded(true);
      setPark(newPark);
    } catch (error) {
      setParkLoaded(true);
      setPark(null);
    }
  };

  useAsyncEffect(async () => {
    if (!user || !permissionGranted || !location) {
      return;
    }

    await requestPark();
  }, [user, permissionGranted, location?.latitude, location?.longitude]);

  useIntervalWhen(
    async () => {
      await requestLocation();
    },
    5000,
    Boolean(user && permissionGranted),
    true
  );

  useAsyncEffect(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();

    setPermissionGranted(status === 'granted');
  }, []);

  return (
    <LocationContext.Provider
      value={{
        location,
        requestLocation,
        requestPark,
        park,
        parkLoaded,
        permissionGranted,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};
