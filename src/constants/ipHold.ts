/**
 * IP safety for old catalog items (Oct 23 2026). A few early pins look like
 * famous park things: a castle with a big "50", a castle with "100", a blue
 * wizard hat with stars, and a soda in a famous bottle shape. Until Dustin
 * redraws or retires them on the server:
 * - players see plain names (a server display_name still wins once it is set),
 * - they never go up on the Pin Trading board and are never offered to give,
 *   so they stop spreading. Anyone who owns one keeps it.
 * Ids are the server's items.id (database/seeders/data/items.json).
 */
export const IP_HOLD_ITEM_IDS: ReadonlySet<number> = new Set([3, 5, 267, 329]);

/** Old name -> plain name players see. */
export const IP_SAFE_NAMES: Readonly<Record<string, string>> = {
  '50 Castle Pin': 'Golden 50 Pin',
  '100 Castle Celebration Pin': 'Big 100 Pin',
  'Sorcerer Hat Pin': 'Starry Hat Pin',
};

/** The plain name for an old look-alike name, or the name unchanged. */
export function ipSafeName(name: string): string {
  return IP_SAFE_NAMES[name.trim()] ?? name;
}

/** True for an item that stays off the trading board. */
export function ipHeld(item: { readonly id: number } | null | undefined): boolean {
  return !!item && IP_HOLD_ITEM_IDS.has(item.id);
}
