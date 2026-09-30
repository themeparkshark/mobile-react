/**
 * "2026-09-27" -> "Sunday, September 27". Park days are calendar dates in the
 * park's own time zone, so they are read as plain dates (never shifted through
 * UTC). Anything that is not a YYYY-MM-DD date is returned unchanged.
 */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function parkDayLabel(day: string | null | undefined, { withYear = false } = {}): string {
  if (!day) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return day;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const value = new Date(Date.UTC(year, month - 1, date));
  if (value.getUTCMonth() !== month - 1 || value.getUTCDate() !== date) return day;
  const label = `${WEEKDAYS[value.getUTCDay()]}, ${MONTHS[month - 1]} ${date}`;
  return withYear ? `${label}, ${year}` : label;
}
