/**
 * The pip row's numbers (fix round W3, T053), pure so it is testable: how
 * many pips, how many filled, and whether the goal is too long for one row
 * (then it draws as one bar). Null when there is nothing honest to draw.
 */
export const MAX_PIPS = 13;

export function pipFill(have: number, need: number): { need: number; have: number; share: number; bar: boolean } | null {
  const n = Number.isFinite(need) ? Math.floor(need) : 0;
  if (n <= 0) return null;
  const h = Math.max(0, Math.min(n, Number.isFinite(have) ? Math.floor(have) : 0));
  return { need: n, have: h, share: h / n, bar: n > MAX_PIPS };
}
