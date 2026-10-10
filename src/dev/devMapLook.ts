import type { InventoryType } from '../models/inventory-type';

/**
 * Development captures only (EXPO_PUBLIC_DEV_MAP_LOOK): dress the map shark in Secret Shop pieces by
 * fx key ("jetpack,propeller_hat"), each in its own slot, on top of the player's real look.
 */
export function devMapLook(inventory: InventoryType | null | undefined, keys: string): InventoryType {
  const { FX_SLOT, isFxKey } = require('../fx/registry');
  const next: Record<string, unknown> = { ...(inventory ?? {}) };
  keys.split(',').map(k => k.trim()).filter(isFxKey).forEach((key: string, i: number) => {
    next[FX_SLOT[key]] = { id: 900000 + i, name: key, fx_key: key, paper_url: '', icon_url: '' };
  });
  return next as unknown as InventoryType;
}
