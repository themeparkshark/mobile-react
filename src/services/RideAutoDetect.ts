/**
 * GPS Auto-Detect Service
 * 
 * Monitors user location and detects when they're near a ride.
 * Only activates when user is inside a park geofence.
 * Battery-conscious: coarse updates outside parks, fine inside.
 */

import * as Location from 'expo-location';
import { RideType } from '../api/endpoints/rides';

// Park geofences (center + radius in meters)
const PARK_GEOFENCES = [
  { id: 2, name: 'Magic Kingdom', lat: 28.4177, lng: -81.5812, radius: 800 },
  { id: 4, name: 'EPCOT', lat: 28.3747, lng: -81.5494, radius: 900 },
  { id: 5, name: 'Hollywood Studios', lat: 28.3575, lng: -81.5583, radius: 700 },
  { id: 6, name: 'Animal Kingdom', lat: 28.3553, lng: -81.5901, radius: 900 },
  { id: 8, name: 'Disneyland', lat: 33.8121, lng: -117.9190, radius: 500 },
  { id: 13, name: 'California Adventure', lat: 33.8069, lng: -117.9189, radius: 500 },
  { id: 3, name: 'Universal Studios FL', lat: 28.4754, lng: -81.4688, radius: 600 },
  { id: 7, name: 'Islands of Adventure', lat: 28.4721, lng: -81.4708, radius: 600 },
  { id: 10, name: 'Epic Universe', lat: 28.4740, lng: -81.4430, radius: 700 },
  { id: 9, name: 'Volcano Bay', lat: 28.4621, lng: -81.4709, radius: 400 },
  { id: 1, name: 'Universal Studios Hollywood', lat: 34.1381, lng: -118.3534, radius: 500 },
];

// Ride detection radius in meters
const RIDE_DETECTION_RADIUS = 50;
// Minimum time near a ride to trigger detection (ms)
const MIN_DWELL_TIME = 120000; // 2 minutes
// Cooldown after detection (ms) 
const DETECTION_COOLDOWN = 300000; // 5 minutes

interface RideProximityState {
  rideId: number;
  enteredAt: number;
  triggered: boolean;
}

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isInsidePark(lat: number, lng: number): { id: number; name: string } | null {
  for (const park of PARK_GEOFENCES) {
    const dist = haversineDistance(lat, lng, park.lat, park.lng);
    if (dist <= park.radius) return { id: park.id, name: park.name };
  }
  return null;
}

export function findNearbyRide(
  lat: number,
  lng: number,
  rides: RideType[]
): RideType | null {
  let closest: RideType | null = null;
  let closestDist = RIDE_DETECTION_RADIUS;

  for (const ride of rides) {
    if (!ride.lat || !ride.lng) continue;
    const dist = haversineDistance(lat, lng, ride.lat, ride.lng);
    if (dist < closestDist) {
      closestDist = dist;
      closest = ride;
    }
  }

  return closest;
}

export class RideAutoDetector {
  private proximityStates: Map<number, RideProximityState> = new Map();
  private lastDetectionTime: number = 0;
  private onRideDetected: (ride: RideType) => void;
  private rides: RideType[] = [];

  constructor(onRideDetected: (ride: RideType) => void) {
    this.onRideDetected = onRideDetected;
  }

  setRides(rides: RideType[]) {
    this.rides = rides;
  }

  processLocation(lat: number, lng: number) {
    const now = Date.now();

    // Cooldown check
    if (now - this.lastDetectionTime < DETECTION_COOLDOWN) return;

    const nearbyRide = findNearbyRide(lat, lng, this.rides);

    if (nearbyRide) {
      const existing = this.proximityStates.get(nearbyRide.id);
      if (!existing) {
        this.proximityStates.set(nearbyRide.id, {
          rideId: nearbyRide.id,
          enteredAt: now,
          triggered: false,
        });
      } else if (!existing.triggered && now - existing.enteredAt >= MIN_DWELL_TIME) {
        existing.triggered = true;
        this.lastDetectionTime = now;
        this.onRideDetected(nearbyRide);
      }
    }

    // Clean up old entries
    for (const [rideId, state] of Array.from(this.proximityStates)) {
      if (!nearbyRide || nearbyRide.id !== rideId) {
        if (now - state.enteredAt > MIN_DWELL_TIME * 2) {
          this.proximityStates.delete(rideId);
        }
      }
    }
  }
}

export { PARK_GEOFENCES, RIDE_DETECTION_RADIUS };
