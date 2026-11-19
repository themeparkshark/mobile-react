/**
 * The ride win stamp's rules (fix round W3, T037), pure. One word on the
 * stamp, never the win card's own "COIN CAUGHT!" (the same title twice in a
 * row was a grader's note), the hand-off after RIDE_WIN_HANDOFF_MS, and the
 * wait line only when the server is slow.
 */
export const RIDE_WIN_STAMP_TITLE = 'YOU WON!';
/** The stamp's moment before the coin's win card takes over (GameShellV2's auto claim). */
export const RIDE_WIN_HANDOFF_MS = 1600;
/** Handed on but not confirmed yet after this long: "Your coin is on its way..." with the shark loader. */
export const RIDE_WIN_WAIT_LINE_MS = 1200;

export function rideWinStars(stars: number): number {
  const n = Number.isFinite(stars) ? Math.floor(stars) : 0;
  return Math.max(1, Math.min(3, n));
}
/** The one wait line while the server confirms the win. */
export const RIDE_WIN_WAIT_TEXT = 'Your coin is on its way';
