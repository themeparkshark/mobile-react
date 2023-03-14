import { createContext, Dispatch, FC, ReactNode, useState } from 'react';
import { useAsyncEffect } from 'rooks';
import getCurrentLocation from '../helpers/get-current-location';
import { LocationType } from '../models/location-type';
import checkForPark from '../helpers/check-for-park';
import {ParkType} from '../models/park-type';

export interface LocationContextType {
  readonly location?: LocationType;
  readonly setLocation: Dispatch<any>;
  readonly requestLocation: () => void;
  readonly requestPark: () => void;
  readonly park?: ParkType;
}

export const LocationContext = createContext<LocationContextType>(
  {} as LocationContextType
);

export const LocationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationType>();
  const [park, setPark] = useState<ParkType>();

  const requestLocation = async () => {
    setLocation(await getCurrentLocation());
  };

  const requestPark = async () => {
    setPark(await checkForPark());
  };

  useAsyncEffect(async () => {
    const interval = setInterval(async () => {
      await requestLocation();
      await requestPark();
    }, 7500);

    return () => clearInterval(interval);
  }, []);

  return (
    <LocationContext.Provider
      value={{
        location,
        setLocation,
        requestLocation,
        requestPark,
        park,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};
