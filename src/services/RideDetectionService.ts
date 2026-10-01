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
import { QUEUE_RIDE_TYPES } from '../constants/queueRideTypes';

const STORAGE_KEY = 'pending_ride_detections';
const RIDES_CACHE_KEY = 'ride_detection_rides_cache';
const DEFAULT_RIDE_RADIUS = 50; // fallback meters
const DEFAULT_MIN_DWELL_MS = 90_000; // 1.5 min default
const MAX_WALKTHROUGH_MS = 60_000; // anything under 1 min = walk-through
const RE_RIDE_GAP_MS = 180_000; // 3 min gap before counting as re-ride
const DETECTION_COOLDOWN_MS = 120_000; // 2 min cooldown per ride
const BACKGROUND_LOCATION_TASK = 'ride-detection-background';
// Catalog APIs also contain dining and shops; these are never ride candidates.
// 'other' is what the catalog marks as no ride at all (a fortune-teller machine,
// a play area, a seasonal decoration), so it never asks "Did you just ride X?".
const DETECTABLE_TYPES = new Set(['ride', 'attraction', 'coaster', 'dark_ride',
  'flat_ride', 'water_ride', 'show', 'walk_through', 'transport']);
// wait for a clearer GPS position between overlapping attractions
const AMBIGUOUS_DISTANCE_MARGIN = 15;
/** Standing at one attraction this long suggests "In line at X? Play". */
export const DWELL_SUGGESTION_MS = 90_000;
/** Rides with a real queue to play in (no shows, walk-throughs or transport). */
const QUEUE_TYPES = new Set<string>(QUEUE_RIDE_TYPES);
/**
 * iOS sends no fixes while a guest stands still (the watcher has a distance
 * filter), so a slow indoor queue can go minutes without a sample. The queue
 * area stays current this long after the last fix that placed the guest in it.
 */
export const QUEUE_DWELL_STALE_MS = 5 * 60_000;
/**
 * The queue card weighs time, not fixes: each stretch between fixes counts for
 * the ride that was closest, and older time halves every minute. Walking in
 * past a neighbor makes many fixes while standing in line makes almost none,
 * so a per-fix score kept the walk-in ride on the card (Pixar Short Film
 * Spotlight while the guest stood on Space Mountain, 15 m away).
 */
const QUEUE_WEIGHT_HALF_LIFE_MS = 60_000;
/**
 * LinePlay proves which line the guest is in. Its ride gets the same reach the
 * server allows a queue heartbeat (LinePlaySessionController::isNearRide:
 * radius plus 75 m, at least 50 m, at most 250 m), because long queues spill
 * well past the 60 m zone around the ride point.
 */
const LINEPLAY_REACH_BUFFER_M = 75;
const LINEPLAY_REACH_MAX_M = 250;
const LINEPLAY_STORAGE_KEY = 'ride_detection_lineplay_ride';
/** A LinePlay ride that ended this long ago no longer names the ride logged. */
const LINEPLAY_STICKY_MAX_MS = 3 * 60 * 60_000;

interface QueueCandidate { ride: RideType; since: number; score: number }

/** One attraction zone inside the current visit, with the time it was the closest. */
interface VisitZone { ride: RideType; enteredAt: number; nearestMs: number }

/**
 * A stretch of time inside overlapping attraction zones. Every zone the guest
 * is in is tracked; the ride credited is the active LinePlay ride when it is
 * one of them, else the zone the guest was closest to for the longest time.
 */
interface ZoneVisit { zones: Map<number, VisitZone>; nearestId: number | null; lastFixAt: number }

interface LinePlayRide { rideId: number; endedAt: number | null }

function queueWeight(candidate: QueueCandidate, area: { lastSeenAt: number; nearestId: number | null }, now: number): number {
  const elapsed = Math.max(0, now - area.lastSeenAt);
  return candidate.score * 0.5 ** (elapsed / QUEUE_WEIGHT_HALF_LIFE_MS) +
    (candidate.ride.id === area.nearestId ? elapsed : 0);
}

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
  private visit: ZoneVisit | null = null;
  /** The ride of the current (or just finished) LinePlay session. */
  private linePlay: LinePlayRide | null = null;
  /**
   * The "In line at X? Play" suggestion, tracked apart from ride logging.
   * Ride logging credits the visit's longest dwell (or the LinePlay ride) when
   * the guest leaves; the queue card follows the ride the guest is closest to now. Disneyland's Buzz Lightyear Astro Blasters
   * sits 28 m from Star Tours and 37 m from Astro Orbitor, so the first zone a
   * guest walked through used to keep the card on the wrong ride (or none).
   */
  private queueArea: { lastSeenAt: number; nearestId: number | null; candidates: Map<number, QueueCandidate> } | null = null;
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
    this.rides = Array.isArray(rides) ? rides.filter(isDetectionCandidate) : [];
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
        this.rides = Array.isArray(cached) ? cached.filter(isDetectionCandidate) : [];
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
      // Always access is granted, so iOS does not need the blue status-bar
      // pill; it sat over other apps (streams, video) and tapping it opened us.
      showsBackgroundLocationIndicator: false,
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
    this.visit = null;
    this.queueArea = null;

    // Stop background location
    try {
      if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch (e) {
      console.warn('Failed to stop background location:', e);
    }

  }

  /**
   * Tell detection which ride the guest is playing LinePlay for (null when the
   * session ends). A ride ridden right after LinePlay is logged as that ride,
   * so the session stays in effect for the visit it overlapped.
   */
  setLinePlayRide(rideId: number | null, now = Date.now()): void {
    if (rideId != null && Number.isInteger(rideId) && rideId > 0) {
      this.linePlay = { rideId, endedAt: null };
    } else if (this.linePlay && this.linePlay.endedAt == null) {
      this.linePlay = { ...this.linePlay, endedAt: now };
      if (!this.linePlayInVisit()) this.linePlay = null;
    } else {
      return;
    }
    void this.persistLinePlay();
  }

  private linePlayInVisit(): boolean {
    const zone = this.linePlay && this.visit?.zones.get(this.linePlay.rideId);
    return !!zone && (this.linePlay!.endedAt == null || zone.enteredAt <= this.linePlay!.endedAt);
  }

  /** The LinePlay ride that still decides this fix, if any. */
  private activeLinePlayRideId(now: number): number | null {
    const linePlay = this.linePlay;
    if (!linePlay) return null;
    if (linePlay.endedAt == null) return linePlay.rideId;
    if (now - linePlay.endedAt <= LINEPLAY_STICKY_MAX_MS && this.linePlayInVisit()) return linePlay.rideId;
    return null;
  }

  private async persistLinePlay(): Promise<void> {
    try {
      if (this.linePlay) await AsyncStorage.setItem(LINEPLAY_STORAGE_KEY, JSON.stringify(this.linePlay));
      else await AsyncStorage.removeItem(LINEPLAY_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to save the LinePlay ride for detection:', e);
    }
  }

  /** Background task after an app kill: pick the LinePlay ride back up. */
  async loadLinePlayFromCache(): Promise<void> {
    if (this.linePlay) return;
    try {
      const raw = await AsyncStorage.getItem(LINEPLAY_STORAGE_KEY);
      const value = raw ? JSON.parse(raw) as LinePlayRide : null;
      if (value && Number.isInteger(value.rideId) && value.rideId > 0 && value.endedAt == null) {
        this.linePlay = { rideId: value.rideId, endedAt: null };
      }
    } catch (e) {
      console.warn('Failed to load the LinePlay ride for detection:', e);
    }
  }

  /** Public so background task can call it */
  processLocation(lat: number, lng: number) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    const now = Date.now();
    const linePlayRideId = this.activeLinePlayRideId(now);
    const ranked = this.findNearbyRides(lat, lng, linePlayRideId);
    const nearbyRides = ranked.map(entry => entry.ride);
    const nearbyIds = new Set(nearbyRides.map(r => r.id));
    this.trackQueueArea(lat, lng, nearbyRides, now);

    let visit = this.visit;
    if (visit) {
      // The time since the last fix belongs to the ride the guest was closest to.
      const nearest = visit.nearestId != null ? visit.zones.get(visit.nearestId) : undefined;
      if (nearest) nearest.nearestMs += Math.max(0, now - visit.lastFixAt);
      const credited = this.creditedZone(visit, linePlayRideId);
      if (credited && !nearbyIds.has(credited.ride.id)) {
        // Leaving the credited ride's zone ends the visit, even while a
        // neighbor's overlapping zone still holds the guest.
        this.closeVisit(credited, now);
        visit = null;
      } else {
        for (const rideId of Array.from(visit.zones.keys())) {
          if (!nearbyIds.has(rideId)) visit.zones.delete(rideId);
        }
      }
    }
    if (ranked.length === 0) { this.visit = null; return; }

    if (!visit) visit = this.visit = { zones: new Map(), nearestId: null, lastFixAt: now };
    for (const ride of nearbyRides) {
      if (!visit.zones.has(ride.id)) visit.zones.set(ride.id, { ride, enteredAt: now, nearestMs: 0 });
    }
    // A crowded overlap with no clear closest attraction keeps crediting the
    // ride that was clearly closest before (or nothing), so GPS jitter cannot
    // move credit. Two points 15 m apart can never differ by a full 15 m off
    // their axis, so the margin shrinks to half the gap between them.
    let unambiguous = ranked.length === 1;
    if (ranked.length > 1) {
      const gap = haversineDistance(ranked[0].ride.lat!, ranked[0].ride.lng!, ranked[1].ride.lat!, ranked[1].ride.lng!);
      const lead = ranked[1].distance - ranked[0].distance;
      unambiguous = lead > 0 && lead >= Math.min(AMBIGUOUS_DISTANCE_MARGIN, gap / 2);
    }
    if (unambiguous) visit.nearestId = ranked[0].ride.id;
    else if (visit.nearestId != null && !visit.zones.has(visit.nearestId)) visit.nearestId = null;
    visit.lastFixAt = now;
  }

  /**
   * The active LinePlay ride when the guest is in its zone, else the longest
   * dwell as the clearly closest ride. Null while no ride was ever clearly closest.
   */
  private creditedZone(visit: ZoneVisit, linePlayRideId: number | null): VisitZone | null {
    if (linePlayRideId != null) {
      const linePlayZone = visit.zones.get(linePlayRideId);
      if (linePlayZone) return linePlayZone;
    }
    let best: VisitZone | null = null;
    for (const zone of visit.zones.values()) {
      if (zone.nearestMs <= 0 && zone.ride.id !== visit.nearestId) continue;
      if (!best || zone.nearestMs > best.nearestMs ||
          (zone.nearestMs === best.nearestMs && zone.enteredAt < best.enteredAt)) best = zone;
    }
    return best;
  }

  private closeVisit(zone: VisitZone, now: number): void {
    this.visit = null;
    if (this.linePlay?.endedAt != null) {
      this.linePlay = null;
      void this.persistLinePlay();
    }
    const { ride } = zone;
    const dwellMs = now - zone.enteredAt;
    if (dwellMs <= MAX_WALKTHROUGH_MS) return;
    const history = this.rideHistory.get(ride.id);
    if (history && zone.enteredAt - history.lastDetectionTime < DETECTION_COOLDOWN_MS) return;
    let minDwellMs = DEFAULT_MIN_DWELL_MS;
    if (ride.min_dwell_minutes != null) {
      minDwellMs = ride.min_dwell_minutes * 60_000;
    } else if (ride.ride_duration_minutes != null) {
      minDwellMs = ride.ride_duration_minutes * 60_000;
    }
    if (dwellMs <= minDwellMs) return;
    const state: ZoneState = {
      rideId: ride.id,
      rideName: ride.name,
      rideType: ride.type,
      parkId: ride.park_id,
      enteredAt: zone.enteredAt,
      lastSeenAt: now,
      rideDurationMinutes: ride.ride_duration_minutes,
      minDwellMs,
    };
    // Snapshot foreground state BEFORE async work (BUG 6 fix)
    const wasActive = this.lastKnownAppState === 'active';
    this.enqueueWrite(() => this.queueDetection(state, dwellMs, now, wasActive));
  }

  private trackQueueArea(lat: number, lng: number, nearbyRides: RideType[], now: number): void {
    const queueRides = nearbyRides.filter(ride => QUEUE_TYPES.has(ride.type))
      .map(ride => ({ ride, distance: haversineDistance(lat, lng, ride.lat!, ride.lng!) }))
      .sort((a, b) => a.distance - b.distance || a.ride.id - b.ride.id);
    if (queueRides.length === 0) { this.queueArea = null; return; }
    if (!this.queueArea || now - this.queueArea.lastSeenAt > QUEUE_DWELL_STALE_MS) {
      this.queueArea = { lastSeenAt: now, nearestId: null, candidates: new Map() };
    }
    const area = this.queueArea;
    const inside = new Set(queueRides.map(entry => entry.ride.id));
    for (const [rideId, candidate] of Array.from(area.candidates.entries())) {
      if (!inside.has(rideId)) area.candidates.delete(rideId);
      else candidate.score = queueWeight(candidate, area, now);
    }
    for (const { ride } of queueRides) {
      if (!area.candidates.has(ride.id)) area.candidates.set(ride.id, { ride, since: now, score: 0 });
    }
    area.lastSeenAt = now;
    area.nearestId = queueRides[0].ride.id;
  }

  private findNearbyRides(lat: number, lng: number, linePlayRideId: number | null = null): { ride: RideType; distance: number }[] {
    const nearby: { ride: RideType; distance: number }[] = [];
    for (const ride of this.rides) {
      if (!isDetectionCandidate(ride)) continue;
      const distance = haversineDistance(lat, lng, ride.lat!, ride.lng!);
      let radius = ride.radius ?? DEFAULT_RIDE_RADIUS;
      if (ride.id === linePlayRideId && this.linePlay?.endedAt == null) {
        radius = Math.min(LINEPLAY_REACH_MAX_M, Math.max(50, radius) + LINEPLAY_REACH_BUFFER_M);
      }
      if (distance <= radius) nearby.push({ ride, distance });
    }
    return nearby.sort((a, b) => a.distance - b.distance || a.ride.id - b.ride.id);
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

  /**
   * The attraction the player has been standing at for at least `minMs` right
   * now (the map's "In line at X? Play" card). Read-only; null when none.
   */
  currentDwell(minMs = DWELL_SUGGESTION_MS, now = Date.now()): { rideId: number; rideName: string; parkId: number; dwellMs: number } | null {
    const area = this.queueArea;
    if (!area || now - area.lastSeenAt > QUEUE_DWELL_STALE_MS) return null;
    // Time since the last fix counts for the ride the guest stood closest to:
    // iOS sends nothing while a guest stands still in line.
    let leader: QueueCandidate | null = null, leaderWeight = -1;
    for (const candidate of area.candidates.values()) {
      const weight = queueWeight(candidate, area, now);
      if (!leader || weight > leaderWeight || (weight === leaderWeight &&
          (candidate.ride.id === area.nearestId || (leader.ride.id !== area.nearestId && candidate.since < leader.since)))) {
        leader = candidate; leaderWeight = weight;
      }
    }
    if (!leader) return null;
    const dwellMs = now - leader.since;
    if (dwellMs < minMs) return null;
    return { rideId: leader.ride.id, rideName: leader.ride.name, parkId: leader.ride.park_id, dwellMs };
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
    // Code 0 is CoreLocation's kCLErrorLocationUnknown: transient, the next fix
    // follows on its own. Anything else is worth a warning, never a red box.
    if ((error as { code?: number }).code !== 0) console.warn('Background location error:', error);
    return;
  }

  // On screen, useRideDetection already feeds every foreground fix (3-10 m
  // steps). The background stream would only run the same detection twice.
  if (AppState.currentState === 'active' && rideDetectionService.onForegroundDetection) return;

  // BUG 3 fix: load rides from cache if not already loaded
  await rideDetectionService.loadRidesFromCache();
  await rideDetectionService.loadLinePlayFromCache();

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
export function setLinePlayDetectionRide(rideId: number | null) { rideDetectionService.setLinePlayRide(rideId); }

export default rideDetectionService;
export function currentRideDwell(minMs?: number) { return rideDetectionService.currentDwell(minMs); }
