import { useEffect, useState } from 'react';
import getFeatureFlags, { onFeatureFlags } from '../../api/endpoints/platform/feature-flags';

/**
 * LinePlay's one switch read: queue_tickets ("your first wait at a ride earns
 * a Ticket"). Copy about line Tickets shows only while it is on for this player
 * (core loop 4.1 and 1.12: App Store switches have it off). Read once per app
 * run; an unread or failed read counts as off, so nothing ever promises a
 * Ticket the server will not pay.
 */
let cached: boolean | null = null;
let pending: Promise<boolean> | null = null;
const listeners = new Set<(on: boolean) => void>();
// T095: a later answer (a retry after a slow read) updates LinePlay in place.
onFeatureFlags?.(payload => {
  cached = payload.flags?.queue_tickets === true;
  listeners.forEach(listener => listener(cached as boolean));
});

export function loadQueueTicketsOn(read: typeof getFeatureFlags = getFeatureFlags): Promise<boolean> {
  if (cached != null) return Promise.resolve(cached);
  pending ??= read().then(payload => {
    cached = payload.flags.queue_tickets === true;
    return cached;
  }).catch(() => { pending = null; return false; });
  return pending;
}

/** Tests only. */
export function resetLineFlagsForTests(): void {
  cached = null;
  pending = null;
}

export function useQueueTicketsOn(): boolean {
  const [on, setOn] = useState(cached ?? false);
  useEffect(() => {
    let live = true;
    void loadQueueTicketsOn().then(value => { if (live) setOn(value); });
    const listener = (value: boolean) => { if (live) setOn(value); };
    listeners.add(listener);
    return () => { live = false; listeners.delete(listener); };
  }, []);
  return on;
}
