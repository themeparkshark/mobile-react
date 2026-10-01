import { useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { getLook, putLook } from '../api/endpoints/me/look';
import updateInventory from '../api/endpoints/me/inventory/update-inventory';
import { AuthContext } from '../context/AuthProvider';
import { LookNotice, LookQueue } from '../helpers/lookQueue';
import { lookSlotsOf } from '../helpers/wardrobe';
import { InventoryType } from '../models/inventory-type';
import { ItemType } from '../models/item-type';
import { SlotKey } from '../models/look-type';

/**
 * The shark's look on the Inventory stage (dressing-room.md 13.3).
 *
 * `inventory` is what to draw: the saved look plus every tap not yet
 * confirmed, so a tap shows on the shark in the same frame and controls never
 * lock. Saves merge and retry in the background (LookQueue). Confirmed looks
 * flow into the player profile so Profile, the map and lists follow.
 */
export default function useLook() {
  const { player, setPlayer } = useContext(AuthContext);
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const [notice, setNotice] = useState<LookNotice | null>(null);
  const playerRef = useRef(player);
  playerRef.current = player;
  const disposed = useRef(false);
  const queueRef = useRef<LookQueue | null>(null);

  if (!queueRef.current) {
    queueRef.current = new LookQueue({
      save: putLook,
      load: getLook,
      legacyToggle: async (item) => lookSlotsOf(await updateInventory(item)),
      // Retries keep running after the screen closes so a save still lands.
      schedule: (fn, ms) => setTimeout(fn, ms),
      cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      now: () => Date.now(),
      onChange: () => { if (!disposed.current) rerender(); },
      onSaved: (slots) => {
        const current = playerRef.current;
        if (current?.inventory) setPlayer({ ...current, inventory: { ...current.inventory, ...slots } as InventoryType });
      },
      onNotice: (next) => { if (!disposed.current) setNotice(next); },
    }, lookSlotsOf(player?.inventory), null);
  }
  const queue = queueRef.current;

  useEffect(() => {
    disposed.current = false;
    getLook().then((look) => queue.adopt(look)).catch(() => undefined);
    return () => {
      // Leaving the screen sends whatever is still waiting.
      disposed.current = true;
      void queue.flushNow();
    };
  }, [queue]);

  // A profile refresh while nothing is pending becomes the saved look.
  useEffect(() => {
    if (player?.inventory) queue.adopt({ slots: lookSlotsOf(player.inventory) });
  }, [player?.inventory, queue]);

  const set = useCallback((slot: SlotKey, item: ItemType | null) => queue.intend(slot, item), [queue]);
  const clearNotice = useCallback(() => setNotice(null), []);

  const inventory = player?.inventory
    ? ({ ...player.inventory, ...queue.display() } as InventoryType)
    : undefined;

  return { inventory, set, notice, clearNotice };
}
