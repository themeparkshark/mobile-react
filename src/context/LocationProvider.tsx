import { createContext, Dispatch, FC, ReactNode, useState } from 'react';
import { useAsyncEffect } from 'rooks';
import checkForPark from '../helpers/check-for-park';
import getCurrentLocation from '../helpers/get-current-location';
import { LocationType } from '../models/location-type';
import { ParkType } from '../models/park-type';

export interface LocationContextType {
  readonly location?: LocationType;
  readonly setLocation: Dispatch<any>;
  readonly requestLocation: () => void;
  readonly requestPark: () => void;
  readonly park?: ParkType;
  readonly parkLoaded: boolean;
}

export const LocationContext = createContext<LocationContextType>(
  {} as LocationContextType
);

export const LocationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationType>();
  const [park, setPark] = useState<ParkType>();
  const [parkLoaded, setParkLoaded] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const requestLocation = async () => {
    setLocation(await getCurrentLocation());
  };

  const requestPark = async () => {
    setLoading(true);
    setPark(await checkForPark());
    setParkLoaded(true);
    setLoading(false);
  };

  useAsyncEffect(async () => {
    const interval = setInterval(async () => {
      if (loading) {
        return;
      }

      setLoading(true);
      await requestLocation();
      await requestPark();
      setLoading(false);
    }, 5000);

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
        parkLoaded,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};
