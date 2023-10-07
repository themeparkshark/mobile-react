import { isEqual } from 'lodash';
import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import currentPark from '../api/endpoints/me/current-park';
import getCurrentLocation from '../helpers/get-current-location';
import { LocationType } from '../models/location-type';
import { ParkType } from '../models/park-type';
import { AuthContext } from './AuthProvider';

export interface LocationContextType {
  readonly location?: LocationType;
  readonly requestLocation: () => void;
  readonly requestPark: () => void;
  readonly park?: ParkType;
}

export const LocationContext = createContext<LocationContextType>(
  {} as LocationContextType
);

export const LocationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationType | undefined>();
  const [park, setPark] = useState<ParkType>();
  const { user } = useContext(AuthContext);

  const requestLocation = async () => {
    const newLocation = await getCurrentLocation();

    if (isEqual(newLocation, location)) {
      return;
    }

    setLocation(newLocation);
  };

  const requestPark = async () => {
    if (!location) {
      return;
    }

    const newPark = await currentPark(location.latitude, location.longitude);

    if (newPark?.id === park?.id) {
      return;
    }

    setPark(newPark);
  };

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
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};
