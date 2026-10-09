import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getLiveEvents, openEventChest, type LiveEvent, type OpenChestResult } from '../../api/endpoints/live-events';
import useLivePoll from '../../hooks/useLivePoll';
import { pickEvent, pointsGained, starRideIds } from './model';

/**
 * One shared copy of "the event right now" for the map, the chip, the sheet
 * and the Star Ride badges, so they never disagree and there is one request
 * at a time.
 *
 * Battery: the poll runs only while a caller's screen is focused and the app
 * is awake (useLivePoll). Once a minute while an event is on; every 10
 * minutes while there is none (the server answers an empty list while the
 * switch is off); every 30 minutes after an error (an old server without the
 * route). Shared totals are cached on the server too.
 */
export const LIVE_POLL_MS = 60_000;
export const IDLE_POLL_MS = 10 * 60_000;
export const ERROR_POLL_MS = 30 * 60_000;

type State = {
  readonly parkId: number | null;
  readonly event: LiveEvent | null;
  readonly fetchedAt: number;
  readonly failed: boolean;
  /** Points gained at the last refresh (drives the "+N" toast once). */
  readonly gained: number;
  readonly gainedAt: number;
};

let state: State = { parkId: null, event: null, fetchedAt: 0, failed: false, gained: 0, gainedAt: 0 };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let inFlightPark: number | null | undefined;
let reqSeq = 0;

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function liveEventSnapshot(): State {
  return state;
}

export async function refreshLiveEvent(parkId: number | null, read: typeof getLiveEvents = getLiveEvents): Promise<void> {
  if (inFlight && inFlightPark === parkId) return inFlight;
  inFlightPark = parkId;
  const seq = ++reqSeq;
  const p: Promise<void> = read(parkId).then(events => {
    if (seq !== reqSeq) return; // a newer request (another park) owns the store
    const event = pickEvent(events);
    const gained = state.parkId === parkId || state.event?.id === event?.id ? pointsGained(state.event, event) : 0;
    set({ parkId, event, fetchedAt: Date.now(), failed: false, ...(gained > 0 ? { gained, gainedAt: Date.now() } : {}) });
  }).catch(() => {
    if (seq === reqSeq) set({ parkId, failed: true, fetchedAt: Date.now() });
  }).finally(() => { if (inFlight === p) { inFlight = null; inFlightPark = undefined; } });
  inFlight = p;
  return p;
}

/** After a chest opens, the server sends the fresh event back. */
export function applyOpenResult(result: OpenChestResult): void {
  ++reqSeq; // a poll that started before the open must not put the chest back
  set({ event: result.event, gained: 0 });
}

/** Sign-out and tests. */
export function resetLiveEvent(next?: Partial<State>): void {
  state = { parkId: null, event: null, fetchedAt: 0, failed: false, gained: 0, gainedAt: 0, ...next };
  inFlight = null;
  inFlightPark = undefined;
  listeners.forEach(fn => fn());
}

/** Why a chest did not open: the server said not yet, or the request never made it. */
export type OpenError = { readonly error: 'not_ready' | 'network' };

export function pollIntervalForState(s: Pick<State, 'event' | 'failed'>): number {
  if (s.failed) return ERROR_POLL_MS;
  return s.event ? LIVE_POLL_MS : IDLE_POLL_MS;
}

/**
 * The live event for this place (a park id, or null at home). Mount the
 * polling copy once (`poll: true`, on the map); every other caller only reads.
 */
export default function useLiveEvent(parkId: number | null, options: { readonly poll?: boolean; readonly focused?: boolean; readonly enabled?: boolean } = {}) {
  const { poll = false, focused = true, enabled = true } = options;
  const snap = useSyncExternalStore(subscribe, liveEventSnapshot, liveEventSnapshot);
  const load = useCallback(() => refreshLiveEvent(parkId), [parkId]);
  useLivePoll(load, pollIntervalForState(snap), { enabled: poll && enabled, focused, key: parkId ?? 'home' });
  const event = enabled && snap.parkId === parkId ? snap.event : null;
  return { event, gained: snap.parkId === parkId ? snap.gained : 0, gainedAt: snap.gainedAt, refresh: load };
}

/** Star Rides at this park today (task ids). Empty off-event or away from an event park. */
export function useStarRides(parkId: number | null): ReadonlySet<number> {
  const { event } = useLiveEvent(parkId);
  const ids = starRideIds(event);
  const key = [...ids].sort().join(',');
  const memo = useRef<{ key: string; ids: ReadonlySet<number> }>({ key, ids });
  if (memo.current.key !== key) memo.current = { key, ids };
  return memo.current.ids;
}

/** Open a chest; the store takes the server's fresh event. */
export function useOpenChest() {
  const [opening, setOpening] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const open = useCallback(async (eventId: number, key: string): Promise<OpenChestResult | OpenError> => {
    setOpening(key);
    try {
      const result = await openEventChest(eventId, key, state.parkId);
      applyOpenResult(result);
      return result;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      return { error: status === 409 || status === 404 ? 'not_ready' : 'network' };
    } finally {
      if (alive.current) setOpening(null);
    }
  }, []);
  return { open, opening };
}
