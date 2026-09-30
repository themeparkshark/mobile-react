/**
 * RideDetectionService
 * 
 * Full GPS-based ride detection with AsyncStorage queuing,
 * dwell time analysis, re-ride detection, background location tracking,
 * wait times integration, and batch confirmation support.
 * 
 * KEY BEHAVIOR:
 * - Detections ALWAYS queue to AsyncStorage (for background persistence)
 * - If onForegroundDetection callback is set AND the app is active,
 *   the callback is ALSO called so the UI can show an immediate popup
 * - Nothing is auto-logged. User must confirm every detection.
 * 
 * RIDES CACHE: Rides are persisted to AsyncStorage so the background
 * task can load them in a fresh JS context (after app kill).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { RideType } from '../api/endpoints/rides';

const STORAGE_KEY = 'pending_ride_detections';
const RIDES_CACHE_KEY = 'ride_detection_rides_cache';
const DEFAULT_RIDE_RADIUS = 50; // fallback meters
const DEFAULT_MIN_DWELL_MS = 90_000; // 1.5 min default
const MAX_WALKTHROUGH_MS = 60_000; // anything under 1 min = walk-through
const RE_RIDE_GAP_MS = 180_000; // 3 min gap before counting as re-ride
const DETECTION_COOLDOWN_MS = 120_000; // 2 min cooldown per ride
const BACKGROUND_LOCATION_TASK = 'ride-detection-background';
// Catalog APIs also contain dining and shops; these are never ride candidates.
const DETECTABLE_TYPES = new Set(['ride', 'attraction', 'coaster', 'dark_ride',
  'flat_ride', 'water_ride', 'show', 'walk_through', 'transport', 'other']);
const AMBIGUOUS_DISTANCE_MARGIN = 15; // wait for a clearer GPS position between overlapping attractions

function isDetectionCandidate(ride: RideType): boolean {
  return DETECTABLE_TYPES.has(ride.type) && Number.isFinite(ride.lat) &&
    Number.isFinite(ride.lng) && Math.abs(ride.lat!) <= 90 && Math.abs(ride.lng!) <= 180;
}

export interface DetectedRide {
  id: string;
  rideId: number;
  rideName: string;
  rideType: string;
  parkId: number;
  enteredAt: number;
  exitedAt: number | null;
  dwellTimeMs: number;
  confidence: 'high' | 'medium' | 'low';
  isReRide: boolean;
  detectedAt: number;
}

interface ZoneState {
  rideId: number;
  rideName: string;
  rideType: string;
  parkId: number;
  enteredAt: number;
  lastSeenAt: number;
  rideDurationMinutes: number | null;
  minDwellMs: number;
}

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateId(): string {
  return `det_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function calculateConfidence(
  dwellMs: number,
  rideDurationMin: number | null,
  waitTimeMin: number | null,
): 'high' | 'medium' | 'low' {
  if (rideDurationMin != null && waitTimeMin != null) {
    const expectedMs = (rideDurationMin + waitTimeMin) * 60_000;
    const ratio = dwellMs / expectedMs;
    if (ratio >= 0.5 && ratio <= 2.0) return 'high';
    if (ratio >= 0.3 && ratio <= 3.0) return 'medium';
    return 'low';
  }

  if (rideDurationMin != null) {
    const expectedMs = rideDurationMin * 60_000;
    const ratio = dwellMs / expectedMs;
    if (ratio >= 0.5 && ratio <= 3.0) return 'high';
    if (ratio >= 0.3 && ratio <= 5.0) return 'medium';
    return 'low';
  }

  return dwellMs > 180_000 ? 'medium' : 'low';
}

class RideDetectionService {
  private zoneStates: Map<number, ZoneState> = new Map();
  private rides: RideType[] = [];
  private running = false;
  private lifecycleToken = 0;
  private currentWaitTimes: Map<number, number> = new Map();

  /**
   * Persistent re-ride / cooldown tracking.
   * Survives zone state deletion (which happens on every zone exit).
   * Key: rideId, Value: { lastDetectionTime, detectionCount }
   */
  private rideHistory: Map<number, { lastDetectionTime: number; detectionCount: number }> = new Map();

  /**
   * Mutex for AsyncStorage writes to prevent race conditions
   * when multiple rides exit on the same location update.
   */
  private writeQueue: Promise<void> = Promise.resolve();

  /**
   * Flag to snapshot AppState at detection time BEFORE any async work,
   * preventing stale reads after app transitions.
   */
  private lastKnownAppState: string = AppState.currentState;

  /**
   * Callback for foreground detections.
   * Set by useRideDetection when app is in foreground.
   */
  onForegroundDetection: ((detection: DetectedRide) => void) | null = null;

  constructor() {
    // Track AppState synchronously so we always have a fresh value
    AppState.addEventListener('change', (state) => {
      this.lastKnownAppState = state;
    });
  }

  setRides(rides: RideType[]) {
    this.rides = rides.filter(isDetectionCandidate);
    // Cache to AsyncStorage for background task (BUG 3 fix)
    this.cacheRides();
  }

  setCurrentWaitTimes(waitTimes: Map<number, number>) {
    this.currentWaitTimes = waitTimes;
  }

  /**
   * Cache rides to AsyncStorage so the background task can load them
   * in a fresh JS context after app kill.
   */
  private async cacheRides(): Promise<void> {
    try {
      // Only cache the fields needed for detection to keep storage small
      const minimal = this.rides.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        park_id: r.park_id,
        lat: r.lat,
        lng: r.lng,
        radius: r.radius,
        ride_duration_minutes: r.ride_duration_minutes,
        min_dwell_minutes: r.min_dwell_minutes,
      }));
      await AsyncStorage.setItem(RIDES_CACHE_KEY, JSON.stringify(minimal));
    } catch (e) {
      console.warn('Failed to cache rides for background detection:', e);
    }
  }

  /**
   * Load rides from cache. Called by background task when rides array is empty.
   */
  async loadRidesFromCache(): Promise<void> {
    if (this.rides.length > 0) return; // Already loaded
    try {
      const raw = await AsyncStorage.getItem(RIDES_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as RideType[];
        this.rides = cached.filter(isDetectionCandidate);
      }
    } catch (e) {
      console.warn('Failed to load rides from cache:', e);
    }
  }

  async startDetection(): Promise<boolean> {
    if (this.running) return true;
    const lifecycleToken = ++this.lifecycleToken;
    // LocationProvider already owns the foreground watcher used by the map.
    // Ride detection consumes that stream instead of starting a second GPS watch.
    this.running = true;

    // Background tracking starts only after the guest explicitly grants Always
    // access from park settings or an active LinePlay session.
    try {
      await this.syncBackgroundTracking();
    } catch (e) {
      console.warn('Background location not available:', e);
    }

    return lifecycleToken === this.lifecycleToken && this.running;
  }

  processForegroundLocation(lat: number, lng: number): void {
    if (this.running) this.processLocation(lat, lng);
  }

  async syncBackgroundTracking(): Promise<boolean> {
    if (!this.running) return false;
    const permission = await Location.getBackgroundPermissionsAsync();
    if (!this.running || !permission.granted) return false;
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) return true;
    if (!this.running) return false;
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 15000,
      distanceInterval: 10,
      // The foreground watcher handles active-screen ride detection.
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Theme Park Shark',
        notificationBody: 'Tracking your rides',
        notificationColor: '#00A5F5',
      },
    });
    if (!this.running) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      return false;
    }
    return true;
  }

  async stopDetection() {
    ++this.lifecycleToken;
    this.running = false;
    // Stopping/reloading is not evidence that a guest left or rode an attraction.
    // Already queued detections remain intact; unfinished zones are discarded.
    this.zoneStates.clear();

    // Stop background location
    try {
      if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch (e) {
      console.warn('Failed to stop background location:', e);
    }

  }

  /** Public so background task can call it */
  processLocation(lat: number, lng: number) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    const now = Date.now();
    const nearbyRides = this.findNearbyRides(lat, lng);
    const nearbyIds = new Set(nearbyRides.map(r => r.id));

    // Check for zone exits
    for (const [rideId, state] of Array.from(this.zoneStates.entries())) {
      if (!nearbyIds.has(rideId)) {
        const dwellMs = now - state.enteredAt;

        if (dwellMs <= MAX_WALKTHROUGH_MS) {
          this.zoneStates.delete(rideId);
          continue;
        }

        if (dwellMs > state.minDwellMs) {
          // Snapshot foreground state BEFORE async work (BUG 6 fix)
          const wasActive = this.lastKnownAppState === 'active';
          this.enqueueWrite(() => this.queueDetection(state, dwellMs, now, wasActive));
        }

        this.zoneStates.delete(rideId);
      } else {
        state.lastSeenAt = now;
      }
    }

    // Track one attraction at a time. Keep it until a genuine zone exit;
    // a crowded overlap with no clear closest attraction starts no new dwell.
    const candidates = nearbyRides.map(ride => ({ ride,
      distance: haversineDistance(lat, lng, ride.lat!, ride.lng!) }))
      .sort((a, b) => a.distance - b.distance || a.ride.id - b.ride.id);
    const unambiguous = candidates.length === 1 || (candidates.length > 1 &&
      candidates[1].distance - candidates[0].distance >= AMBIGUOUS_DISTANCE_MARGIN);
    const entries = this.zoneStates.size === 0 && unambiguous ? [candidates[0].ride] : [];
    for (const ride of entries) {
      if (!this.zoneStates.has(ride.id)) {
        // Check cooldown from rideHistory (BUG 1 fix - was checking zoneStates which is always empty here)
        const history = this.rideHistory.get(ride.id);
        if (history && now - history.lastDetectionTime < DETECTION_COOLDOWN_MS) {
          continue;
        }

        let minDwellMs = DEFAULT_MIN_DWELL_MS;
        if (ride.min_dwell_minutes != null) {
          minDwellMs = ride.min_dwell_minutes * 60_000;
        } else if (ride.ride_duration_minutes != null) {
          minDwellMs = ride.ride_duration_minutes * 60_000;
        }

        this.zoneStates.set(ride.id, {
          rideId: ride.id,
          rideName: ride.name,
          rideType: ride.type,
          parkId: ride.park_id,
          enteredAt: now,
          lastSeenAt: now,
          rideDurationMinutes: ride.ride_duration_minutes,
          minDwellMs,
        });
      }
    }
  }

  private findNearbyRides(lat: number, lng: number): RideType[] {
    return this.rides.filter(ride => {
      if (!isDetectionCandidate(ride)) return false;
      const dist = haversineDistance(lat, lng, ride.lat!, ride.lng!);
      const radius = ride.radius ?? DEFAULT_RIDE_RADIUS;
      return dist <= radius;
    });
  }

  /**
   * Enqueue an async write operation to prevent race conditions (BUG 2 fix).
   * All AsyncStorage writes go through this serial queue.
   */
  private enqueueWrite(fn: () => Promise<void>): Promise<void> {
    const operation = this.writeQueue.then(fn);
    this.writeQueue = operation.catch(e => {
      console.error('Write queue error:', e);
    });
    return operation;
  }

  private async queueDetection(state: ZoneState, dwellMs: number, exitTime: number, wasActive?: boolean) {
    // Update ride history for cooldown + re-ride tracking (BUG 1 fix)
    const history = this.rideHistory.get(state.rideId);
    const detectionCount = history ? history.detectionCount + 1 : 1;
    const isReRide = history != null && (exitTime - history.lastDetectionTime) < RE_RIDE_GAP_MS;

    this.rideHistory.set(state.rideId, {
      lastDetectionTime: exitTime,
      detectionCount,
    });

    const waitTime = this.currentWaitTimes.get(state.rideId) ?? null;
    const confidence = calculateConfidence(dwellMs, state.rideDurationMinutes, waitTime);

    const detection: DetectedRide = {
      id: generateId(),
      rideId: state.rideId,
      rideName: state.rideName,
      rideType: state.rideType,
      parkId: state.parkId,
      enteredAt: state.enteredAt,
      exitedAt: exitTime,
      dwellTimeMs: dwellMs,
      confidence,
      isReRide,
      detectedAt: Date.now(),
    };

    // Persist to AsyncStorage (survives app kill, background, etc.)
    try {
      const existing = await this.getPendingDetections();
      existing.push(detection);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch (e) {
      console.error('Failed to queue ride detection:', e);
    }

    // Use the pre-snapshotted AppState (BUG 6 fix)
    // Default to checking current state if wasActive wasn't passed (e.g., from stopDetection)
    const shouldFireForeground = wasActive ?? (this.lastKnownAppState === 'active');

    if (this.onForegroundDetection && shouldFireForeground) {
      try {
        this.onForegroundDetection(detection);
      } catch (e) {
        console.warn('Foreground detection callback error:', e);
      }
    }
  }

  async getPendingDetections(): Promise<DetectedRide[]> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const detections = JSON.parse(raw);
    if (!Array.isArray(detections)) throw new Error('Pending ride detections are not a list');
    return detections;
  }

  async clearPendingDetections(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }

  async removePendingDetection(id: string): Promise<void> {
    // Run through write queue to prevent races
    return this.enqueueWrite(async () => {
      // A failed storage read must never turn the queue into an empty array.
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const detections = raw ? JSON.parse(raw) as DetectedRide[] : [];
      const filtered = detections.filter(d => d.id !== id);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  getWaitTimeForRide(rideId: number): number | null {
    return this.currentWaitTimes.get(rideId) ?? null;
  }
}

// Singleton
const rideDetectionService = new RideDetectionService();

// Background location task — must be defined at top level
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }

  // BUG 3 fix: load rides from cache if not already loaded
  await rideDetectionService.loadRidesFromCache();

  const { locations } = data as { locations: Location.LocationObject[] };
  if (locations?.length) {
    const latest = locations[locations.length - 1];
    rideDetectionService.processLocation(latest.coords.latitude, latest.coords.longitude);
  }
});

export function startDetection() { return rideDetectionService.startDetection(); }
export function stopDetection() { return rideDetectionService.stopDetection(); }
export function syncBackgroundRideDetection() { return rideDetectionService.syncBackgroundTracking(); }
export function getPendingDetections() { return rideDetectionService.getPendingDetections(); }
export function clearPendingDetections() { return rideDetectionService.clearPendingDetections(); }
export function removePendingDetection(id: string) { return rideDetectionService.removePendingDetection(id); }
export function setDetectionRides(rides: RideType[]) { rideDetectionService.setRides(rides); }

export default rideDetectionService;
