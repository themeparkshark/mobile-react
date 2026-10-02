/**
 * One Shark Shop v2 tile: a rarity backplate, the art (body pieces cropped to
 * the torso so they read as big as hats), a two-line name, price (soft gray
 * when out of reach) or OWNED, a heart for the wishlist, a set ribbon, and at
 * most one tag (LAST CHANCE, BACK AGAIN). Tapping opens the try-on sheet.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { TILE_TAG_LABEL, formatCoins, tileTag } from '../../helpers/shopShelves';
import { itemDisplayName, wearableBadge } from '../../helpers/wardrobe';
import { ShopItem } from '../../models/shop-today';
import { BRAND, FONT, GameIcon, SHADOW } from '../../ui';
import { MAX_FONT, Sheen, plateFor } from './shopUi';

const SHARK = require('../../../assets/images/screens/inventory/shark-colored-v2.png');

const TAG_COLOR = { owned: BRAND.greenLip, last_chance: BRAND.red, returning: '#7c4dff' } as const;

/** Body pieces are drawn on the shark, then zoomed to the torso (dressing-room slot anchor 52% 58%). */
export function TileArt({ item, size, torso = true }: { readonly item: Pick<ShopItem, 'id' | 'item_type' | 'icon_url' | 'paper_url'>; readonly size: number; readonly torso?: boolean }) {
  const h = size * 0.8;
  if (item.item_type?.id === 4) {
    const zoom = torso ? 1.9 : 1;
    return (
      <View style={{ width: size, height: h, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', width: size * zoom, height: h * zoom,
          left: size * (0.5 - 0.52 * zoom), top: h * (0.5 - 0.6 * zoom) }}>
          <Image source={SHARK} style={StyleSheet.absoluteFill} contentFit="contain" />
          <Image source={item.paper_url} recyclingKey={`paper-${item.id}`} cachePolicy="memory-disk" style={StyleSheet.absoluteFill} contentFit="contain" />
        </View>
      </View>
    );
  }
  return <Image source={item.icon_url} recyclingKey={`icon-${item.id}`} cachePolicy="memory-disk"
    style={{ width: size, height: h }} contentFit="contain" transition={120} />;
}

function ShopTile({ item, width, wished, vipLocked, affordable, still, justBought, onOpen, onWish }: {
  readonly item: ShopItem;
  readonly width: number;
  readonly wished: boolean;
  readonly vipLocked: boolean;
  readonly affordable: boolean;
  readonly still: boolean;
  /** Bought this visit: the tile stays put and stamps OWNED. */
  readonly justBought?: boolean;
  readonly onOpen: (item: ShopItem) => void;
  readonly onWish: (item: ShopItem) => void;
}) {
  const badge = wearableBadge(item);
  const tag = tileTag(item);
  const owned = tag === 'owned';
  const name = itemDisplayName(item);
  const plate = plateFor(item.rarity);
  const set = item.shop?.set;

  // Heart pop on toggle (skipped under Reduce Motion).
  const heart = useSharedValue(1);
  const first = useSharedValue(true);
  useEffect(() => {
    if (first.value) { first.value = false; return; }
    if (still) return;
    heart.value = withSequence(withTiming(1.45, { duration: 110 }), withSpring(1, { damping: 6, stiffness: 260 }));
  }, [wished]);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));

  // OWNED stamp slams in after a buy this visit.
  const stamp = useSharedValue(justBought && !still ? 2.2 : 1);
  useEffect(() => {
    if (justBought && !still) stamp.value = withSpring(1, { damping: 9, stiffness: 220 });
  }, [justBought]);
  const stampStyle = useAnimatedStyle(() => ({ transform: [{ scale: stamp.value }, { rotate: '-10deg' }] }));

  const a11y = `${name}${set ? `, part of ${set.name} set` : ''}, ${owned ? 'owned' : vipLocked ? 'VIP only'
    : `${formatCoins(item.cost)} Shark Coins${affordable ? '' : ', you need more coins'}`}${tag === 'last_chance' ? ', last chance' : tag === 'returning' ? ', back again' : ''}. Tap to try it on.`;

  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.tile, { width, borderColor: badge.border === '#FFFFFF' ? '#dbe8f4' : badge.border,
        transform: [{ scale: pressed ? 0.95 : 1 }] },
        badge.glow ? { shadowColor: badge.glow, shadowOpacity: 0.9, shadowRadius: 10 } : null]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
        <LinearGradient colors={plate} style={StyleSheet.absoluteFill} />
        {badge.rarity === 4 && !owned && <Sheen still={still} width={width + 60} />}
      </View>
      {/* White keyline: every rarity border reads on every banner colour. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.keyline, badge.inner ? { borderColor: badge.inner } : null]} />
      <View style={[styles.art, owned && { opacity: 0.6 }]}>
        <TileArt item={item} size={width - 18} />
      </View>
      <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={MAX_FONT}>{name}</Text>
      <View style={styles.priceRow}>
        {owned ? (
          <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.price, { color: BRAND.greenLip }]}>OWNED</Text>
        ) : vipLocked ? (
          <><GameIcon name="member" size={15} /><Text maxFontSizeMultiplier={MAX_FONT} style={styles.price}> VIP</Text></>
        ) : (
          <>
            {item.currency?.icon_url ? <Image source={{ uri: item.currency.icon_url }} style={[styles.coin, !affordable && { opacity: 0.45 }]} contentFit="contain" /> : null}
            <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.price, !affordable && styles.priceShort]}>{formatCoins(item.cost)}</Text>
          </>
        )}
      </View>
      {badge.label && !owned && (
        <View style={[styles.rarity, { backgroundColor: badge.labelColor }]}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.rarityText}>{badge.label}</Text>
        </View>
      )}
      {set && (
        <View style={[styles.setRibbon, { backgroundColor: set.color ?? BRAND.gold }]}>
          <GameIcon name="sparkle" size={13} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setRibbonText}>SET</Text>
        </View>
      )}
      {tag && tag !== 'owned' && (
        <View style={[styles.tag, { backgroundColor: TAG_COLOR[tag] }]}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.tagText}>{TILE_TAG_LABEL[tag]}</Text>
        </View>
      )}
      {owned ? (
        justBought ? (
          <Animated.View pointerEvents="none" style={[styles.stamp, stampStyle]}><Text style={styles.stampText}>OWNED</Text></Animated.View>
        ) : <View style={styles.corner}><GameIcon name="check" size={26} /></View>
      ) : (
        <Pressable onPress={() => onWish(item)} hitSlop={10} style={styles.corner}
          accessibilityRole="button" accessibilityState={{ selected: wished }}
          accessibilityLabel={wished ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}>
          <Animated.View style={[styles.heart, wished && styles.heartOn, heartStyle]}>
            <GameIcon name="heart" size={16} mono={wished ? BRAND.white : '#ff7aa6'} />
          </Animated.View>
        </Pressable>
      )}
    </Pressable>
  );
}

export default memo(ShopTile);

const styles = StyleSheet.create({
  tile: { borderRadius: 16, borderWidth: 3, paddingTop: 12, paddingBottom: 8, alignItems: 'center', overflow: 'visible',
    backgroundColor: BRAND.white, ...SHADOW.card },
  clip: { borderRadius: 13, overflow: 'hidden' },
  keyline: { borderRadius: 13, borderWidth: 2, borderColor: 'rgba(255,255,255,0.95)' },
  art: { marginHorizontal: 6 },
  name: { fontFamily: FONT.body, fontSize: 14, lineHeight: 15, color: BRAND.navy, marginTop: 4, paddingHorizontal: 6,
    textAlign: 'center', minHeight: 30 },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  coin: { width: 17, height: 17, marginRight: 3 },
  price: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy },
  priceShort: { color: '#8b9bb0' },
  rarity: { position: 'absolute', top: 6, left: 6, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  rarityText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, letterSpacing: 0.4 },
  setRibbon: { position: 'absolute', bottom: 34, left: -4, flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1.5, borderColor: BRAND.white },
  setRibbonText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.navy },
  tag: { position: 'absolute', top: -11, alignSelf: 'center', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 2, borderColor: BRAND.white },
  tagText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, letterSpacing: 0.5 },
  corner: { position: 'absolute', top: -9, right: -9 },
  heart: { width: 30, height: 30, borderRadius: 15, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#ff9bbf' },
  heartOn: { borderColor: BRAND.white, backgroundColor: '#ff4f8b' },
  stamp: { position: 'absolute', top: '32%', alignSelf: 'center', borderWidth: 3, borderColor: BRAND.greenLip, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  stampText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.greenLip, letterSpacing: 1 },
});
