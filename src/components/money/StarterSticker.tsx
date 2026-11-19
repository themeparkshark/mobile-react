/**
 * <StarterSticker />: a small "Just once" sticker on a Shark Shop door while the Starter Pack is
 * unbought (fix round w3, T158). A door, never an offer: no price, no pop-up, never inside a reward.
 * It reads the shared Supplies catalog (services/money/supplies.ts), so it hides the moment the pack
 * is bought. The Home menu's Shark Shop row and the Profile Shark Shop door mount it (style: absolute
 * top-right of the door's picture, e.g. { top: -6, right: -10 }).
 */
import { useContext } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { AuthContext } from '../../context/AuthProvider';
import { useSupplies } from '../../services/money/supplies';
import { storeAvailable } from '../../services/purchases';
import { isStarter } from '../../services/money/suppliesPlan';
import type { ShopCatalog } from '../../api/endpoints/me/shop';
import { Sticker } from './moneyUi';

export const STARTER_STICKER_TEXT = 'JUST ONCE';

/** True while the Starter Pack can still be bought (enabled shop, product available). Exported for tests. */
export function starterUnbought(catalog: Pick<ShopCatalog, 'enabled' | 'products'> | null | undefined): boolean {
  return !!catalog?.enabled && catalog.products.some(p => isStarter(p) && p.available);
}

export function useStarterUnbought(): boolean {
  const { player } = useContext(AuthContext);
  const { catalog } = useSupplies(!!player && storeAvailable());
  return !!player && storeAvailable() && starterUnbought(catalog);
}

export default function StarterSticker({ style }: { style?: StyleProp<ViewStyle> }) {
  const on = useStarterUnbought();
  if (!on) return null;
  return <Sticker text={STARTER_STICKER_TEXT} tone="gold" style={style} />;
}
