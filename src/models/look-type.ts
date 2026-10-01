import { InventoryType } from './inventory-type';
import { ItemType } from './item-type';

/** Every slot of the shark's look, in canonical draw order (dressing-room.md 11.1). */
export const SLOT_KEYS = [
  'background_item',
  'skin_item',
  'body_item',
  'face_item',
  'neck_item',
  'hand_item',
  'head_item',
  'pin_item',
] as const;

export type SlotKey = typeof SLOT_KEYS[number];

/** The worn item per slot; null is an empty slot. */
export type LookSlots = { readonly [K in SlotKey]?: InventoryType[K] | ItemType | null };

/** GET /me/look: the saved look and its version for optimistic saves. */
export interface SharkLook {
  readonly version: number;
  readonly slots: LookSlots;
}
