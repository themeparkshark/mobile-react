/**
 * Every shop inventory write goes through one queue: try-on "Wear it now" and the
 * reveal's WEAR IT ALL fallback never race each other on the server.
 */
import updateInventory from '../../api/endpoints/me/inventory/update-inventory';
import { createSerialQueue } from '../../helpers/shopShelves';

const serial = createSerialQueue();

export function wearItem(item: { id: number }) {
  return serial(() => updateInventory(item as never));
}
