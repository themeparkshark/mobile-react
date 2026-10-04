import { wearableRarityUi, WearableRarity } from '../design-system';
import { InventoryType } from '../models/inventory-type';
import { ItemType } from '../models/item-type';
import { ItemTypeType } from '../models/item-type-type';
import { LookSlots, SLOT_KEYS, SlotKey } from '../models/look-type';
import { PlayerType } from '../models/player-type';

/**
 * Outfit layers drawn on top of the shark (after the skin and its eyes),
 * back to front. This is the same order the server composites avatar images
 * in, so the live shark and the shared avatar picture always stack alike.
 */
export const OUTFIT_LAYER_ORDER = ['body_item', 'face_item', 'neck_item', 'hand_item', 'head_item'] as const;

/**
 * Alex's Classic shark with no eyes (1353x1530). Every wardrobe paper is drawn
 * on this canvas against this shark plus blink.png, so it is the shark to draw
 * when no skin is worn. Never the older shark-colored-v2 drawing: its eye sits
 * elsewhere and glasses, masks and mouth items miss the face on it.
 */
export const CLASSIC_NO_EYE = require('../../assets/images/screens/inventory/classic-no-eye.png');
/** The eyes drawn over every no-eye shark body. */
export const SHARK_EYES = require('../../assets/images/screens/inventory/blink.png');

/** A bundled image (require) or a remote one. */
export type SharkLayerSource = number | { uri: string };

/**
 * The shark under the outfit, back to front: the worn skin's no-eye body (or
 * Alex's Classic when no skin is worn) and then the eyes. Each layer is drawn
 * full frame with contentFit="contain", in the same box as the outfit layers.
 */
export function sharkBaseLayers(inventory: InventoryType | null | undefined): SharkLayerSource[] {
  const skin = inventory?.skin_item?.no_eye_url;
  return [skin ? { uri: skin } : CLASSIC_NO_EYE, SHARK_EYES];
}

/** True when there is a shark outfit worth drawing: a skin or any outfit layer. */
export function hasDressedShark(inventory: InventoryType | null | undefined): boolean {
  return !!inventory?.skin_item?.no_eye_url || outfitLayerUrls(inventory).length > 0;
}

/**
 * Tap zones on the shark, in fractions of the layer box (the 1353x1530 paper
 * canvas). Checked in order; a zone whose slot is empty falls through to the
 * next match, so overlapping zones only matter when both slots are worn.
 */
/** A neck item drawn as a shoulder pal (perched behind the head), not a chest piece. */
export function isShoulderPal(item: Pick<ItemType, 'name' | 'subcategory'> | null | undefined): boolean {
  if (!item) return false;
  if (item.subcategory) return item.subcategory === 'shoulder_pal';
  return /shoulder (pal|toy)/i.test(item.name ?? '');
}

export const SLOT_ZONES: readonly { slot: SlotKey; yMin: number; yMax: number; xMin: number; xMax: number; shoulderOnly?: boolean }[] = [
  { slot: 'head_item', yMin: 0, yMax: 0.28, xMin: 0.42, xMax: 0.82 },
  { slot: 'face_item', yMin: 0.10, yMax: 0.40, xMin: 0.18, xMax: 0.60 },
  // Shoulder pals perch behind the head (paper x 0.65-0.81, y 0.28-0.45).
  // After head so a hat still wins above y 0.28, before the right fin.
  // Only a shoulder pal owns it: a chest necklace must not capture shoulder taps.
  { slot: 'neck_item', yMin: 0.26, yMax: 0.46, xMin: 0.62, xMax: 0.84, shoulderOnly: true },
  // No shoulder pal: the same spot reads as the right-fin prop next door.
  { slot: 'hand_item', yMin: 0.26, yMax: 0.46, xMin: 0.62, xMax: 0.84 },
  { slot: 'hand_item', yMin: 0.40, yMax: 0.68, xMin: 0, xMax: 0.38 },    // left fin
  { slot: 'hand_item', yMin: 0.40, yMax: 0.68, xMin: 0.68, xMax: 1.0 },  // right fin
  { slot: 'neck_item', yMin: 0.38, yMax: 0.63, xMin: 0.38, xMax: 0.70 }, // overlaps body, checked first
  { slot: 'body_item', yMin: 0.50, yMax: 0.66, xMin: 0.36, xMax: 0.68 },
];

/** The worn slot under a tap at (xPct, yPct) of the layer box, or null. */
export function slotAtPoint(xPct: number, yPct: number, inventory: InventoryType | null | undefined): SlotKey | null {
  if (!inventory) return null;
  for (const zone of SLOT_ZONES) {
    if (yPct < zone.yMin || yPct > zone.yMax || xPct < zone.xMin || xPct > zone.xMax) continue;
    const worn = inventory[zone.slot];
    if (!worn || typeof worn !== 'object' || !('id' in worn)) continue;
    if (zone.shoulderOnly && !isShoulderPal(worn as ItemType)) continue;
    return zone.slot;
  }
  return null;
}

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
  if (signedIn && signedIn.id === player.id && hasDressedShark(signedIn.inventory)) {
    return signedIn.inventory;
  }
  return player.inventory ?? undefined;
}

/** The look slot an item is worn in, by the server's item type id. */
const SLOT_BY_TYPE: Record<number, SlotKey> = {
  1: 'head_item',
  2: 'face_item',
  3: 'neck_item',
  4: 'body_item',
  5: 'hand_item',
  6: 'background_item',
  7: 'skin_item',
  8: 'pin_item',
};

export function slotForItem(item: Pick<ItemType, 'item_type'> | null | undefined): SlotKey | null {
  const typeId = item?.item_type?.id;
  return typeId ? SLOT_BY_TYPE[typeId] ?? null : null;
}

export function isRequiredSlot(slot: SlotKey | null): boolean {
  return !!slot && (REQUIRED_SLOTS as readonly string[]).includes(slot);
}

/** What a player hears when they try to take off the shark or the backdrop. */
export function requiredSlotCopy(slot: SlotKey): string {
  return slot === 'skin_item' ? 'Your shark always needs a skin' : 'Your shark always needs a backdrop';
}

/** The look slots of a profile outfit, for the save queue. */
export function lookSlotsOf(inventory: InventoryType | null | undefined): LookSlots {
  if (!inventory) return {};
  return Object.fromEntries(SLOT_KEYS.map((slot) => [slot, inventory[slot] ?? null])) as LookSlots;
}

/** The name players see: a reviewed override when the server sends one. */
export function itemDisplayName(item: Pick<ItemType, 'name' | 'display_name'>): string {
  const override = item.display_name?.trim();
  return override ? override : item.name;
}

export interface WearableBadge {
  /** 1-5; anything unknown reads as Common. */
  readonly rarity: WearableRarity;
  readonly border: string;
  /** Legendary's second, inner stroke. */
  readonly inner: string | null;
  readonly glow: string | null;
  /** UNCOMMON, RARE, EPIC, LEGENDARY, or VIP / CODE for those sources. Null for Common. */
  readonly label: string | null;
  readonly labelColor: string;
}

/**
 * Card border, glow and label for a wearable (dressing-room.md 9.1, 9.2).
 * VIP and code items show where they came from instead of a rarity name.
 */
export function wearableBadge(item: Pick<ItemType, 'rarity' | 'source' | 'is_member_item' | 'is_coin_code_item'>): WearableBadge {
  const rarity = (item.rarity && item.rarity >= 1 && item.rarity <= 5 ? item.rarity : 1) as WearableRarity;
  const ui = wearableRarityUi[rarity];
  const source = item.source === 'vip' || item.is_member_item ? 'VIP'
    : item.source === 'coin_code' || item.is_coin_code_item ? 'CODE' : null;
  return {
    rarity,
    border: ui.border,
    inner: ui.inner,
    glow: ui.glow,
    label: source ?? (rarity === 1 ? null : ui.name.toUpperCase()),
    labelColor: ui.label ?? '#123e65',
  };
}

/**
 * The item an Inventory deep link pins and pulses. "See it in Inventory"
 * sends highlightItemId and WEAR IT sends focusItemId; both mean the same
 * thing, so either one works. Anything that is not a positive id is ignored.
 */
export function inventoryPinTarget(params?: { readonly highlightItemId?: unknown; readonly focusItemId?: unknown } | null): number | undefined {
  for (const value of [params?.highlightItemId, params?.focusItemId]) {
    const id = typeof value === 'string' ? Number(value) : value;
    if (typeof id === 'number' && Number.isInteger(id) && id > 0) return id;
  }
  return undefined;
}

/**
 * Where the pinned item sits in the first page, or -1. The server returns it
 * first, but a list that still holds it further down should light it too.
 */
export function pinnedItemIndex(page: number, pin: number | undefined, items: readonly { readonly id: number }[]): number {
  if (page !== 1 || !pin) return -1;
  return items.findIndex((item) => item.id === pin);
}

/**
 * Worn items whose art carries lettering, a logo or a number, so a mirrored
 * shark would read backwards (TPS tees, jerseys, hoodies, passes, "I Love
 * Whip"...). Matched on the item name; tools/tests/player-motion.test.cjs
 * checks it against the wardrobe catalog.
 */
export const LETTERED_ITEM = /t-?shirt|shirt|jersey|hoodie|sweater|long sleeve|letterman|\bpass\b|\btps\b|i love|greetings|jpland|\b\d{3,}\b|construction update|dookie|good sharks|oogity|space ranger|space captain|super shark|super suit/i;

/**
 * True when the dressed shark can be drawn mirrored (facing right): nothing
 * worn has lettering. Hand-held props just swap hands, which reads fine.
 */
export function canMirrorShark(inventory: InventoryType | null | undefined): boolean {
  if (!inventory) return true;
  return OUTFIT_LAYER_ORDER.every((slot) => {
    const item = inventory[slot];
    return !item?.paper_url || !LETTERED_ITEM.test(item.name ?? '');
  });
}
