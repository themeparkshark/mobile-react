/** Where a tapped cluster's coins fan out (T017). Pure, unit tested (map-tap-targets). */
export const FAN_CHIP = 54;
export const FAN_LABEL_W = 92;
const FAN_RADIUS = 92;
/** At most this many coins fan out (the busiest Fantasyland cluster holds five). */
export const FAN_MAX = 6;

/**
 * Where each coin of a cluster lands around its island (T017): an arc above the island, spread wider
 * the more rides it holds, and pushed back inside the screen. Pure, unit tested.
 */
export function fanSpots(count: number, at: { readonly x: number; readonly y: number }, screen: { readonly width: number; readonly height: number },
  { top = 120, bottom = 120 }: { readonly top?: number; readonly bottom?: number } = {}): { x: number; y: number }[] {
  const n = Math.max(0, Math.min(FAN_MAX, count));
  if (!n) return [];
  const spread = n === 1 ? 0 : Math.min(150, 46 * (n - 1));
  // Near the top of the map the fan opens downward instead, so no coin hides under the guide card.
  const down = at.y - FAN_RADIUS - FAN_CHIP < top;
  const half = FAN_LABEL_W / 2 + 4;
  return Array.from({ length: n }, (_, i) => {
    const deg = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
    const rad = (deg * Math.PI) / 180;
    const x = at.x + Math.sin(rad) * FAN_RADIUS;
    const y = at.y + (down ? 1 : -1) * Math.cos(rad) * FAN_RADIUS - (down ? 0 : 40);
    return {
      x: Math.max(half, Math.min(screen.width - half, x)),
      y: Math.max(top + FAN_CHIP / 2, Math.min(screen.height - bottom - FAN_CHIP / 2, y)),
    };
  });
}

