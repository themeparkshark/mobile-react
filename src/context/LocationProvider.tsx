import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import checkForPark from '../helpers/check-for-park';
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
  const [loading, setLoading] = useState<boolean>(false);
  const { user } = useContext(AuthContext);

  const requestLocation = async () => {
    setLocation(await getCurrentLocation());
  };

  const requestPark = async () => {
    setLoading(true);
    setPark(await checkForPark());
    setLoading(false);
  };

  useEffect(() => {
    if (!user) {
      return;
    }

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
