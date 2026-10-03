/**
 * Where the toast and coach-mark line sit: just below the Fin-ister pill
 * (its measured bottom edge in window coordinates, converted into the overlay
 * box), never on top of it. Before the pill is measured, the caller's fallback.
 * Pure, unit tested.
 */
export const OVERLAY_GAP = 8;

export function overlayTop(pillBottom: number | null | undefined, boxY: number | null | undefined, fallback: number): number {
  if (pillBottom == null || !Number.isFinite(pillBottom)) return fallback;
  return Math.max(0, pillBottom - (boxY ?? 0) + OVERLAY_GAP);
}
