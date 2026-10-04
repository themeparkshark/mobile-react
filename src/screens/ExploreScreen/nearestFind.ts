/**
 * How to Play hand-off (`highlightNearestFind`): which find the home map
 * glides to. Pure so it is unit tested without the map.
 */
export interface PlacedFind {
  readonly item: { readonly latitude?: number | null; readonly longitude?: number | null };
  readonly distance: number | null;
}

/** The closest placed find with a position, or null (no finds, or no GPS yet). */
export function nearestFind(placed: readonly PlacedFind[]): { latitude: number; longitude: number } | null {
  let best: { latitude: number; longitude: number; distance: number } | null = null;
  for (const { item, distance } of placed) {
    if (distance == null || item.latitude == null || item.longitude == null) continue;
    if (!best || distance < best.distance) best = { latitude: item.latitude, longitude: item.longitude, distance };
  }
  return best && { latitude: best.latitude, longitude: best.longitude };
}
