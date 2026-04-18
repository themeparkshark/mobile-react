import * as Location from 'expo-location';
import { createContext, FC, ReactNode, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { useAsyncEffect, useDebounce, useIntervalWhen } from 'rooks';
import currentPark from '../api/endpoints/me/current-park';
import { LocationType } from '../models/location-type';
import { ParkType } from '../models/park-type';
import { AuthContext } from './AuthProvider';
import { setDevModeEnabled, setDevLocation as setGlobalDevLocation } from '../helpers/dev-location-store';

// Smoothing factor for heading (lower = smoother but laggier, higher = more responsive but jittery)
// Tuned for snappy but stable
const HEADING_SMOOTHING_FACTOR = 0.5; // snappy response
// Minimum heading change to register (prevents micro-jitters)
const HEADING_THRESHOLD = 2; // small dead zone for jitter
// Fast turn threshold - if turning quickly, be more responsive
const FAST_TURN_THRESHOLD = 8; // triggers fast mode quickly
const FAST_TURN_SMOOTHING = 0.75; // very responsive when turning

export interface LocationContextType {
  readonly location: LocationType | undefined;
  readonly heading: number | null;
  readonly headingEnabled: boolean;
  readonly setHeadingEnabled: (enabled: boolean) => void;
  readonly reset: () => void;
  readonly requestLocation: () => void;
  readonly requestPark: () => void;
  readonly park?: ParkType;
  readonly parkLoaded: boolean;
  readonly permissionGranted: boolean;
  // Dev joystick support
  readonly devMode: boolean;
  readonly setDevMode: (enabled: boolean) => void;
  readonly moveDevLocation: (dx: number, dy: number, speed: number) => void;
}

export const LocationContext = createContext<LocationContextType>(
  {} as LocationContextType
);

// Default dev location: Universal Studios Hollywood
const DEV_DEFAULT_LAT = 34.1381;
const DEV_DEFAULT_LNG = -118.3534;

export const LocationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationType>();
  const [park, setPark] = useState<ParkType>();
  const { player } = useContext(AuthContext);
  const [parkLoaded, setParkLoaded] = useState<boolean>(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  // Fast debounce — the AnimatedRegion glide in Map.tsx handles visual smoothing,
  // so we want location state to update as quickly as possible
  const debouncedSetLocation = useDebounce(setLocation, 400, {
    leading: true,
  });

  // Dev joystick mock location - auto-enable in dev for testing
  const [devMode, setDevMode] = useState<boolean>(__DEV__);
  const devLocationRef = useRef<LocationType>({ latitude: DEV_DEFAULT_LAT, longitude: DEV_DEFAULT_LNG });

  const moveDevLocation = useCallback((dx: number, dy: number, speed: number) => {
    const prev = devLocationRef.current;
    const newLoc = {
      latitude: prev.latitude + dy * speed,
      longitude: prev.longitude + dx * speed,
    };
    devLocationRef.current = newLoc;
    setGlobalDevLocation(newLoc);
    setLocation(newLoc);
  }, []);

  // When dev mode is toggled on, set initial mock location and sync global store
  useEffect(() => {
    if (devMode && __DEV__) {
      setDevModeEnabled(true);
      setGlobalDevLocation(devLocationRef.current);
      setLocation(devLocationRef.current);
      setPermissionGranted(true);
    } else {
      setDevModeEnabled(false);
    }
  }, [devMode]);

  // Heading state for compass-based map rotation
  const [heading, setHeading] = useState<number | null>(null);
  const [headingEnabled, setHeadingEnabled] = useState<boolean>(false);
  const smoothedHeadingRef = useRef<number | null>(null);
  const headingSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const positionSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastLocationRef = useRef<LocationType | null>(null);

  // Normalize heading to handle 0/360 wraparound smoothly
  const normalizeHeadingDelta = (current: number, target: number): number => {
    let delta = target - current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta;
  };

  // Apply low-pass filter for smooth heading with velocity-aware smoothing
  const smoothHeading = (rawHeading: number): number => {
    if (smoothedHeadingRef.current === null) {
      smoothedHeadingRef.current = rawHeading;
      return rawHeading;
    }

    const delta = normalizeHeadingDelta(smoothedHeadingRef.current, rawHeading);
    
    // Ignore tiny changes to prevent jitter
    if (Math.abs(delta) < HEADING_THRESHOLD) {
      return smoothedHeadingRef.current;
    }

    // Velocity-aware smoothing: when turning fast, be more responsive
    // This gives AAA-quality feel like Pokemon GO
    const smoothingFactor = Math.abs(delta) > FAST_TURN_THRESHOLD 
      ? FAST_TURN_SMOOTHING 
      : HEADING_SMOOTHING_FACTOR;

    // Apply smoothing
    let newHeading = smoothedHeadingRef.current + delta * smoothingFactor;
    
    // Normalize to 0-360
    if (newHeading < 0) newHeading += 360;
    if (newHeading >= 360) newHeading -= 360;

    smoothedHeadingRef.current = newHeading;
    return newHeading;
  };

  // Subscribe to heading updates when enabled
  useEffect(() => {
    if (!headingEnabled || !permissionGranted) {
      // Cleanup subscription if disabled
      if (headingSubscriptionRef.current) {
        headingSubscriptionRef.current.remove();
        headingSubscriptionRef.current = null;
      }
      return;
    }

    const startHeadingSubscription = async () => {
      try {
        headingSubscriptionRef.current = await Location.watchHeadingAsync((headingData) => {
          // Use trueHeading if available (more accurate), fallback to magHeading
          const rawHeading = headingData.trueHeading >= 0 
            ? headingData.trueHeading 
            : headingData.magHeading;
          
          if (rawHeading >= 0) {
            const smoothed = smoothHeading(rawHeading);
            setHeading(smoothed);
          }
        });
      } catch (error) {
        console.error('Failed to start heading subscription:', error);
      }
    };

    startHeadingSubscription();

    return () => {
      if (headingSubscriptionRef.current) {
        headingSubscriptionRef.current.remove();
        headingSubscriptionRef.current = null;
      }
    };
  }, [headingEnabled, permissionGranted]);

  const getCurrentLocation = async () => {
    // In dev mode, return the mock location
    if (devMode && __DEV__) {
      return devLocationRef.current;
    }

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      //
    }
  };

  // Minimum distance (meters) before location state updates
  // 1m is tight enough to feel responsive while still filtering GPS noise
  const LOCATION_DISTANCE_FILTER_M = 1;

  const requestLocation = async () => {
    const newLocation = await getCurrentLocation();
    if (!newLocation) return;

    // Exact match — skip
    if (
      location &&
      newLocation.longitude === location.longitude &&
      newLocation.latitude === location.latitude
    ) {
      return;
    }

    // Distance filter — ignore tiny GPS drift (< 10m)
    if (location) {
      const R = 6371e3;
      const φ1 = (location.latitude * Math.PI) / 180;
      const φ2 = (newLocation.latitude * Math.PI) / 180;
      const Δφ = ((newLocation.latitude - location.latitude) * Math.PI) / 180;
      const Δλ = ((newLocation.longitude - location.longitude) * Math.PI) / 180;
      const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (dist < LOCATION_DISTANCE_FILTER_M) return;
    }

    lastLocationRef.current = newLocation;
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
    if (!player || !permissionGranted || !location) {
      return;
    }

    await requestPark();
  }, [player, permissionGranted, location?.latitude, location?.longitude]);

  // Continuous position watcher — streams GPS updates from the OS
  // instead of polling with getCurrentPositionAsync every 5s.
  // This is what makes the shark actively follow you as you walk.
  useEffect(() => {
    // Don't start watcher in dev mode (joystick handles it) or without permissions
    if ((devMode && __DEV__) || !permissionGranted || !player?.username) {
      return;
    }

    let cancelled = false;

    const startWatching = async () => {
      try {
        positionSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            // iOS: emit update after moving ~1 meter
            distanceInterval: 1,
            // Android: emit at least every 500ms for fluid tracking
            ...(Platform.OS === 'android' ? { timeInterval: 500 } : {}),
          },
          (locationUpdate) => {
            if (cancelled) return;

            const newLoc: LocationType = {
              latitude: locationUpdate.coords.latitude,
              longitude: locationUpdate.coords.longitude,
            };

            // Distance filter — skip tiny GPS drift
            const prev = lastLocationRef.current;
            if (prev) {
              const R = 6371e3;
              const p1 = (prev.latitude * Math.PI) / 180;
              const p2 = (newLoc.latitude * Math.PI) / 180;
              const dp = ((newLoc.latitude - prev.latitude) * Math.PI) / 180;
              const dl = ((newLoc.longitude - prev.longitude) * Math.PI) / 180;
              const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
              const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              if (dist < LOCATION_DISTANCE_FILTER_M) return;
            }

            lastLocationRef.current = newLoc;
            debouncedSetLocation(newLoc);
          }
        );
      } catch (error) {
        console.error('Failed to start position watcher:', error);
      }
    };

    startWatching();

    return () => {
      cancelled = true;
      if (positionSubscriptionRef.current) {
        positionSubscriptionRef.current.remove();
        positionSubscriptionRef.current = null;
      }
    };
  }, [devMode, permissionGranted, player?.username]);

  // Fallback poll — only fires if watchPositionAsync somehow stalls
  // (some Android devices throttle background location callbacks)
  useIntervalWhen(
    async () => {
      if (!positionSubscriptionRef.current) {
        await requestLocation();
      }
    },
    10000,
    Boolean(player && permissionGranted && player.username),
    true
  );

  useAsyncEffect(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();

    setPermissionGranted(status === 'granted');
  }, []);

  const reset = () => {
    setLocation(undefined);
    setParkLoaded(false);
    setPark(undefined);
    setHeading(null);
    smoothedHeadingRef.current = null;
    lastLocationRef.current = null;
    if (positionSubscriptionRef.current) {
      positionSubscriptionRef.current.remove();
      positionSubscriptionRef.current = null;
    }
  };

  return (
    <LocationContext.Provider
      value={{
        location,
        heading,
        headingEnabled,
        setHeadingEnabled,
        requestLocation,
        requestPark,
        reset,
        park,
        parkLoaded,
        permissionGranted,
        devMode,
        setDevMode,
        moveDevLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};
