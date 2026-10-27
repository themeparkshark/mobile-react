/** Game timestamps without an offset come from the API's UTC database clock. */
export function gameTimestamp(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const input = value.trim().replace(' ', 'T');
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input) ? input : `${input}Z`;
  const time = Date.parse(zoned);
  return Number.isFinite(time) ? time : null;
}

export type TimedOpportunity = {
  readonly active_from?: string | null;
  readonly active_to?: string | null;
};

export function opportunityIsActive(item: TimedOpportunity, now = Date.now()): boolean {
  const from = gameTimestamp(item.active_from);
  const to = gameTimestamp(item.active_to);
  if (item.active_from && from === null || item.active_to && to === null) return false;
  return (from === null || from <= now) && (to === null || to > now);
}

/** Refresh at the next opening/expiry, with one foreground refresh per minute as a fallback. */
export function nextOpportunityRefresh(items: readonly TimedOpportunity[], now = Date.now()): number {
  let delay = 60_000;
  for (const item of items) {
    for (const date of [item.active_from, item.active_to]) {
      const boundary = gameTimestamp(date);
      if (boundary !== null && boundary > now) delay = Math.min(delay, boundary - now + 50);
    }
  }
  return delay;
}

const CLOSED_LIVE = new Set(['DOWN', 'CLOSED', 'REFURBISHMENT']);

/**
 * Can the find or ride the server says is in range be played right now? Timed
 * coins, keys, treats and rides keep to their window (a ride resting until
 * "Back 2:00 PM" is not playable yet), and a ride the live feed shows down,
 * closed or in refurbishment is not playable. A ride with no window is always on.
 */
export function nearbyOpportunityOpen(
  nearby: { readonly type: string; readonly model: unknown } | null | undefined,
  liveStatus: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!nearby) return false;
  const timed = nearby.type === 'coin' || nearby.type === 'key' || nearby.type === 'redeemable' || nearby.type === 'task';
  if (timed && !opportunityIsActive(nearby.model as TimedOpportunity, now)) return false;
  return !(nearby.type === 'task' && liveStatus && CLOSED_LIVE.has(liveStatus));
}

export type NearbyClosedReason =
  | { readonly kind: 'resting'; readonly at: number }
  | { readonly kind: 'down' | 'closed' | 'repairs' };

/**
 * Why the ride the player is standing at cannot be played right now, so the
 * PLAY RIDE spot can say so instead of showing nothing: resting until a time,
 * down, closed or closed for repairs. Null when it is open, or not a ride.
 */
export function nearbyRideClosedReason(
  nearby: { readonly type: string; readonly model: unknown } | null | undefined,
  liveStatus: string | null | undefined,
  now = Date.now(),
): NearbyClosedReason | null {
  if (!nearby || nearby.type !== 'task' || nearbyOpportunityOpen(nearby, liveStatus, now)) return null;
  if (liveStatus === 'DOWN') return { kind: 'down' };
  if (liveStatus === 'REFURBISHMENT') return { kind: 'repairs' };
  if (liveStatus === 'CLOSED') return { kind: 'closed' };
  const from = gameTimestamp((nearby.model as TimedOpportunity).active_from);
  if (from !== null && from > now) return { kind: 'resting', at: from };
  return { kind: 'closed' };
}
