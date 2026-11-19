/** Where a tapped cluster's coins fan out (T017). Pure, unit tested (map-tap-targets). */
export const FAN_CHIP = 54;
export const FAN_LABEL_W = 92;
/** At most this many coins fan out (the busiest Fantasyland cluster holds five). */
export const FAN_MAX = 6;
/** A coin's whole slot below its centre: half the chip, the label's gap and two caption lines. */
export const FAN_BELOW = FAN_CHIP / 2 + 3 + 30;
/** The island picture rises this far over its disc (ClusterFan's coin style, marginTop -8). */
export const FAN_ABOVE = FAN_CHIP / 2 + 8;
/** Room between two slots, so no picture or name ever sits under a neighbour's. */
const FAN_GAP = 8;
const COL_PITCH = FAN_LABEL_W + FAN_GAP;
/** The fan's nearest row sits this far above the island's ground point (clear of its art), or below it. */
const ABOVE = 96;
const BELOW = 72;
/** The middle coin of a row of three rises a little, so the row reads as a fan. */
const ARC_LIFT = 10;
const ROW_PITCH = FAN_ABOVE + FAN_BELOW + FAN_GAP + ARC_LIFT;

/** The box a coin and its name take, around the spot `fanSpots` gives (for tests and hit checks). */
export function fanSlotBox(spot: { readonly x: number; readonly y: number }): { x: number; y: number; w: number; h: number } {
  return { x: spot.x - FAN_LABEL_W / 2, y: spot.y - FAN_ABOVE, w: FAN_LABEL_W, h: FAN_ABOVE + FAN_BELOW };
}

/**
 * Where each coin of a cluster lands around its island (T017). Rows of at most three slots, each a
 * full name-label wide, above the island (below it when the guide card is in the way). The whole fan
 * moves as one to stay on screen, so an island at the screen edge never stacks two coins on top of
 * each other (the T017 hold: clamping each coin alone hid Mad Tea Party under Alice's name).
 */
export function fanSpots(count: number, at: { readonly x: number; readonly y: number }, screen: { readonly width: number; readonly height: number },
  { top = 120, bottom = 120 }: { readonly top?: number; readonly bottom?: number } = {}): { x: number; y: number }[] {
  const n = Math.max(0, Math.min(FAN_MAX, count));
  if (!n) return [];
  const fit = Math.max(1, Math.floor((screen.width - FAN_GAP) / COL_PITCH));
  const rows = Math.ceil(n / Math.min(3, fit));
  const perRow = Math.ceil(n / rows);
  const height = (rows - 1) * ROW_PITCH;
  // Above the island when the top row clears the guide card, else below it.
  const upFirstY = at.y - ABOVE - height;
  const down = upFirstY - FAN_ABOVE - ARC_LIFT < top;
  const firstY = down ? at.y + BELOW : upFirstY;
  const spots: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(perRow, n - r * perRow);
    for (let c = 0; c < inRow; c++) {
      const off = c - (inRow - 1) / 2;
      const lift = inRow === 3 && off === 0 ? ARC_LIFT : 0;
      spots.push({ x: at.x + off * COL_PITCH, y: firstY + r * ROW_PITCH - lift });
    }
  }
  // Move the fan as one inside the screen: left and right edges, the guide card, the footer and PLAY!.
  const half = FAN_LABEL_W / 2 + 4;
  const minX = Math.min(...spots.map(s => s.x)), maxX = Math.max(...spots.map(s => s.x));
  const minY = Math.min(...spots.map(s => s.y)), maxY = Math.max(...spots.map(s => s.y));
  const dx = minX < half ? half - minX : maxX > screen.width - half ? screen.width - half - maxX : 0;
  const lowest = screen.height - bottom - FAN_BELOW;
  const highest = top + FAN_ABOVE;
  const dy = maxY > lowest ? lowest - maxY : 0;
  const lift = minY + dy < highest ? highest - (minY + dy) : 0;
  return spots.map(s => ({ x: s.x + dx, y: s.y + dy + lift }));
}
