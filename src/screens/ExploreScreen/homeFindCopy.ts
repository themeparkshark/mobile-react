import { HOME_PREP_PICKUP_RADIUS_METERS } from './homePickupRange';

/**
 * Plain words for the home map. Every string a player reads about a find
 * (distance, range, how long it stays, what it is for) comes from here so the
 * marker, the find card and the intro always say the same thing.
 */

/** The server grabs within this radius (PrepItemSpawner::COLLECTION_RANGE_METERS). */
export function isInPickupRange(distanceMeters: number | null | undefined): boolean {
  return distanceMeters != null && Number.isFinite(distanceMeters) &&
    distanceMeters <= HOME_PREP_PICKUP_RADIUS_METERS;
}

/** "75 m", "120 m", "1.2 km". Rounded to 5 m so GPS jitter does not flicker the label. */
export function formatFindDistance(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return '';
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} km`;
  return `${Math.max(5, Math.round(distanceMeters / 5) * 5)} m`;
}

/**
 * "leaves in 21 min", "leaves in 1h 5 min", "leaves in 40s". Null once it is gone.
 * Minutes round up so a find never says "leaves in 0m" while it is still there.
 */
export function formatLeavesIn(msRemaining: number): string | null {
  if (!Number.isFinite(msRemaining) || msRemaining <= 0) return null;
  const seconds = Math.ceil(msRemaining / 1000);
  if (seconds < 60) return `leaves in ${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `leaves in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `leaves in ${hours}h ${rest} min` : `leaves in ${hours}h`;
}

/**
 * When the "leaves in" label next changes, so a marker re-renders once a
 * minute (once a second only in its final minute) instead of every second.
 */
export function msUntilLeavesInChanges(msRemaining: number): number {
  if (!Number.isFinite(msRemaining) || msRemaining <= 0) return 0;
  if (msRemaining <= 60_000) return Math.max(50, msRemaining % 1000 || 1000);
  const toMinute = msRemaining % 60_000;
  // Landing exactly on 60 s switches to the seconds countdown.
  return Math.max(50, toMinute === 0 ? 60_000 : toMinute);
}

/** "Churro Collection" -> "Churro". Null when the set name gives no noun. */
function setNoun(setName: string | null | undefined): string | null {
  if (!setName) return null;
  const noun = setName.replace(/\b(collection|set)\b/gi, '').replace(/\s+/g, ' ').trim();
  return noun || null;
}

/** "Snickerdoodle" in the Churro Collection reads "Snickerdoodle Churro". */
export function findDisplayName(name: string, setName?: string | null): string {
  const trimmed = name.trim();
  // Only the old "X Collection" sets name their items by flavor ("Snickerdoodle"); v3 items carry full names.
  if (!setName || !/\bcollection\b/i.test(setName)) return trimmed;
  const noun = setNoun(setName);
  if (!noun) return trimmed;
  const singular = noun.replace(/s$/i, '');
  if (trimmed.toLowerCase().includes(singular.toLowerCase())) return trimmed;
  return `${trimmed} ${singular}`;
}

/** "Churro Collection: 3/12", or just the set name when progress is unknown. */
export function setProgressLabel(setName: string | null | undefined,
  collected?: number | null, total?: number | null): string | null {
  if (!setName) return null;
  if (total == null || !Number.isFinite(total) || total <= 0 || collected == null || !Number.isFinite(collected)) {
    return setName;
  }
  return `${setName}: ${Math.max(0, Math.min(collected, total))}/${total}`;
}

/** The find card's action line. */
export function findActionLine(distanceMeters: number): string {
  if (isInPickupRange(distanceMeters)) return 'In range. Tap to grab it!';
  return `${formatFindDistance(distanceMeters)} away · Walk closer to grab it`;
}

/**
 * The Ticket line. ticket_guarantee_in is the most finds left before a Ticket
 * is guaranteed (one can drop sooner). Hidden when today's home Tickets are used up.
 */
export function ticketLine(findsUntilTicket: number | null | undefined, capped = false): string | null {
  if (capped || findsUntilTicket == null || !Number.isFinite(findsUntilTicket)) return null;
  const finds = Math.max(1, Math.min(3, Math.round(findsUntilTicket)));
  return finds === 1 ? 'Free Ticket on your next find' : `${finds} more finds = free Ticket`;
}
