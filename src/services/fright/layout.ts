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

/**
 * The map's right-rail controls (Map.tsx: `right: 16`, 54-55 pt buttons). Toasts and coach marks stop
 * 8 pt left of the rail so they never cover the compass, chest or energy buttons. Map.tsx measures the
 * rail for its own chips but does not export it; a test keeps these numbers in step with Map.tsx.
 */
export const RIGHT_RAIL = { right: 16, width: 55 } as const;

export function overlayRightInset(rail: { readonly right: number; readonly width: number } = RIGHT_RAIL, gap = OVERLAY_GAP): number {
  return rail.right + rail.width + gap;
}
