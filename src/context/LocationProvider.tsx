import * as Location from 'expo-location';
import { createContext, FC, ReactNode, MutableRefObject, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { useAsyncEffect, useDebounce, useIntervalWhen } from 'rooks';
import currentPark from '../api/endpoints/me/current-park';
import { LocationType } from '../models/location-type';
import { ParkType } from '../models/park-type';
import { AuthContext } from './AuthProvider';
import { setDevModeEnabled, setDevLocation as setGlobalDevLocation } from '../helpers/dev-location-store';
import { nextParkPresence, NO_PARK_PRESENCE, shouldRefreshParkLookup, type ParkLookupRecord,
  type ParkPresence } from './parkLookupPolicy';
import { gpsWatchSettings } from './gpsWatchPolicy';
import { PositionFilter } from './positionFilter';

// Smoothing factor for heading (lower = smoother but laggier, higher = more responsive but jittery)
// Tuned for snappy but stable
const HEADING_SMOOTHING_FACTOR = 0.5; // snappy response
// Minimum heading change to register (prevents micro-jitters)
const HEADING_THRESHOLD = 2; // small dead zone for jitter
// Fast turn threshold - if turning quickly, be more responsive
const FAST_TURN_THRESHOLD = 8; // triggers fast mode quickly
const FAST_TURN_SMOOTHING = 0.75; // very responsive when turning
// iOS sends a compass sample for every 1 degree of turn (30+ a second while
// the phone moves). Each one re-renders the whole map, so cap the rate; the
// trailing sample is always delivered so the final heading is exact.
export const HEADING_MIN_INTERVAL_MS = 80;
// A watcher killed by an OS error (kCLErrorLocationUnknown indoors, right after
// the permission grant, a paused stream) is restarted after this delay.
export const WATCH_RESTART_DELAY_MS = 2000;

export interface LocationContextType {
  readonly location: LocationType | undefined;
  /** Latest raw OS sample, even when map movement is filtered as GPS drift. */
  readonly latestLocationSampleRef: MutableRefObject<(LocationType & { timestamp: number;
    accuracyMeters?: number | null; speedMps?: number | null }) | null>;
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

/**
 * Everything in LocationContext except the moving position. Park presence,
 * permission and the actions change rarely; `location` changes on every GPS
 * step. Screens and hosts that never read `location` subscribe here, so a
 * walk across the park no longer re-renders the app shell, Settings, the
 * standings or the feedback host on every fix. Read the newest fix through
 * `latestLocationSampleRef` when a handler needs it.
 */
export type LocationStatusContextType = Omit<LocationContextType, 'location'>;
export const LocationStatusContext = createContext<LocationStatusContextType>(
  {} as LocationStatusContextType
);

/**
 * Compass heading lives in its own context: it ticks many times a second, and
 * only the map needs it. Screens reading LocationContext no longer re-render
 * on every heading sample.
 */
export interface HeadingContextType {
  readonly heading: number | null;
  readonly headingEnabled: boolean;
  readonly setHeadingEnabled: (enabled: boolean) => void;
}

export const HeadingContext = createContext<HeadingContextType>({
  heading: null, headingEnabled: false, setHeadingEnabled: () => undefined,
});

// Default dev location: Universal Studios Hollywood. EXPO_PUBLIC_DEV_START_LAT/LNG
// (dev builds only) drop the joystick at a specific ride for playtesting.
// A simulated point is exact: dev builds report it as a 5 m fix so accuracy-gated flows
// (Fin-ister reef finds and haunt entry) work with the joystick. Release samples are untouched.
const DEV_SAMPLE_ACCURACY = __DEV__ ? { accuracyMeters: 5 } : {};
const DEV_DEFAULT_LAT = Number(process.env.EXPO_PUBLIC_DEV_START_LAT) || 34.1381;
const DEV_DEFAULT_LNG = Number(process.env.EXPO_PUBLIC_DEV_START_LNG) || -118.3534;
/** Where the App Store review account starts: inside Epic Universe (park 10). */
export const APP_REVIEW_START: LocationType = { latitude: 28.44071, longitude: -81.448 };

export const LocationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationType>();
  const latestLocationSampleRef = useRef<(LocationType & { timestamp: number;
    accuracyMeters?: number | null; speedMps?: number | null }) | null>(null);
  const [park, setParkState] = useState<ParkType>();
  // Sticky park state: entering is instant, leaving needs sustained outside
  // readings (see nextParkPresence). Only reset() and an account change clear it.
  const presenceRef = useRef<ParkPresence<ParkType>>(NO_PARK_PRESENCE);
  const clearPark = () => { presenceRef.current = NO_PARK_PRESENCE; setParkState(undefined); };
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

  // Dev joystick mock location - auto-enable in dev for testing. The App Store
  // review account gets it too, starting inside a park (App Review can't
  // visit one). Every other player always uses real GPS.
  const isAppReviewer = !!player?.is_app_reviewer;
  const simulationAllowed = __DEV__ || isAppReviewer;
  // EXPO_PUBLIC_DEV_REAL_GPS=1 starts a dev build on the real (or simulated) GPS stream instead of the joystick.
  const [devMode, setDevMode] = useState<boolean>(__DEV__ && process.env.EXPO_PUBLIC_DEV_REAL_GPS !== '1');
  const devLocationRef = useRef<LocationType>({ latitude: DEV_DEFAULT_LAT, longitude: DEV_DEFAULT_LNG });
  useEffect(() => {
    if (!isAppReviewer) return;
    devLocationRef.current = { ...APP_REVIEW_START };
    setDevMode(true);
  }, [isAppReviewer]);

  const moveDevLocation = useCallback((dx: number, dy: number, speed: number) => {
    const prev = devLocationRef.current;
    const newLoc = {
      latitude: prev.latitude + dy * speed,
      longitude: prev.longitude + dx * speed,
    };
    devLocationRef.current = newLoc;
    latestLocationSampleRef.current = { ...newLoc, timestamp: Date.now(), ...DEV_SAMPLE_ACCURACY };
    setGlobalDevLocation(newLoc);
    setLocation(newLoc);
  }, []);

  // When dev mode is toggled on, set initial mock location and sync global store
  useEffect(() => {
    if (devMode && simulationAllowed) {
      setDevModeEnabled(true);
      setGlobalDevLocation(devLocationRef.current);
      latestLocationSampleRef.current = { ...devLocationRef.current, timestamp: Date.now(), ...DEV_SAMPLE_ACCURACY };
      setLocation(devLocationRef.current);
      setPermissionGranted(true);
    } else {
      setDevModeEnabled(false);
    }
  }, [devMode, simulationAllowed]);

  // Heading state for compass-based map rotation
  const [heading, setHeadingState] = useState<number | null>(null);
  // Every map that wants the compass holds a claim; the sensor runs only while
  // at least one is mounted and focused.
  const [headingClaims, setHeadingClaims] = useState(0);
  const headingEnabled = headingClaims > 0;
  const setHeadingEnabled = useCallback((enabled: boolean) => {
    setHeadingClaims(count => Math.max(0, count + (enabled ? 1 : -1)));
  }, []);
  const lastHeadingEmitRef = useRef(0);
  const pendingHeadingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setHeading = (value: number | null) => {
    if (pendingHeadingRef.current) { clearTimeout(pendingHeadingRef.current); pendingHeadingRef.current = null; }
    if (value === null) { setHeadingState(null); return; }
    const wait = lastHeadingEmitRef.current + HEADING_MIN_INTERVAL_MS - Date.now();
    if (wait <= 0) { lastHeadingEmitRef.current = Date.now(); setHeadingState(value); return; }
    pendingHeadingRef.current = setTimeout(() => {
      pendingHeadingRef.current = null;
      lastHeadingEmitRef.current = Date.now();
      setHeadingState(value);
    }, wait);
  };
  // Bumped to tear down and restart the GPS watcher (OS error, back to foreground).
  const [watchEpoch, setWatchEpoch] = useState(0);
  const smoothedHeadingRef = useRef<number | null>(null);
  const headingSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const positionSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastLocationRef = useRef<LocationType | null>(null);
  // Every real GPS fix goes through this before it moves the shark: outliers
  // dropped, jitter smoothed, a dead zone while standing still (positionFilter.ts).
  const positionFilterRef = useRef<PositionFilter | null>(null);
  const positionFilter = () => (positionFilterRef.current ??= new PositionFilter());
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
      if (pendingHeadingRef.current) { clearTimeout(pendingHeadingRef.current); pendingHeadingRef.current = null; }
      if (headingSubscriptionRef.current) {
        headingSubscriptionRef.current.remove();
        headingSubscriptionRef.current = null;
      }
    };
  }, [headingEnabled, permissionGranted]);

  const getCurrentLocation = async () => {
    // In dev mode, return the mock location
    if (devMode && simulationAllowed) {
      return devLocationRef.current;
    }

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      //
    }
  };

  const requestLocation = async () => {
    // The joystick position is exact; a real fix goes through the same filter as the stream.
    if (devMode && simulationAllowed) {
      const newLocation = devLocationRef.current;
      if (location && newLocation.longitude === location.longitude && newLocation.latitude === location.latitude) return;
      lastLocationRef.current = newLocation;
      debouncedSetLocation(newLocation);
      return;
    }
    // Same clock and accuracy as the stream (the OS fix time), so the two paths never disagree.
    let fix: Location.LocationObject;
    try {
      fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    } catch {
      return;
    }
    const verdict = positionFilter().push({ latitude: fix.coords.latitude, longitude: fix.coords.longitude,
      accuracy: fix.coords.accuracy, speed: fix.coords.speed, timestamp: fix.timestamp });
    if (verdict.kind !== 'publish') return;
    lastLocationRef.current = verdict.position;
    debouncedSetLocation(verdict.position);
  };

  const lookupParkAt = (coordinates: LocationType): Promise<void> => {
    if (parkLookupPromiseRef.current) return parkLookupPromiseRef.current;
    const playerId = player?.id;
    const lookup = (async () => {
      try {
        const newPark = await currentPark(coordinates.latitude, coordinates.longitude,
          latestLocationSampleRef.current?.accuracyMeters);
        if (currentPlayerIdRef.current !== playerId) return;
        const at = Date.now();
        parkLookupRef.current = { ...coordinates, at, outcome: newPark ? 'park' : 'outside' };
        setParkLookupRecord(parkLookupRef.current);
        presenceRef.current = nextParkPresence(presenceRef.current, {
          outcome: newPark ? 'park' : 'outside', park: newPark, at,
          accuracyMeters: latestLocationSampleRef.current?.accuracyMeters,
        });
        setParkState(presenceRef.current.park);
        setParkLoaded(true);
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

  // Never clears the park. At launch this is called before the first GPS fix,
  // and a slow fix (10 s or more in a crowded park) used to land after the
  // watcher had already found the park, then wipe it: Travel Mode and a blank
  // map at Disneyland. Reads the newest fix through refs, not a stale closure.
  const requestPark = async () => {
    const known = lastLocationRef.current ?? location;
    if (known) {
      await lookupParkAt(known);
      return;
    }
    const fresh = await getCurrentLocation();
    if (!fresh) return;
    if (!lastLocationRef.current) {
      lastLocationRef.current = fresh;
      debouncedSetLocation(fresh);
    }
    await lookupParkAt(lastLocationRef.current);
  };

  // A different account (or sign-out) starts over; the same player never does.
  const parkOwnerRef = useRef(player?.id);
  useEffect(() => {
    if (parkOwnerRef.current === player?.id) return;
    parkOwnerRef.current = player?.id;
    parkLookupRef.current = null;
    setParkLookupRecord(null);
    setParkLoaded(false);
    clearPark();
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

  // How hard the watcher works depends on what is on screen (gpsWatchPolicy):
  // full precision for a map or a queue, coarser steps elsewhere in a park,
  // neighbourhood accuracy away from every park with no map showing.
  const watch = gpsWatchSettings({
    mapOnScreen: headingEnabled,
    queueTracking: accuracyMode === 'queue',
    inPark: !!park,
    confirmedOutside: !park && parkLookupRecord?.outcome === 'outside',
  });

  // Continuous position watcher — streams GPS updates from the OS
  // instead of polling with getCurrentPositionAsync every 5s.
  // This is what makes the shark actively follow you as you walk.
  useEffect(() => {
    // Don't start watcher in dev mode (joystick handles it) or without permissions
    if ((devMode && simulationAllowed) || !permissionGranted || !player?.username) {
      return;
    }

    let cancelled = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    // iOS ends the stream for good on any CoreLocation error (expo-location
    // finishes it and only reports through the error callback). Without this
    // the subscription looked alive, the fallback poll stayed off, and the
    // shark froze until the app was force-closed.
    const restartAfterError = (reason: unknown) => {
      if (cancelled || restartTimer) return;
      console.warn('Position watcher stopped, restarting:', reason);
      positionSubscriptionRef.current?.remove();
      positionSubscriptionRef.current = null;
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (!cancelled) setWatchEpoch(value => value + 1);
      }, WATCH_RESTART_DELAY_MS);
    };

    const startWatching = async () => {
      try {
        const subscription = await Location.watchPositionAsync(
          {
            // High (not BestForNavigation) with a 3 m step on a map: the shark
            // still glides as you walk, and the GPS radio is not flooded. Queue
            // play keeps the same step for its server heartbeats.
            accuracy: watch.accuracy === 'high' ? Location.Accuracy.High : Location.Accuracy.Balanced,
            distanceInterval: watch.distanceInterval,
            ...(Platform.OS === 'android' ? { timeInterval: watch.timeInterval } : {}),
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

            // Outliers, jitter and standing-still drift never reach the map.
            const verdict = positionFilter().push({ ...newLoc, accuracy: locationUpdate.coords.accuracy,
              speed: locationUpdate.coords.speed, timestamp: locationUpdate.timestamp });
            if (verdict.kind !== 'publish') return;

            lastLocationRef.current = verdict.position;
            debouncedSetLocation(verdict.position);
          },
          restartAfterError,
        );
        // The mode or screen can change while the native watcher starts.
        // Never leave that older subscription alive after effect cleanup.
        if (cancelled) subscription.remove();
        else positionSubscriptionRef.current = subscription;
      } catch (error) {
        console.error('Failed to start position watcher:', error);
        restartAfterError(error);
      }
    };

    startWatching();

    return () => {
      cancelled = true;
      if (restartTimer) clearTimeout(restartTimer);
      if (positionSubscriptionRef.current) {
        positionSubscriptionRef.current.remove();
        positionSubscriptionRef.current = null;
      }
    };
  }, [devMode, simulationAllowed, permissionGranted, player?.username, watch.accuracy, watch.distanceInterval, watch.timeInterval, watchEpoch]);

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

  // Coming back from Settings: pick up a permission granted there. Coming
  // back from anywhere: restart the GPS watcher, since iOS may have paused or
  // ended it while the app was in the background.
  useEffect(() => {
    let lastState = AppState.currentState;
    const sub = AppState.addEventListener('change', (state) => {
      const wasAway = lastState === 'background' || lastState === 'inactive';
      lastState = state;
      if (state !== 'active') return;
      void Location.getForegroundPermissionsAsync().then(({ status }) => setPermissionGranted(status === 'granted'));
      if (wasAway) setWatchEpoch(value => value + 1);
    });
    return () => sub.remove();
  }, []);

  const reset = () => {
    parkLookupRef.current = null;
    setParkLookupRecord(null);
    setLocation(undefined);
    setParkLoaded(false);
    clearPark();
    setHeading(null);
    smoothedHeadingRef.current = null;
    lastLocationRef.current = null;
    positionFilterRef.current?.reset();
    latestLocationSampleRef.current = null;
    if (positionSubscriptionRef.current) {
      positionSubscriptionRef.current.remove();
      positionSubscriptionRef.current = null;
    }
  };

  // Stable callbacks over the latest closures, so the context value only
  // changes when location state actually changes (not on every render).
  const latest = useRef({ requestLocation, requestPark, reset });
  latest.current = { requestLocation, requestPark, reset };
  const stableRequestLocation = useCallback(() => { void latest.current.requestLocation(); }, []);
  const stableRequestPark = useCallback(() => { void latest.current.requestPark(); }, []);
  const stableReset = useCallback(() => latest.current.reset(), []);

  const statusValue = useMemo<LocationStatusContextType>(() => ({
    permissionChecked,
    requestPermission,
    latestLocationSampleRef,
    requestLocation: stableRequestLocation,
    requestPark: stableRequestPark,
    reset: stableReset,
    park,
    parkLoaded,
    parkLookupRecord,
    permissionGranted,
    setAccuracyMode,
    devMode,
    setDevMode,
    moveDevLocation,
  }), [permissionChecked, requestPermission, stableRequestLocation, stableRequestPark, stableReset,
    park, parkLoaded, parkLookupRecord, permissionGranted, devMode, moveDevLocation]);
  const value = useMemo<LocationContextType>(() => ({ ...statusValue, location }), [statusValue, location]);
  const headingValue = useMemo<HeadingContextType>(() => ({ heading, headingEnabled, setHeadingEnabled }),
    [heading, headingEnabled, setHeadingEnabled]);

  return (
    <LocationContext.Provider value={value}>
      <LocationStatusContext.Provider value={statusValue}>
        <HeadingContext.Provider value={headingValue}>
          {children}
        </HeadingContext.Provider>
      </LocationStatusContext.Provider>
    </LocationContext.Provider>
  );
};
