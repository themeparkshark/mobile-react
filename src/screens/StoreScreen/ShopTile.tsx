/**
 * One Shark Shop v2 tile: rarity border, art, price or OWNED, a heart for the
 * wishlist and at most one tag (LAST CHANCE, BACK AGAIN). Tapping opens the
 * try-on sheet; nothing is bought from the tile itself.
 */
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TILE_TAG_LABEL, tileTag } from '../../helpers/shopShelves';
import { itemDisplayName, wearableBadge } from '../../helpers/wardrobe';
import { ShopItem } from '../../models/shop-today';
import { BRAND, FONT, GameIcon, SHADOW } from '../../ui';

const MINI_SHARK = require('../../../assets/images/screens/inventory/shark-colored-v2.png');

const TAG_COLOR = { owned: BRAND.greenLip, last_chance: BRAND.red, returning: '#7c4dff' } as const;

export function TileArt({ item, size }: { readonly item: ShopItem; readonly size: number }) {
  // Body pieces read best on a little shark, like the Inventory grid.
  if (item.item_type?.name === 'Body item' || item.item_type?.id === 4) {
    return (
      <View style={{ width: size, height: size * 0.8 }}>
        <Image source={MINI_SHARK} style={StyleSheet.absoluteFill} contentFit="contain" />
        <Image source={item.paper_url} style={StyleSheet.absoluteFill} contentFit="contain" />
      </View>
    );
  }
  return <Image source={item.icon_url} style={{ width: size, height: size * 0.8 }} contentFit="contain" transition={120} />;
}

function ShopTile({ item, width, wished, vipLocked, onOpen, onWish }: {
  readonly item: ShopItem;
  readonly width: number;
  readonly wished: boolean;
  readonly vipLocked: boolean;
  readonly onOpen: (item: ShopItem) => void;
  readonly onWish: (item: ShopItem) => void;
}) {
  const badge = wearableBadge(item);
  const tag = tileTag(item);
  const owned = tag === 'owned';
  const name = itemDisplayName(item);

  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${owned ? 'owned' : vipLocked ? 'VIP only' : `${item.cost} ${item.currency?.name ?? ''}`}. Tap to try it on.`}
      style={({ pressed }) => [styles.tile, { width, borderColor: badge.border, transform: [{ scale: pressed ? 0.95 : 1 }] },
        badge.glow ? { shadowColor: badge.glow, shadowOpacity: 0.9, shadowRadius: 10 } : null, owned && styles.owned]}
    >
      {badge.inner && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.inner, { borderColor: badge.inner }]} />}
      <View style={styles.art}>
        <TileArt item={item} size={width - 26} />
      </View>
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      <View style={styles.priceRow}>
        {owned ? (
          <Text style={[styles.price, { color: BRAND.greenLip }]}>OWNED</Text>
        ) : vipLocked ? (
          <><GameIcon name="member" size={15} /><Text style={styles.price}> VIP</Text></>
        ) : (
          <>
            {item.currency?.icon_url ? <Image source={{ uri: item.currency.icon_url }} style={styles.coin} contentFit="contain" /> : null}
            <Text style={styles.price}>{item.cost.toLocaleString('en-US')}</Text>
          </>
        )}
      </View>
      {badge.label && !owned && (
        <View style={[styles.rarity, { backgroundColor: badge.labelColor }]}>
          <Text style={styles.rarityText}>{badge.label}</Text>
        </View>
      )}
      {tag && tag !== 'owned' && (
        <View style={[styles.tag, { backgroundColor: TAG_COLOR[tag] }]}>
          <Text style={styles.tagText}>{TILE_TAG_LABEL[tag]}</Text>
        </View>
      )}
      {owned ? (
        <View style={styles.corner}><GameIcon name="check" size={24} /></View>
      ) : (
        <Pressable onPress={() => onWish(item)} hitSlop={10} style={[styles.corner, styles.heart, wished && styles.heartOn]}
          accessibilityRole="button" accessibilityState={{ selected: wished }}
          accessibilityLabel={wished ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}>
          <GameIcon name="heart" size={16} style={wished ? undefined : { opacity: 0.35 }} />
        </Pressable>
      )}
      {item.shop?.set && !owned && <View style={styles.setDot} accessibilityLabel={`Part of ${item.shop.set.name}`} />}
    </Pressable>
  );
}

export default memo(ShopTile);

const styles = StyleSheet.create({
  tile: { backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 3, paddingTop: 10, paddingBottom: 8,
    alignItems: 'center', ...SHADOW.card },
  owned: { opacity: 0.72 },
  inner: { borderRadius: 13, borderWidth: 2, margin: 2 },
  art: { backgroundColor: '#f1f8ff', borderRadius: 12, padding: 4, marginHorizontal: 6 },
  name: { fontFamily: FONT.body, fontSize: 14, color: BRAND.navy, marginTop: 5, paddingHorizontal: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  coin: { width: 16, height: 16, marginRight: 3 },
  price: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy },
  rarity: { position: 'absolute', top: 6, left: 6, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  rarityText: { fontFamily: FONT.display, fontSize: 9, color: BRAND.white, letterSpacing: 0.4 },
  tag: { position: 'absolute', top: -9, alignSelf: 'center', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 2, borderColor: BRAND.white },
  tagText: { fontFamily: FONT.display, fontSize: 10, color: BRAND.white, letterSpacing: 0.5 },
  corner: { position: 'absolute', top: -8, right: -8 },
  heart: { width: 28, height: 28, borderRadius: 14, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#d7e6f5' },
  heartOn: { borderColor: '#ff4f8b', backgroundColor: '#fff0f5' },
  setDot: { position: 'absolute', bottom: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND.gold,
    borderWidth: 1.5, borderColor: BRAND.goldLip },
});
