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

/**
 * One fix of GPS jitter or one missed poll must not take the in-line offer away and bring it back (T074: the card
 * alternated at Indiana Jones). A shown dwell holds this long after its last good check, unless its wait just ended
 * or the detector now names another line.
 */
export const DWELL_HOLD_MS = 60_000;

/** Pure: the dwell to show after one check. */
export function nextDwell(previous: QueueDwell | null, seen: QueueDwell | null, shows: boolean, input: {
  readonly now: number;
  readonly lastShownAt: number | null;
  readonly endedRideId: number | null;
  readonly endedAt: number | null;
  /** Nearly still (no walk): a missed poll with no movement holds; walking off never does. */
  readonly still?: boolean;
  /**
   * Walking right now (walkingNow): the player walked off. It goes at once, even while the detector still names
   * that line from the time gathered there (T074 hold: Matterhorn's offer walked along to Mad Tea Party, then
   * dropped in front of a player standing in that line).
   */
  readonly walkedOff?: boolean;
}): QueueDwell | null {
  if (seen && shows) return previous?.rideId === seen.rideId ? previous : seen;
  if (!previous || input.lastShownAt == null) return null;
  if (input.walkedOff) return null;
  if (seen && seen.rideId !== previous.rideId) return null;
  // Out of that line's zone and walking: gone at once (never carried to the next ride).
  if (!seen && input.still === false) return null;
  if (input.endedRideId === previous.rideId && input.endedAt != null && input.now - input.endedAt < WAIT_ENDED_QUIET_MS) return null;
  return input.now - input.lastShownAt <= DWELL_HOLD_MS ? previous : null;
}

/**
 * Walking pace, not a line shuffle: more than this many meters inside WALK_WINDOW_MS. In a park the GPS watcher
 * sends a fix every 10 m (gpsWatchPolicy), so the window holds three or four fixes of a walk.
 */
export const WALK_METERS = 15;
export const WALK_WINDOW_MS = 30_000;

/**
 * Pure: the player is walking right now. The last two fixes are both more than WALK_METERS from where the player
 * was WALK_WINDOW_MS ago (a line moves a few meters at a time; one GPS jump and back is not a walk).
 */
export function walkingNow(samples: readonly Sample[], now: number): boolean {
  if (samples.length < 3) return false;
  // Where the player was WALK_WINDOW_MS ago: the last fix at or before then (iOS sends none while standing), else
  // the oldest fix inside the window.
  let ref = -1;
  for (let i = 0; i < samples.length; i++) if (now - samples[i].at >= WALK_WINDOW_MS) ref = i;
  if (ref < 0) ref = 0;
  const after = samples.slice(ref + 1);
  if (after.length < 2) return false;
  return after.slice(-2).every(s => meters(samples[ref], s) > WALK_METERS);
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
  const lastShownAt = useRef<number | null>(null);
  const lat = location?.latitude, lng = location?.longitude;
  useEffect(() => {
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const now = Date.now();
    // The last fix older than the still window stays too: where a player who stood still (iOS sends nothing) started
    // walking from. nearlyStill reads only the window.
    const older = samples.current.filter(s => now - s.at > DWELL_STILL_MS).slice(-1);
    samples.current = [...older, ...samples.current.filter(s => now - s.at <= DWELL_STILL_MS), { at: now, latitude: lat, longitude: lng }];
    // Walking off ends a shown offer at this fix, not at the next 10 s check.
    if (walkingNow(samples.current, now)) setDwell(previous => (previous ? null : previous));
  }, [lat, lng]);
  useEffect(() => {
    if (!enabled || !parkId) { setDwell(null); return; }
    const check = () => {
      const now = read();
      const at = Date.now();
      const shows = !!now && now.parkId === parkId && !walkingNow(samples.current, at) && dwellShows({ rideId: now.rideId, rideName: now.rideName, parkId: now.parkId }, {
        still: nearlyStill(samples.current, at), endedRideId: waitEnded?.rideId ?? null, endedAt: waitEnded?.at ?? null, now: at,
      });
      const walkedOff = walkingNow(samples.current, at);
      // Dev builds only: lane walks read the in-line decisions (never in a store bundle).
      if (__DEV__) console.log(`[dwell] seen=${now?.rideId ?? '-'} shows=${shows} walking=${walkedOff} still=${nearlyStill(samples.current, at)} fixes=${samples.current.length} t=${at}`);
      if (now && shows && !walkedOff) lastShownAt.current = at;
      setDwell(previous => nextDwell(previous,
        now && now.parkId === parkId ? { rideId: now.rideId, rideName: now.rideName, parkId: now.parkId } : null, shows,
        { now: at, lastShownAt: lastShownAt.current, endedRideId: waitEnded?.rideId ?? null, endedAt: waitEnded?.at ?? null,
          still: nearlyStill(samples.current, at), walkedOff }));
    };
    check();
    const timer = setInterval(check, everyMs);
    return () => clearInterval(timer);
  }, [parkId, enabled, read, everyMs]);
  return dwell;
}
