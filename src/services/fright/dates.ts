/**
 * Park-local time and date formatting for Fin-ister Nights. Pure, no Intl.
 *
 * Every time is the PARK's: it is read straight from the ISO offset the server
 * sends (opens_at "2026-10-09T18:30:00-04:00" is 6:30 PM in Orlando whatever
 * zone the phone is set to). Dates come from `night_on` (the park-local event
 * night), never from the phone's calendar, so a 1:30 AM finish still belongs to
 * the night before. When the phone's zone differs from the park's at that
 * instant, times carry a zone label ("6:30 PM ET").
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'] as const;

/** "2026-10-09" -> "Friday, October 9". Null for a malformed date. */
export function nightDateLabel(nightOn: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(nightOn ?? '');
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return `${WEEKDAYS[utc.getUTCDay()]}, ${MONTHS[month - 1]} ${day}`;
}

/** UTC offset of an ISO timestamp in minutes ("-04:00" -> -240, "Z" -> 0). Null without one. */
export function isoOffsetMinutes(iso: string | null | undefined): number | null {
  const match = /(Z|[+-]\d{2}:?\d{2})$/.exec(iso ?? '');
  if (!match) return null;
  if (match[1] === 'Z') return 0;
  const sign = match[1][0] === '-' ? -1 : 1;
  const digits = match[1].slice(1).replace(':', '');
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
}

function clock12(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** "6:30 PM" read from the ISO's own wall time (the park's). */
export function parkClock(iso: string | null | undefined): string | null {
  const match = /T(\d{2}):(\d{2})/.exec(iso ?? '');
  return match ? clock12(Number(match[1]), Number(match[2])) : null;
}

/** "11:11 PM" at an instant, in a zone given by its UTC offset in minutes. */
export function clockAt(ms: number, offsetMinutes: number): string {
  const local = new Date(ms + offsetMinutes * 60_000);
  return clock12(local.getUTCHours(), local.getUTCMinutes());
}

const ZONE_LABELS: Readonly<Record<string, string>> = {
  'America/New_York': 'ET', 'America/Detroit': 'ET', 'America/Chicago': 'CT', 'America/Denver': 'MT',
  'America/Phoenix': 'MT', 'America/Los_Angeles': 'PT',
};

/** "ET" / "PT" for the park's zone; "UTC-4" for a zone without a short name. */
export function zoneLabel(timezone: string | null | undefined, offsetMinutes: number | null): string {
  const named = timezone ? ZONE_LABELS[timezone] : undefined;
  if (named) return named;
  if (offsetMinutes == null) return '';
  const hours = Math.trunc(offsetMinutes / 60);
  const minutes = Math.abs(offsetMinutes % 60);
  return `UTC${hours >= 0 ? '+' : ''}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}

/** The phone's own UTC offset at an instant (minutes east of UTC). */
export function phoneOffsetMinutes(ms: number): number {
  return -new Date(ms).getTimezoneOffset();
}

/**
 * "6:30 PM", or "6:30 PM ET" when the phone's zone differs from the park's at
 * that instant (a traveler whose phone is still on Pacific time in Orlando).
 */
export function parkTimeLabel(iso: string | null | undefined, timezone: string | null | undefined,
  phoneOffset?: number): string | null {
  const clock = parkClock(iso);
  if (!clock || !iso) return clock;
  const parkOffset = isoOffsetMinutes(iso);
  const at = Date.parse(iso);
  const phone = phoneOffset ?? (Number.isFinite(at) ? phoneOffsetMinutes(at) : parkOffset);
  if (parkOffset == null || phone === parkOffset) return clock;
  const label = zoneLabel(timezone, parkOffset);
  return label ? `${clock} ${label}` : clock;
}

/** The instant of a park-local wall time on the event night ("21:00" on night_on), using the zone of `zoneFrom`. */
export function nightInstant(nightOn: string, hhmm: string, zoneFrom: string): number | null {
  const offset = isoOffsetMinutes(zoneFrom);
  if (offset == null || !/^\d{4}-\d{2}-\d{2}$/.test(nightOn) || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const suffix = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  const ms = Date.parse(`${nightOn}T${hhmm}:00${suffix}`);
  return Number.isFinite(ms) ? ms : null;
}

/** "3h 10m", "45m", "0m". Rounded down to the minute. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** "2h 40m" for minutes in line (Marquee). */
export function formatMinutes(minutes: number | null | undefined): string {
  return formatDuration(Math.max(0, minutes ?? 0) * 60_000);
}
