import * as Location from 'expo-location';
import { createContext, FC, ReactNode, MutableRefObject, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { useAsyncEffect, useDebounce, useIntervalWhen } from 'rooks';
import currentPark from '../api/endpoints/me/current-park';
import { LocationType } from '../models/location-type';
import { ParkType } from '../models/park-type';
import { AuthContext } from './AuthProvider';
import { setDevModeEnabled, setDevLocation as setGlobalDevLocation } from '../helpers/dev-location-store';
import { shouldRefreshParkLookup, type ParkLookupRecord } from './parkLookupPolicy';

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
  /** Latest raw OS sample, even when map movement is filtered as GPS drift. */
  readonly latestLocationSampleRef: MutableRefObject<(LocationType & { timestamp: number;
    accuracyMeters?: number | null; speedMps?: number | null }) | null>;
  readonly heading: number | null;
  readonly headingEnabled: boolean;
  readonly setHeadingEnabled: (enabled: boolean) => void;
  readonly reset: () => void;
  readonly requestLocation: () => void;
  readonly requestPark: () => void;
  readonly park?: ParkType;
  readonly parkLoaded: boolean;
  readonly parkLookupRecord: ParkLookupRecord | null;
  readonly permissionGranted: boolean;
  /** True until we know the current permission status. */
  readonly permissionChecked: boolean;
  /** Asks for location (system prompt), or opens Settings once iOS won't ask again. */
  readonly requestPermission: () => Promise<boolean>;
  readonly setAccuracyMode: (mode: 'navigation' | 'queue') => void;
  // Dev joystick support
  readonly devMode: boolean;
  readonly setDevMode: (enabled: boolean) => void;
  readonly moveDevLocation: (dx: number, dy: number, speed: number) => void;
}

export const LocationContext = createContext<LocationContextType>(
  {} as LocationContextType
);

// Default dev location: Universal Studios Hollywood. EXPO_PUBLIC_DEV_START_LAT/LNG
// (dev builds only) drop the joystick at a specific ride for playtesting.
const DEV_DEFAULT_LAT = Number(process.env.EXPO_PUBLIC_DEV_START_LAT) || 34.1381;
const DEV_DEFAULT_LNG = Number(process.env.EXPO_PUBLIC_DEV_START_LNG) || -118.3534;

export const LocationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationType>();
  const latestLocationSampleRef = useRef<(LocationType & { timestamp: number;
    accuracyMeters?: number | null; speedMps?: number | null }) | null>(null);
  const [park, setPark] = useState<ParkType>();
  const { player, refreshPlayer } = useContext(AuthContext);
  const [parkLoaded, setParkLoaded] = useState<boolean>(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [permissionChecked, setPermissionChecked] = useState<boolean>(false);
  const [accuracyMode, setAccuracyMode] = useState<'navigation' | 'queue'>('navigation');
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
    latestLocationSampleRef.current = { ...newLoc, timestamp: Date.now() };
    setGlobalDevLocation(newLoc);
    setLocation(newLoc);
  }, []);

  // When dev mode is toggled on, set initial mock location and sync global store
  useEffect(() => {
    if (devMode && __DEV__) {
      setDevModeEnabled(true);
      setGlobalDevLocation(devLocationRef.current);
      latestLocationSampleRef.current = { ...devLocationRef.current, timestamp: Date.now() };
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
  const parkLookupRef = useRef<ParkLookupRecord | null>(null);
  const [parkLookupRecord, setParkLookupRecord] = useState<ParkLookupRecord | null>(null);
  const parkLookupPromiseRef = useRef<Promise<void> | null>(null);
  const [parkLookupVersion, setParkLookupVersion] = useState(0);
  const currentPlayerIdRef = useRef(player?.id);
  currentPlayerIdRef.current = player?.id;

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

  const lookupParkAt = (coordinates: LocationType): Promise<void> => {
    if (parkLookupPromiseRef.current) return parkLookupPromiseRef.current;
    const playerId = player?.id;
    const lookup = (async () => {
      try {
        const newPark = await currentPark(coordinates.latitude, coordinates.longitude);
        if (currentPlayerIdRef.current !== playerId) return;
        parkLookupRef.current = { ...coordinates, at: Date.now(), outcome: newPark ? 'park' : 'outside' };
        setParkLookupRecord(parkLookupRef.current);
        setParkLoaded(true);
        setPark(newPark ?? undefined);
        if ((newPark?.welcome_tickets_granted ?? 0) > 0) {
          try {
            await refreshPlayer();
          } catch (error) {
            console.warn('Could not refresh Tickets after park check-in:', error);
          }
        }
      } catch (error) {
        if (currentPlayerIdRef.current !== playerId) return;
        parkLookupRef.current = { ...coordinates, at: Date.now(), outcome: 'error' };
        setParkLookupRecord(parkLookupRef.current);
        // A temporary connection failure should not erase a known park.
        setParkLoaded(true);
      }
    })();
    parkLookupPromiseRef.current = lookup;
    void lookup.finally(() => {
      if (parkLookupPromiseRef.current === lookup) parkLookupPromiseRef.current = null;
      setParkLookupVersion(value => value + 1);
    });
    return lookup;
  };

  const requestPark = async () => {
    if (!location) {
      await requestLocation();
      setParkLoaded(false);
      setPark(undefined);
      return;
    }
    await lookupParkAt(location);
  };

  useEffect(() => {
    parkLookupRef.current = null;
    setParkLookupRecord(null);
    setParkLoaded(false);
    setPark(undefined);
  }, [player?.id]);

  useEffect(() => {
    if (!player?.id || !permissionGranted || !location || parkLookupPromiseRef.current ||
        !shouldRefreshParkLookup(location, parkLookupRef.current)) return;
    void lookupParkAt(location);
  }, [player?.id, permissionGranted, location?.latitude, location?.longitude, parkLookupVersion]);

  // A stationary guest still needs to recover from a failed check and refresh
  // a verified outside-park status when the park boundary may have changed.
  useEffect(() => {
    if (!player?.id || !permissionGranted || !location) return;
    const timer = setInterval(() => {
      if (!parkLookupPromiseRef.current &&
          shouldRefreshParkLookup(location, parkLookupRef.current)) {
        void lookupParkAt(location);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [player?.id, permissionGranted, location?.latitude, location?.longitude]);

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
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: accuracyMode === 'queue'
              ? Location.Accuracy.High : Location.Accuracy.BestForNavigation,
            // Queue play needs nearby samples for server heartbeats, but the
            // stationary guest does not need meter-by-meter map animation.
            distanceInterval: accuracyMode === 'queue' ? 3 : 1,
            ...(Platform.OS === 'android'
              ? { timeInterval: accuracyMode === 'queue' ? 3000 : 500 } : {}),
          },
          (locationUpdate) => {
            if (cancelled) return;

            const newLoc: LocationType = {
              latitude: locationUpdate.coords.latitude,
              longitude: locationUpdate.coords.longitude,
            };
            latestLocationSampleRef.current = { ...newLoc, timestamp: locationUpdate.timestamp,
              accuracyMeters: locationUpdate.coords.accuracy,
              speedMps: locationUpdate.coords.speed };

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
        // The mode or screen can change while the native watcher starts.
        // Never leave that older subscription alive after effect cleanup.
        if (cancelled) subscription.remove();
        else positionSubscriptionRef.current = subscription;
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
  }, [devMode, permissionGranted, player?.username, accuracyMode]);

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

  // Only check at launch. The prompt itself waits for the map's primer, where
  // the player sees why location matters; a cold prompt on the login screen
  // gets denied and can never be shown again.
  useAsyncEffect(async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    setPermissionGranted(status === 'granted');
    setPermissionChecked(true);
  }, []);

  const requestPermission = useCallback(async () => {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') { setPermissionGranted(true); return true; }
    if (!current.canAskAgain) {
      await Linking.openURL('app-settings:');
      return false;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermissionGranted(status === 'granted');
    return status === 'granted';
  }, []);

  // Coming back from Settings: pick up a permission granted there.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void Location.getForegroundPermissionsAsync().then(({ status }) => setPermissionGranted(status === 'granted'));
    });
    return () => sub.remove();
  }, []);

  const reset = () => {
    parkLookupRef.current = null;
    setParkLookupRecord(null);
    setLocation(undefined);
    setParkLoaded(false);
    setPark(undefined);
    setHeading(null);
    smoothedHeadingRef.current = null;
    lastLocationRef.current = null;
    latestLocationSampleRef.current = null;
    if (positionSubscriptionRef.current) {
      positionSubscriptionRef.current.remove();
      positionSubscriptionRef.current = null;
    }
  };

  return (
    <LocationContext.Provider
      value={{
        permissionChecked,
        requestPermission,
        location,
        latestLocationSampleRef,
        heading,
        headingEnabled,
        setHeadingEnabled,
        requestLocation,
        requestPark,
        reset,
        park,
        parkLoaded,
        parkLookupRecord,
        permissionGranted,
        setAccuracyMode,
        devMode,
        setDevMode,
        moveDevLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};
