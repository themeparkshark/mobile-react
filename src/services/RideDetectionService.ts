/**
 * RideDetectionService
 * 
 * Full GPS-based ride detection with AsyncStorage queuing,
 * dwell time analysis, re-ride detection, background location tracking,
 * wait times integration, and batch confirmation support.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { RideType } from '../api/endpoints/rides';

const STORAGE_KEY = 'pending_ride_detections';
const DEFAULT_RIDE_RADIUS = 50; // fallback meters
const DEFAULT_MIN_DWELL_MS = 90_000; // 1.5 min default
const MAX_WALKTHROUGH_MS = 60_000; // anything under 1 min = walk-through
const RE_RIDE_GAP_MS = 180_000; // 3 min gap before counting as re-ride
const DETECTION_COOLDOWN_MS = 120_000; // 2 min cooldown per ride
const BACKGROUND_LOCATION_TASK = 'ride-detection-background';

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
  detectionCount: number;
  lastDetectionTime: number;
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
  // If we have wait time + ride duration, use combined expected dwell
  if (rideDurationMin != null && waitTimeMin != null) {
    const expectedMs = (rideDurationMin + waitTimeMin) * 60_000;
    const ratio = dwellMs / expectedMs;
    if (ratio >= 0.5 && ratio <= 2.0) return 'high';
    if (ratio >= 0.3 && ratio <= 3.0) return 'medium';
    return 'low';
  }

  // Ride duration only
  if (rideDurationMin != null) {
    const expectedMs = rideDurationMin * 60_000;
    const ratio = dwellMs / expectedMs;
    if (ratio >= 0.5 && ratio <= 3.0) return 'high';
    if (ratio >= 0.3 && ratio <= 5.0) return 'medium';
    return 'low';
  }

  // No duration info at all
  return dwellMs > 180_000 ? 'medium' : 'low';
}

class RideDetectionService {
  private zoneStates: Map<number, ZoneState> = new Map();
  private rides: RideType[] = [];
  private locationSubscription: Location.LocationSubscription | null = null;
  private running = false;
  private currentWaitTimes: Map<number, number> = new Map();

  setRides(rides: RideType[]) {
    this.rides = rides.filter(r => r.lat != null && r.lng != null);
  }

  /**
   * Store current wait times (minutes) keyed by ride ID.
   * Called from the wait times polling code.
   */
  setCurrentWaitTimes(waitTimes: Map<number, number>) {
    this.currentWaitTimes = waitTimes;
  }

  async startDetection(): Promise<boolean> {
    if (this.running) return true;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;

    this.running = true;

    // Foreground location watcher
    this.locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 10_000,
        distanceInterval: 5,
      },
      (location) => {
        this.processLocation(location.coords.latitude, location.coords.longitude);
      },
    );

    // Background location tracking
    try {
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus === 'granted') {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 15000,
          distanceInterval: 10,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Theme Park Shark',
            notificationBody: 'Tracking your rides 🦈',
            notificationColor: '#00A5F5',
          },
        });
      }
    } catch (e) {
      console.warn('Background location not available:', e);
    }

    return true;
  }

  async stopDetection() {
    this.running = false;
    this.locationSubscription?.remove();
    this.locationSubscription = null;

    // Stop background location
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch (e) {
      console.warn('Failed to stop background location:', e);
    }

    // Finalize any open zone states
    const now = Date.now();
    for (const [rideId, state] of Array.from(this.zoneStates.entries())) {
      const dwellMs = now - state.enteredAt;
      if (dwellMs > state.minDwellMs && dwellMs > MAX_WALKTHROUGH_MS) {
        this.queueDetection(state, dwellMs, now);
      }
    }
    this.zoneStates.clear();
  }

  /** Public so background task can call it */
  processLocation(lat: number, lng: number) {
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
          this.queueDetection(state, dwellMs, now);
        }

        this.zoneStates.delete(rideId);
      } else {
        state.lastSeenAt = now;
      }
    }

    // Check for zone enters
    for (const ride of nearbyRides) {
      if (!this.zoneStates.has(ride.id)) {
        const existing = this.zoneStates.get(ride.id);
        if (existing && now - existing.lastDetectionTime < DETECTION_COOLDOWN_MS) {
          continue;
        }

        // Calculate min dwell: prefer min_dwell_minutes, then ride_duration_minutes, then default
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
          detectionCount: existing ? existing.detectionCount + 1 : 1,
          lastDetectionTime: existing?.lastDetectionTime || 0,
        });
      }
    }
  }

  private findNearbyRides(lat: number, lng: number): RideType[] {
    return this.rides.filter(ride => {
      if (!ride.lat || !ride.lng) return false;
      const dist = haversineDistance(lat, lng, ride.lat, ride.lng);
      const radius = ride.radius ?? DEFAULT_RIDE_RADIUS;
      return dist <= radius;
    });
  }

  private async queueDetection(state: ZoneState, dwellMs: number, exitTime: number) {
    const isReRide = state.detectionCount > 1;
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

    try {
      const existing = await this.getPendingDetections();
      existing.push(detection);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch (e) {
      console.error('Failed to queue ride detection:', e);
    }

    state.lastDetectionTime = Date.now();
  }

  async getPendingDetections(): Promise<DetectedRide[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async clearPendingDetections(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }

  async removePendingDetection(id: string): Promise<void> {
    const detections = await this.getPendingDetections();
    const filtered = detections.filter(d => d.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }

  isRunning(): boolean {
    return this.running;
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
  const { locations } = data as { locations: Location.LocationObject[] };
  if (locations?.length) {
    const latest = locations[locations.length - 1];
    rideDetectionService.processLocation(latest.coords.latitude, latest.coords.longitude);
  }
});

export function startDetection() { return rideDetectionService.startDetection(); }
export function stopDetection() { return rideDetectionService.stopDetection(); }
export function getPendingDetections() { return rideDetectionService.getPendingDetections(); }
export function clearPendingDetections() { return rideDetectionService.clearPendingDetections(); }
export function setDetectionRides(rides: RideType[]) { rideDetectionService.setRides(rides); }

export default rideDetectionService;
