import {createContext, Dispatch, FC, ReactNode, useState} from 'react';
import {LocationType} from '../models/location-type';
import getCurrentLocation from '../helpers/get-current-location';
import {useAsyncEffect} from 'rooks';

export interface LocationContextType {
  readonly location?: LocationType;
  readonly setLocation: Dispatch<any>;
  readonly requestLocation: () => void;
}

export const LocationContext = createContext<LocationContextType>(
  {} as LocationContextType
);

export const LocationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationType>();

  const requestLocation = async () => {
    setLocation(await getCurrentLocation());
  };

  useAsyncEffect(async () => {
    const interval = setInterval(async () => {
      await requestLocation();
    }, 7500);

    return () => clearInterval(interval);
  }, []);

  return (
    <LocationContext.Provider
      value={{
        location,
        setLocation,
        requestLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};
