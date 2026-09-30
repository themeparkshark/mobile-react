import { InventoryType } from '../models/inventory-type';
import { ItemType } from '../models/item-type';
import { ItemTypeType } from '../models/item-type-type';
import { PlayerType } from '../models/player-type';

/**
 * Outfit layers drawn on top of the shark (after the skin and its eyes),
 * back to front. This is the same order the server composites avatar images
 * in, so the live shark and the shared avatar picture always stack alike.
 */
export const OUTFIT_LAYER_ORDER = ['body_item', 'face_item', 'neck_item', 'hand_item', 'head_item'] as const;

/** Slots that always hold an item: the shark itself and its backdrop. */
export const REQUIRED_SLOTS = ['skin_item', 'background_item'] as const;

/** Player-facing wardrobe tab names, keyed by the server's item type id. */
const CATEGORY_LABELS: Record<number, string> = {
  1: 'Hats',
  2: 'Eyewear',
  3: 'Neck',
  4: 'Tops',
  5: 'Props',
  6: 'Backdrops',
  7: 'Sharks',
  8: 'Pins',
};

export function wardrobeCategoryLabel(itemType: Pick<ItemTypeType, 'id' | 'name'>): string {
  return CATEGORY_LABELS[itemType.id] ?? itemType.name ?? 'Items';
}

/** Paper URLs of the worn outfit items, back to front. */
export function outfitLayerUrls(inventory: InventoryType | null | undefined): string[] {
  if (!inventory) return [];
  return OUTFIT_LAYER_ORDER
    .map((slot) => inventory[slot]?.paper_url)
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
}

export function isItemWorn(inventory: InventoryType | null | undefined, item: Pick<ItemType, 'id'>): boolean {
  if (!inventory) return false;
  return Object.values(inventory).some((worn) =>
    !!worn && typeof worn === 'object' && 'id' in worn && worn.id === item.id);
}

/** A worn shark or backdrop can only be swapped, so tapping it does nothing. */
export function isLockedWhileWorn(inventory: InventoryType | null | undefined, item: Pick<ItemType, 'id'>): boolean {
  if (!inventory) return false;
  return REQUIRED_SLOTS.some((slot) => inventory[slot]?.id === item.id);
}

/**
 * The outfit to draw for a player. Lists (leaderboards, comments, friends)
 * only carry a pre-rendered picture, which lags an outfit change; for the
 * signed-in player, draw the live outfit they just put on instead.
 */
export function liveOutfitFor(
  player: Pick<PlayerType, 'id' | 'inventory'>,
  signedIn: Pick<PlayerType, 'id' | 'inventory'> | null | undefined,
): InventoryType | undefined {
  if (signedIn && signedIn.id === player.id && signedIn.inventory?.skin_item?.no_eye_url) {
    return signedIn.inventory;
  }
  return player.inventory ?? undefined;
}
