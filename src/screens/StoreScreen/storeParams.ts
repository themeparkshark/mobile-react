/**
 * The Store route's params, read once and safely. Any door (a push, a bare link, a dev
 * navigate with no params, an old deep link) lands on the Shark Shop instead of crashing:
 * missing or malformed params read as { store: 'shark-shop' } (fix round w3, T152).
 */
export type SuppliesFocus = 'tickets' | 'coins' | 'rescue' | 'featured';

export type StoreParams = {
  readonly store: number | 'shark-shop';
  readonly tab?: 'gear' | 'supplies';
  readonly focus?: SuppliesFocus;
  /** Opened as the Secret Shop (Profile knows): while loading, show its own room, not the generic loader. */
  readonly secret?: boolean;
  /** Wishlist push deep link: open this item's try-on. */
  readonly focus_item?: number;
  /** Opened from Get Tickets: Tickets the player is short of (0 or absent: no coin, so the smallest pack leads). */
  readonly short?: number;
};

const FOCI: readonly SuppliesFocus[] = ['tickets', 'coins', 'rescue', 'featured'];

export function storeParams(raw: unknown): StoreParams {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const id = typeof p.store === 'number' && Number.isFinite(p.store) ? p.store
    : typeof p.store === 'string' && /^\d+$/.test(p.store) ? Number(p.store) : 'shark-shop';
  const tab = p.tab === 'gear' || p.tab === 'supplies' ? p.tab : undefined;
  const focus = FOCI.includes(p.focus as SuppliesFocus) ? (p.focus as SuppliesFocus) : undefined;
  const item = typeof p.focus_item === 'number' ? p.focus_item
    : typeof p.focus_item === 'string' && /^\d+$/.test(p.focus_item) ? Number(p.focus_item) : undefined;
  return {
    store: id,
    // A Supplies focus always means the Supplies tab, even when the door forgot to say so.
    ...(tab ? { tab } : focus ? { tab: 'supplies' as const } : null),
    ...(focus ? { focus } : null),
    ...(p.secret === true ? { secret: true } : null),
    ...(item ? { focus_item: item } : null),
    // Only Get Tickets says how many Tickets are missing: Supplies lists the smallest pack that covers it first.
    ...(p.from === 'get_tickets' && typeof p.short === 'number' && Number.isFinite(p.short) && p.short > 0
      ? { short: Math.min(999, Math.floor(p.short)) } : null),
  };
}
