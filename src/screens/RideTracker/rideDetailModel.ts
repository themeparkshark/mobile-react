// Ride Detail layout and copy rules. Pure, so tests can load it without the screen.

/** Ride Detail's header: the same on every ride. The ride's name leads the white ride card. */
export const RIDE_DETAIL_HEADER = 'Ride Tracker';
/** With this few logs, the community card is one row instead of a five-bar chart. */
export const COMPACT_COMMUNITY_LOGS = 3;

/** A rating for a tile: 4.67 -> "4.7", 5 -> "5", none -> "?" (a faded shark sits beside it). */
export function scoreText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) return '?';
  return String(Math.round(Number(value) * 10) / 10);
}

/** "from 1 rider", "from 5 riders": the Rider sharks tile's caption. */
export function riderWords(riders: number | null | undefined): string {
  const n = Math.max(0, Math.round(Number(riders) || 0));
  return `from ${n} ${n === 1 ? 'rider' : 'riders'}`;
}
