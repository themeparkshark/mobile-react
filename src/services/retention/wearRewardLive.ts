/**
 * WEAR IT, live: put the chest's gear on, refresh the player so the closet's
 * shark already wears it, then open the closet on the item's own tab with the
 * item pinned (core loop must-fix 5). Used by every chest that pays gear: the
 * level chest, the Daily 3 and Weekly Box milestone gear, and Trail Exclusives.
 */
import { getLook } from '../../api/endpoints/me/look';
import updateInventory from '../../api/endpoints/me/inventory/update-inventory';
import type { ItemType } from '../../models/item-type';
import * as RootNavigation from '../../RootNavigation';
import { closetParams, wearReward } from './wearReward';

export async function wearAndOpenCloset(itemId: number, refreshPlayer?: () => Promise<unknown>): Promise<boolean> {
  const { worn, slot } = await wearReward(itemId, {
    readLook: getLook,
    toggle: async id => updateInventory({ id } as ItemType),
  });
  if (worn && refreshPlayer) {
    // The closet stage draws the player's look: wait (briefly) so it opens already wearing the piece.
    await Promise.race([refreshPlayer().catch(() => undefined), new Promise(r => setTimeout(r, 2500))]);
  }
  RootNavigation.navigate('Inventory', closetParams(itemId, slot));
  return worn;
}
