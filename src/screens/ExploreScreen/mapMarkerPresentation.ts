/**
 * Pure presentation rules for ride islands on the game map (WS2). Kept free of
 * React Native so the declutter and badge rules are unit tested.
 */

export const RING = {
  rush: '#ffcf3b',
  gold: '#ffcf3b',
  blue: '#0879ca',
  urgent: '#ef4a3c',
} as const;

/** Rush gold, a held ride its team colour, red only in the last 5 minutes, gold in reach, else blue. */
export function markerRingColor({ rush, team, urgent, near }: {
  rush: boolean; team: string | null; urgent: boolean; near: boolean;
}): string {
  if (rush) return RING.rush;
  if (team) return team;
  if (urgent) return RING.urgent;
  return near ? RING.gold : RING.blue;
}

export type MarkerBadge = 'rush' | 'adventure' | 'goal' | 'limited' | 'new' | 'level' | null;

/**
 * One badge per island. Rush beats the adventure, the adventure beats the goal,
 * the goal beats a limited coin's leave date; then collection state.
 */
export function markerBadge({ rush, adventure, goal, owned, limited = false }: {
  rush: boolean; adventure: boolean; goal: boolean; owned: boolean; limited?: boolean; selected?: boolean;
}): MarkerBadge {
  if (rush) return 'rush';
  if (adventure) return 'adventure';
  if (goal) return 'goal';
  if (limited) return 'limited';
  return owned ? 'level' : 'new';
}

/** "Back 2:00 PM" for a timed ride that opens later today (device time zone). */
export function restingLabel(at: number, locale?: string): string {
  const time = new Date(at).toLocaleTimeString(locale ?? 'en-US', { hour: 'numeric', minute: '2-digit' });
  return `Back ${time}`;
}

/** MapLibre uses 512px tiles: world width is 512 * 2^zoom pixels. */
export function metersPerPixel(zoom: number, latitude: number): number {
  return (40075016.686 * Math.cos(latitude * Math.PI / 180)) / (512 * 2 ** zoom);
}

export interface ClusterInput {
  readonly id: number;
  readonly latitude: number;
  readonly longitude: number;
  /** Higher leads the island (selected, adventure, goal, rush, playable). */
  readonly priority?: number;
  /** Never folded into another island (e.g. the selected ride). */
  readonly pinned?: boolean;
}

export interface Cluster<T extends ClusterInput> {
  readonly lead: T;
  readonly members: readonly T[];
}

/**
 * Greedy declutter: islands closer than `radiusPx` on screen fold under the
 * highest-priority one, which shows "+N". Pinned items always stand alone.
 * Stable: ties keep input order.
 */
export function clusterMarkers<T extends ClusterInput>(items: readonly T[], zoom: number, radiusPx = 48): Cluster<T>[] {
  if (!items.length) return [];
  const latitude = items[0].latitude;
  const threshold = metersPerPixel(zoom, latitude) * radiusPx;
  const k = Math.cos(latitude * Math.PI / 180);
  const distance = (a: T, b: T) => Math.hypot((a.latitude - b.latitude) * 111320, (a.longitude - b.longitude) * 111320 * k);
  const order = items.map((item, index) => ({ item, index }))
    .sort((a, b) => Number(!!b.item.pinned) - Number(!!a.item.pinned) || (b.item.priority ?? 0) - (a.item.priority ?? 0) || a.index - b.index);
  const taken = new Set<number>();
  const clusters: Cluster<T>[] = [];
  for (const { item: lead } of order) {
    if (taken.has(lead.id)) continue;
    taken.add(lead.id);
    const members: T[] = [];
    if (!lead.pinned) {
      for (const { item } of order) {
        if (taken.has(item.id) || item.pinned) continue;
        if (distance(lead, item) <= threshold) { taken.add(item.id); members.push(item); }
      }
    }
    clusters.push({ lead, members });
  }
  return clusters;
}

/** Stagger for the first reveal: nearest islands land first, capped so the map settles fast. */
export function revealDelays(ids: readonly number[], stepMs = 55, maxMs = 700): Map<number, number> {
  return new Map(ids.map((id, index) => [id, Math.min(maxMs, index * stepMs)]));
}
