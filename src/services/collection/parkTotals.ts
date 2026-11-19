/**
 * One shelf count on every screen (fix w3 T134). The park shelf, Profile's Your parks and Ride Coins
 * all read the server's permanent-shelf totals (visited-parks ride_coins_collected / ride_coins_available,
 * the same numbers the shelf header shows). Ride Coins used to count its own catalog rows, which hold the
 * Limited rotation too, so it said "2 of 40" beside the shelf's "2 of 35". A park the server has no row
 * for yet keeps the catalog count. Pure, unit tested.
 */
export interface ParkTotal { readonly name: string; readonly owned: number; readonly total: number }

export interface VisitedParkTotals {
  readonly id: number;
  readonly ride_coins_collected?: number | null;
  readonly ride_coins_available?: number | null;
}

export function mergeParkTotals(catalog: ReadonlyMap<number, ParkTotal>, visited: readonly VisitedParkTotals[] | null | undefined): Map<number, ParkTotal> {
  const out = new Map(catalog);
  for (const park of visited ?? []) {
    const total = Number(park?.ride_coins_available);
    const owned = Number(park?.ride_coins_collected);
    if (!park || park.ride_coins_available == null || park.ride_coins_collected == null) continue;
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(owned)) continue;
    const base = out.get(Number(park.id));
    out.set(Number(park.id), { name: base?.name ?? '', owned: Math.max(0, Math.min(Math.floor(owned), Math.floor(total))), total: Math.floor(total) });
  }
  return out;
}

/** The "ACROSS ALL PARKS" line: the same per-park totals, summed. */
export function allParksTotal(totals: ReadonlyMap<number, ParkTotal>): { owned: number; total: number } {
  let owned = 0; let total = 0;
  for (const t of totals.values()) { owned += t.owned; total += t.total; }
  return { owned, total };
}
