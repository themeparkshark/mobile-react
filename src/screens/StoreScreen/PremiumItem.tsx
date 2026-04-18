/**
 * PremiumItem — Drop-in replacement for StoreScreen/Item.tsx using the premium kit.
 * Same props interface, dramatically better visuals.
 */
import { useContext } from 'react';
import { View } from 'react-native';
import { AuthContext } from '../../context/AuthProvider';
import useCrumbs from '../../hooks/useCrumbs';
import { ItemType } from '../../models/item-type';
import { RarityCard } from '../../components/premium';

export default function PremiumItem({
  item,
  onPurchase,
}: {
  readonly item: ItemType;
  readonly onPurchase?: (item: ItemType) => void;
}) {
  const { player } = useContext(AuthContext);
  const { labels } = useCrumbs();

  // Map item_type to rarity (adjust based on your actual data model)
  const getRarity = (): number => {
    if (item.is_clearance) return 4; // Epic treatment for clearance
    if (item.item_type.id === 8) return 5; // Pins = legendary
    // Default: derive from cost tiers
    if (item.cost >= 500) return 5;
    if (item.cost >= 200) return 4;
    if (item.cost >= 100) return 3;
    if (item.cost >= 50) return 2;
    return 1;
  };

  const badge = item.is_clearance
    ? labels.clearance?.toUpperCase() || 'SALE'
    : item.item_type.id === 8
      ? 'PIN'
      : undefined;

  const badgeColor = item.is_clearance ? '#ef4444' : item.item_type.id === 8 ? '#9C27B0' : undefined;

  return (
    <RarityCard
      imageUrl={item.icon_url || item.paper_url}
      rarity={getRarity()}
      cost={item.cost}
      currencyIcon={item.currency?.icon_url}
      badge={badge}
      badgeColor={badgeColor}
      isBodyItem={item.item_type.name === 'Body item'}
      bodyBg={require('../../../assets/images/screens/inventory/shark.png')}
      onPress={() => {
        if (player) onPurchase?.(item);
      }}
    />
  );
}
