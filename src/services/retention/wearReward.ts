/**
 * WEAR IT from any chest (core loop must-fix 5, October 2026).
 *
 * The chest's gear card knows only the item's id (the server's item card has no
 * type), so WEAR IT used to open the closet on its first tab (Hats) with nothing
 * on. Now it puts the piece on first, reads which slot took it, and opens the
 * closet on that slot's tab with the piece pinned and worn.
 *
 * Pure helpers are unit tested in tools/tests/rewards-sheet.test.cjs; the flow
 * takes its calls as arguments so the test can drive it without a server.
 */

export type WearSlot = 'head_item' | 'face_item' | 'neck_item' | 'body_item' | 'hand_item'
  | 'background_item' | 'skin_item' | 'pin_item';

/** The closet tab (item type id) for each look slot. Matches helpers/wardrobe SLOT_BY_TYPE. */
export const SLOT_TYPE_ID: Readonly<Record<WearSlot, number>> = {
  head_item: 1, face_item: 2, neck_item: 3, body_item: 4, hand_item: 5,
  background_item: 6, skin_item: 7, pin_item: 8,
};

const SLOTS = Object.keys(SLOT_TYPE_ID) as WearSlot[];

// Any object whose slot keys may hold an item with an id (a look, an inventory).
type SlotsLike = object | null | undefined;

/** The slot that holds this item right now, or null. */
export function slotHolding(slots: SlotsLike, itemId: number): WearSlot | null {
  if (!slots || !Number.isFinite(itemId)) return null;
  const held = slots as Partial<Record<string, { readonly id?: unknown } | null>>;
  return SLOTS.find(slot => Number(held[slot]?.id) === itemId) ?? null;
}

/** Navigation params for the closet: the item's own tab with the item pinned first. */
export function closetParams(itemId: number, slot: WearSlot | null): { itemTypeId?: number; focusItemId: number } {
  return slot ? { itemTypeId: SLOT_TYPE_ID[slot], focusItemId: itemId } : { focusItemId: itemId };
}

export interface WearRewardDeps {
  /** GET /me/look: the saved look. */
  readonly readLook: () => Promise<{ readonly slots: SlotsLike }>;
  /** PUT /me/inventory: toggles the item on (the server answers with the new look). */
  readonly toggle: (itemId: number) => Promise<SlotsLike>;
}

/**
 * Put the reward on (never takes it off: an item already worn is left alone)
 * and say which slot holds it. Never throws: a failure answers worn false, and
 * the closet still opens with the item pinned.
 */
export async function wearReward(itemId: number, deps: WearRewardDeps): Promise<{ worn: boolean; slot: WearSlot | null }> {
  if (!Number.isFinite(itemId) || itemId <= 0) return { worn: false, slot: null };
  try {
    const look = await deps.readLook();
    const already = slotHolding(look?.slots, itemId);
    if (already) return { worn: true, slot: already };
  } catch {
    // An older server without /me/look: the toggle below still puts it on.
  }
  try {
    const slot = slotHolding(await deps.toggle(itemId), itemId);
    return { worn: slot !== null, slot };
  } catch {
    return { worn: false, slot: null };
  }
}
