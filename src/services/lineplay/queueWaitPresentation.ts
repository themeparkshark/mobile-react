import type { WikiLiveEntry } from '../../api/endpoints/parks/queue-times/getWikiTimes';

/** Zero is a real posted wait. Missing, negative, and malformed values are unknown. */
export function postedStandbyWait(entry: WikiLiveEntry): number | null {
  const wait = entry.queue?.STANDBY?.waitTime;
  return typeof wait === 'number' && Number.isFinite(wait) && wait >= 0 ? wait : null;
}

/** Unknown waits stay after known waits in either wait-order view. */
export function compareQueueWaits(a: WikiLiveEntry, b: WikiLiveEntry,
  direction: 'wait-asc' | 'wait-desc'): number {
  const aWait = a.status === 'OPERATING' ? postedStandbyWait(a) : null;
  const bWait = b.status === 'OPERATING' ? postedStandbyWait(b) : null;
  if (aWait === null && bWait === null) return a.name.localeCompare(b.name);
  if (aWait === null) return 1;
  if (bWait === null) return -1;
  return (direction === 'wait-desc' ? bWait - aWait : aWait - bWait) || a.name.localeCompare(b.name);
}
