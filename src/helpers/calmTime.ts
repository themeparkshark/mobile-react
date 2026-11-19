/**
 * Time on the map and in raids, in words (T006). Nothing a kid sees there counts down: a minutes
 * chip on a find read as walking time, and a ticking "19 min left" is fake urgency. A find says
 * it is here for a little while or leaves soon; a raid says when it ends as a time of day.
 */

/** The last ten minutes of a find or a raid: "Leaves soon". */
export const LEAVES_SOON_MS = 10 * 60_000;

export type StayWords = 'Here for a little while' | 'Leaves soon';

/** How long a timed find stays, in words. Null once it is gone. */
export function stayWords(msLeft: number): StayWords | null {
  if (!Number.isFinite(msLeft) || msLeft <= 0) return null;
  return msLeft <= LEAVES_SOON_MS ? 'Leaves soon' : 'Here for a little while';
}

/** The home map's treats live short lives: only their last five minutes say "Leaves soon" (a calm map). */
export const HOME_LEAVES_SOON_MS = 5 * 60_000;

/** True in the last ten minutes (the island's chip and gold ring show only then); `soonMs` for a shorter line. */
export function leavesSoon(msLeft: number, soonMs = LEAVES_SOON_MS): boolean {
  return Number.isFinite(msLeft) && msLeft > 0 && msLeft <= soonMs;
}

/** When the words next change (at the soon line, then at zero), so a marker wakes twice, not every minute. */
export function msUntilStayWordsChange(msLeft: number, soonMs = LEAVES_SOON_MS): number {
  if (!Number.isFinite(msLeft) || msLeft <= 0) return 0;
  return msLeft > soonMs ? msLeft - soonMs + 50 : msLeft + 50;
}

/** "1:50", "2:00": the local time of day, 12-hour, no am/pm (a kid reads it off any clock). */
export function clockTime(at: number | string | Date): string | null {
  const date = at instanceof Date ? at : new Date(at);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return null;
  const hours = date.getHours() % 12 || 12;
  const minutes = date.getMinutes();
  return `${hours}:${minutes < 10 ? '0' : ''}${minutes}`;
}

/** "Ends at 1:50" (null for a bad date). `lower` gives "ends at 1:50" for the middle of a line. */
export function endsAtWords(endsAt: number | string | Date | null | undefined, { lower = false } = {}): string | null {
  if (endsAt == null) return null;
  const time = clockTime(endsAt);
  if (!time) return null;
  return `${lower ? 'ends' : 'Ends'} at ${time}`;
}
