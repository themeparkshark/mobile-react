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
