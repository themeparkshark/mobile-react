/**
 * The posted-wait feed for LinePlay, Wait Times and ride detection, with the lane walks' dev-only stub
 * (core loop test states). It reads the same switch as the map's stub (guide-map,
 * src/components/guide/liveStub.ts), so one lane Metro stubs the whole app:
 *  - 'open': every ride answers open, with a posted wait (a daytime park when the walk runs at night),
 *  - 'off': the feed answers nothing (state D: LinePlay, the ride step and Wait Times must still work).
 * Only a development bundle with EXPO_PUBLIC_GUIDE_LIVE_STUB set, which only a lane's own Metro sets, ever
 * stubs. A store or OTA bundle (__DEV__ false, the variable unset) always reads the real feed.
 */
import getWikiTimes, { type WikiLiveEntry } from '../../api/endpoints/parks/queue-times/getWikiTimes';

export type WaitFeedStub = 'off' | 'open' | null;

/** The stub for this bundle: always null outside a development bundle. */
export function waitFeedStubMode(dev: boolean, value: string | undefined): WaitFeedStub {
  if (!dev) return null;
  return value === 'off' || value === 'open' ? value : null;
}

/** A steady made-up posted wait for a ride the stub opens (5 to 45 min, the same every call). */
export function stubPostedWait(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return 5 + (hash % 9) * 5;
}

/** Pure: what the feed answers under a stub. */
export function applyWaitFeedStub(entries: readonly WikiLiveEntry[], mode: WaitFeedStub): WikiLiveEntry[] {
  if (mode === 'off') return [];
  if (mode !== 'open') return [...entries];
  return entries.map(entry => ({
    ...entry,
    status: 'OPERATING' as const,
    queue: { ...entry.queue, STANDBY: { waitTime: entry.queue?.STANDBY?.waitTime ?? stubPostedWait(entry.id) } },
  }));
}

const STUB = waitFeedStubMode(typeof __DEV__ !== 'undefined' && __DEV__, process.env.EXPO_PUBLIC_GUIDE_LIVE_STUB);

/** getWikiTimes, through the lane stub in a development bundle that asks for one. */
export default async function waitFeed(parkId: number, signal?: AbortSignal): Promise<WikiLiveEntry[]> {
  if (STUB === 'off') return [];
  const entries = await getWikiTimes(parkId, signal);
  return STUB ? applyWaitFeedStub(entries, STUB) : entries;
}
