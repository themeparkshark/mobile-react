import { useEffect, useRef, useState } from 'react';
import { currentRideDwell } from '../../services/RideDetectionService';

export interface QueueDwell { readonly rideId: number; readonly rideName: string; readonly parkId: number }

/** Over the last DWELL_STILL_MS the player stayed within this many meters: "nearly still" (a line shuffles, a walker does not). */
export const DWELL_STILL_METERS = 35;
export const DWELL_STILL_MS = 90_000;
/** After a wait ends (LinePlay at that ride), its line never asks "In line?" again for this long. */
export const WAIT_ENDED_QUIET_MS = 30 * 60 * 1000;

type Sample = { readonly at: number; readonly latitude: number; readonly longitude: number };

const meters = (a: Sample, b: Sample) => {
  const k = Math.cos(((a.latitude + b.latitude) / 2) * Math.PI / 180);
  return Math.hypot((b.latitude - a.latitude) * 111_320, (b.longitude - a.longitude) * 111_320 * k);
};

/**
 * Pure: the player has been nearly still for DWELL_STILL_MS (every sample in that window within
 * DWELL_STILL_METERS of the newest). With too little history (a fresh map, or GPS that sends no
 * fixes while standing still) it is still: iOS stops sending fixes to a guest standing in line.
 */
export function nearlyStill(samples: readonly Sample[], now: number): boolean {
  if (!samples.length) return true;
  const last = samples[samples.length - 1];
  return samples.filter(s => now - s.at <= DWELL_STILL_MS).every(s => meters(s, last) <= DWELL_STILL_METERS);
}

/** Pure: whether a dwell may show (core loop 4.1 in-line state): still, and not a wait that just ended at that ride. */
export function dwellShows(dwell: QueueDwell | null, input: {
  readonly still: boolean;
  readonly endedRideId: number | null;
  readonly endedAt: number | null;
  readonly now: number;
}): boolean {
  if (!dwell || !input.still) return false;
  if (input.endedRideId === dwell.rideId && input.endedAt != null && input.now - input.endedAt < WAIT_ENDED_QUIET_MS) return false;
  return true;
}

let waitEnded: { rideId: number; at: number } | null = null;
/** A wait at this ride just ended (the player opened LinePlay for it from the map): no "In line?" there for a while. */
export function noteWaitEnded(rideId: number, at = Date.now()): void {
  waitEnded = { rideId, at };
}

/**
 * Polls the ride detector for a 90 s dwell at one queue ride in this park (the detector keeps only
 * real queue rides: no show, street, transport or walk-through). The guide's in-line state needs the
 * player nearly still too, and never asks about a wait that just ended. Stops when the map is not
 * focused.
 */
export default function useQueueDwell(parkId: number | null, enabled: boolean, read = currentRideDwell, everyMs = 10_000,
  location?: { readonly latitude: number; readonly longitude: number } | null): QueueDwell | null {
  const [dwell, setDwell] = useState<QueueDwell | null>(null);
  const samples = useRef<Sample[]>([]);
  const lat = location?.latitude, lng = location?.longitude;
  useEffect(() => {
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const now = Date.now();
    samples.current = [...samples.current.filter(s => now - s.at <= DWELL_STILL_MS), { at: now, latitude: lat, longitude: lng }];
  }, [lat, lng]);
  useEffect(() => {
    if (!enabled || !parkId) { setDwell(null); return; }
    const check = () => {
      const now = read();
      const at = Date.now();
      const shows = !!now && now.parkId === parkId && dwellShows({ rideId: now.rideId, rideName: now.rideName, parkId: now.parkId }, {
        still: nearlyStill(samples.current, at), endedRideId: waitEnded?.rideId ?? null, endedAt: waitEnded?.at ?? null, now: at,
      });
      setDwell(previous => {
        if (!now || !shows) return null;
        return previous?.rideId === now.rideId ? previous : { rideId: now.rideId, rideName: now.rideName, parkId: now.parkId };
      });
    };
    check();
    const timer = setInterval(check, everyMs);
    return () => clearInterval(timer);
  }, [parkId, enabled, read, everyMs]);
  return dwell;
}
