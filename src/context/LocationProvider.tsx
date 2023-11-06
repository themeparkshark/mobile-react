import { isEqual } from 'lodash';
import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useAsyncEffect } from 'rooks';
import currentPark from '../api/endpoints/me/current-park';
import getCurrentLocation from '../helpers/get-current-location';
import { LocationType } from '../models/location-type';
import { ParkType } from '../models/park-type';
import { AuthContext } from './AuthProvider';

export interface LocationContextType {
  readonly location: LocationType | undefined;
  readonly requestLocation: () => void;
  readonly requestPark: () => void;
  readonly setPark: (park: ParkType | undefined) => void;
  readonly park?: ParkType;
  readonly parkLoaded: boolean;
}

export const LocationContext = createContext<LocationContextType>(
  {} as LocationContextType
);

export const LocationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationType | undefined>();
  const [park, setPark] = useState<ParkType>();
  const { user } = useContext(AuthContext);
  const [parkLoaded, setParkLoaded] = useState<boolean>(false);

  const requestLocation = async () => {
    const newLocation = await getCurrentLocation();

    if (newLocation && isEqual(newLocation, location)) {
      return location;
    }

    setLocation(newLocation);
    return newLocation;
  };

  const requestPark = async () => {
    const currentLocation = await requestLocation();

    if (!currentLocation) {
      setParkLoaded(true);
      return;
    }

    try {
      const newPark = await currentPark(
        currentLocation.latitude,
        currentLocation.longitude
      );

      if (newPark?.id === park?.id) {
        setParkLoaded(true);
        return;
      }

      setPark(newPark);
    } catch (error) {
      //
    }

    setParkLoaded(true);
  };

  useAsyncEffect(async () => {
    await requestPark();
  }, [location]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const interval = setInterval(async () => {
      await requestLocation();
      await requestPark();
    }, 5000);

    return () => clearInterval(interval);
  }, [user?.id]);

  return (
    <LocationContext.Provider
      value={{
        location,
        requestLocation,
        requestPark,
        park,
        parkLoaded,
        setPark,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};
