/**
 * Limited coins (Coin Map 2.0): a park's rotation of coins that leave on a set
 * day and return in a later rotation. Pure badge copy and shelf rules, kept
 * free of React Native so they are unit tested.
 */
import type { LimitedWindow, TaskType } from '../../models/task-type';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * "2026-11-30" -> "Monday, Nov 30" (fix w3 T228: the date in words, with its day). The server
 * sends the last park-local day, so it is read as a plain calendar date (never shifted through
 * UTC). Null otherwise.
 */
export function limitedDayLabel(day: string | null | undefined): string | null {
  const match = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim()) : null;
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const value = new Date(Date.UTC(year, month - 1, date));
  if (value.getUTCMonth() !== month - 1 || value.getUTCDate() !== date) return null;
  return `${WEEKDAYS[value.getUTCDay()]}, ${MONTHS[month - 1]} ${date}`;
}

/**
 * The coin's dated edition ("November 2026 Edition"), or null on an older server (fix w4 T233: a
 * Limited coin always reads as a dated special edition, never as a ride that left the park).
 */
export function limitedEdition(limited: LimitedWindow | null | undefined): string | null {
  const edition = typeof limited?.edition === 'string' ? limited.edition.trim() : '';
  return edition ? edition : null;
}

/**
 * "November 2026 Edition · leaves Monday, Nov 30" in rotation, "October 2026 Edition · returns later"
 * out of it (an older server with no edition says "Limited"); null for a permanent coin.
 */
export function limitedLabel(limited: LimitedWindow | null | undefined): string | null {
  if (!limited) return null;
  const name = limitedEdition(limited) ?? 'Limited';
  if (!limited.active) return limited.returns ? `${name} · returns later` : name;
  const day = limitedDayLabel(limited.ends_on);
  return day ? `${name} · leaves ${day}` : name;
}

/** The edition the Limited tab is showing now: the one in play (the first coin in rotation that names one). */
export function shelfEdition(shelf: readonly { readonly limited?: LimitedWindow | null }[]): string | null {
  for (const task of shelf) if (task.limited?.active) { const edition = limitedEdition(task.limited); if (edition) return edition; }
  return null;
}

/** The Limited tab's line: "November 2026 Edition · leaves Monday, Nov 30" (older servers: "These limited coins leave ..."). */
export function limitedTabLine(edition: string | null | undefined, leaves: string | null | undefined): string | null {
  const name = edition?.trim();
  if (name) return leaves ? `${name} · leaves ${leaves}` : name;
  return leaves ? `These limited coins leave ${leaves}` : null;
}

/** A limited coin that cannot be collected right now. */
export const outOfRotation = (task: { readonly limited?: LimitedWindow | null }): boolean =>
  !!task.limited && !task.limited.active;

/**
 * The park shelf split. Permanent coins keep the Ride Coins row. The Limited
 * row holds the rotation in play plus every limited coin the player owns,
 * which stays on the shelf after its rotation ends. Coins in play lead.
 * `allLimited` also keeps unowned coins out of rotation, for the Coin Guide.
 */
export function splitParkShelf(available: readonly TaskType[], limitedCatalog: readonly TaskType[],
  completed: readonly TaskType[]): { permanent: TaskType[]; limited: TaskType[]; allLimited: TaskType[] } {
  const owned = new Set(completed.map(task => task.id));
  const byId = new Map<number, TaskType>();
  // Full catalog rows first; an owned coin's shelf row only fills a gap.
  for (const task of [...available, ...limitedCatalog, ...completed]) {
    if (task.limited && !byId.has(task.id)) byId.set(task.id, task);
  }
  const allLimited = [...byId.values()]
    .sort((a, b) => Number(!!b.limited?.active) - Number(!!a.limited?.active) || a.name.localeCompare(b.name));
  return {
    permanent: available.filter(task => !task.limited),
    limited: allLimited.filter(task => task.limited?.active || owned.has(task.id)),
    allLimited,
  };
}
