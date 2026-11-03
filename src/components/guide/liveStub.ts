/**
 * Dev-only live feed stubs for the lane walks (core loop test states): 'off' makes the park's live
 * answers missing (state D: the guide and the in-line state must still work), 'open' answers every
 * ride open (a daytime park when the walk runs at night). Read only in a development bundle with
 * EXPO_PUBLIC_GUIDE_LIVE_STUB set, which only a lane's own Metro sets: a store or OTA bundle
 * (__DEV__ false, the variable unset) always uses the real feed.
 */
import type { LivePark } from '../../api/endpoints/parks/live';

export type LiveStubMode = 'off' | 'open' | null;

/** The posted wait the 'open' stub gives a ride the night feed left without one. */
export const STUB_WAIT_MINUTES = 15;

/** The stub mode for this bundle: always null outside a development bundle. */
export function liveStubMode(dev: boolean, value: string | undefined): LiveStubMode {
  if (!dev) return null;
  return value === 'off' || value === 'open' ? value : null;
}

/** Pure: the live answer the map sees under a stub. */
export function applyLiveStub(live: LivePark | null, mode: LiveStubMode, now: number): LivePark | null {
  if (!mode) return live;
  if (mode === 'off') return { rides: [], fetched_at: null };
  // A daytime park posts waits: a ride with none at night would read as a show (no line, no In line?).
  const rides = (live?.rides ?? []).map(ride => ({ ...ride, status: 'OPERATING' as const, wait: ride.wait ?? STUB_WAIT_MINUTES }));
  return { ...(live ?? { rides: [] }), rides, fetched_at: new Date(now).toISOString() };
}
