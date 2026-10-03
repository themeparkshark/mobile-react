/**
 * One Shark Shop v2 tile, in fixed lanes:
 * - rarity chip top-left (hidden when a time ribbon shows: the backplate still says rarity)
 * - heart (or the owned check) top-right
 * - one full-width top ribbon for a time tag: LAST CHANCE, BACK AGAIN or NEW
 * - SET chip on the art's bottom-left corner
 * Owned has one look: the check badge plus a dimmed "Owned" line. A tile
 * bought this visit slams an OWNED stamp for a second, then settles into it.
 * Tiles draw the 256 px thumbnail when the server has one.
 *
 * The heart state comes from the wishlist store per id, so a heart tap
 * re-renders this tile only.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { formatCoins, tileLanes, type TileRibbon } from '../../helpers/shopShelves';
import { itemDisplayName, wearableBadge } from '../../helpers/wardrobe';
import { ShopItem } from '../../models/shop-today';
import { BRAND, FONT, GameIcon, SHADOW } from '../../ui';
import { MAX_FONT, Sheen, WishHeart, plateFor } from './shopUi';
import { useWished } from './wishStore';

const RIBBON: Record<Exclude<TileRibbon, null>, { label: string; color: string; ink: string }> = {
  last_chance: { label: 'LAST CHANCE', color: BRAND.red, ink: BRAND.white },
  returning: { label: 'BACK AGAIN', color: '#7c4dff', ink: BRAND.white },
  new: { label: 'NEW!', color: BRAND.gold, ink: BRAND.navy },
};

/**
 * Tile art. Body pieces show the garment alone (the server crops it from the
 * paper layer, then resizes: sharp, no mini shark); the flat icon is the
 * fallback. Everything else uses the 256 px icon thumbnail.
 */
export function TileArt({ item, size, thumb = true }: {
  readonly item: Pick<ShopItem, 'id' | 'item_type' | 'icon_url' | 'paper_url'> & { icon_thumb_url?: string | null; paper_torso_thumb_url?: string | null };
  readonly size: number; readonly thumb?: boolean;
}) {
  const h = size * 0.8;
  const source = item.item_type?.id === 4
    ? (item.paper_torso_thumb_url || item.icon_url)
    : ((thumb && item.icon_thumb_url) || item.icon_url);
  return <Image source={source} recyclingKey={`art-${item.id}`} cachePolicy="memory-disk"
    style={{ width: size, height: h }} contentFit="contain" transition={120} />;
}

function ShopTile({ item, width, vipLocked, affordable, still, justBought, quiet = false, onOpen, onWish }: {
  readonly item: ShopItem;
  readonly width: number;
  readonly vipLocked: boolean;
  readonly affordable: boolean;
  readonly still: boolean;
  /** Bought this visit: a one-second OWNED slam, then the normal owned look. */
  readonly justBought?: boolean;
  /** The banner already says LAST CHANCE: no red ribbon on this tile. */
  readonly quiet?: boolean;
  readonly onOpen: (item: ShopItem) => void;
  readonly onWish: (item: ShopItem) => void;
}) {
  const wished = useWished(item.id);
  const badge = wearableBadge(item);
  const owned = !!(item.shop?.is_owned ?? item.has_purchased);
  const { ribbon } = tileLanes(item, quiet);
  const name = itemDisplayName(item);
  const plate = plateFor(item.rarity);
  const set = item.shop?.set;
  const artSize = width - 18;

  // Heart pop on toggle (skipped under Reduce Motion).
  const heart = useSharedValue(1);
  const firstHeart = useRef(true);
  useEffect(() => {
    if (firstHeart.current) { firstHeart.current = false; return; }
    if (still) return;
    heart.value = withSequence(withTiming(1.45, { duration: 110 }), withSpring(1, { damping: 6, stiffness: 260 }));
  }, [wished]);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));

  // OWNED slam after a buy: in at 2.2x, holds a second, then fades into the normal owned look.
  const [slam, setSlam] = useState(!!justBought && !still);
  const stamp = useSharedValue(2.2);
  const stampOpacity = useSharedValue(1);
  useEffect(() => {
    if (!justBought || still) return;
    setSlam(true);
    stamp.value = withSpring(1, { damping: 9, stiffness: 220 });
    stampOpacity.value = withDelay(1000, withTiming(0, { duration: 260 }));
    const t = setTimeout(() => setSlam(false), 1300);
    return () => clearTimeout(t);
  }, [justBought]);
  const stampStyle = useAnimatedStyle(() => ({ opacity: stampOpacity.value, transform: [{ scale: stamp.value }, { rotate: '-10deg' }] }));

  const a11y = `${name}${set ? `, part of ${set.name} set` : ''}, ${owned ? 'owned' : vipLocked ? 'VIP only'
    : `${formatCoins(item.cost)} Shark Coins${affordable ? '' : ', you need more coins'}`}${ribbon ? `, ${RIBBON[ribbon].label.toLowerCase()}` : ''}. Tap to try it on.`;

  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.tile, { width, borderColor: badge.border === '#FFFFFF' ? '#c9dbeb' : badge.border,
        transform: [{ scale: pressed ? 0.95 : 1 }] },
        badge.glow ? { shadowColor: badge.glow, shadowOpacity: 0.9, shadowRadius: 10 } : null]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
        <LinearGradient colors={plate} style={StyleSheet.absoluteFill} />
        {badge.rarity === 4 && !owned && <Sheen still={still} width={width + 60} />}
      </View>
      {/* White keyline: every rarity border reads on every banner colour. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.keyline, badge.inner ? { borderColor: badge.inner } : null]} />
      {ribbon && (
        <View style={[styles.ribbon, { backgroundColor: RIBBON[ribbon].color }]}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.ribbonText, { color: RIBBON[ribbon].ink }]}>{RIBBON[ribbon].label}</Text>
        </View>
      )}
      <View style={[styles.art, { marginTop: ribbon ? 10 : 0 }, owned && { opacity: 0.6 }]}>
        <TileArt item={item} size={artSize} />
      </View>
      {/* Reserved chip band: rarity and SET never sit on the art. */}
      <View style={styles.band}>
        {/* Narrow tiles with a SET chip show rarity as a dot, so the band always fits. */}
        {badge.label && !owned && (set && width < 120 ? (
          <View style={[styles.rarityDot, { backgroundColor: badge.labelColor }]} accessibilityLabel={badge.label} />
        ) : (
          <View style={[styles.rarity, { backgroundColor: badge.labelColor }]}>
            <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.rarityText}>{badge.label}</Text>
          </View>
        ))}
        {set && !owned && (
          <View style={[styles.setChip, { backgroundColor: set.color ?? BRAND.gold }]}>
            <GameIcon name="sparkle" size={12} />
            <Text maxFontSizeMultiplier={1.1} style={styles.setChipText}>SET</Text>
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail" maxFontSizeMultiplier={1.15}>{name}</Text>
      <View style={styles.priceRow}>
        {owned ? (
          slam ? null : <Text maxFontSizeMultiplier={MAX_FONT} style={styles.ownedText}>Owned</Text>
        ) : vipLocked ? (
          <><GameIcon name="member" size={15} /><Text maxFontSizeMultiplier={MAX_FONT} style={styles.price}> VIP</Text></>
        ) : (
          <>
            {item.currency?.icon_url ? <Image source={{ uri: item.currency.icon_url }} style={[styles.coin, !affordable && { opacity: 0.45 }]} contentFit="contain" /> : null}
            <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.price, !affordable && styles.priceShort]}>{formatCoins(item.cost)}</Text>
          </>
        )}
      </View>
      {owned ? (
        <>
          {!slam && <View style={styles.corner}><GameIcon name="check" size={26} /></View>}
          {slam && <Animated.View pointerEvents="none" style={[styles.stamp, stampStyle]}><Text style={styles.stampText}>OWNED</Text></Animated.View>}
        </>
      ) : (
        <Pressable onPress={() => onWish(item)} hitSlop={10} style={styles.corner}
          accessibilityRole="button" accessibilityState={{ selected: wished }}
          accessibilityLabel={wished ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}>
          <Animated.View style={[styles.heart, wished && styles.heartOn, heartStyle]}>
            <WishHeart on={wished} size={18} />
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
  ribbon: { position: 'absolute', top: 0, left: 0, right: 0, height: 20, borderTopLeftRadius: 13, borderTopRightRadius: 13,
    alignItems: 'center', justifyContent: 'center' },
  ribbonText: { fontFamily: FONT.display, fontSize: 12, letterSpacing: 0.6 },
  art: { marginHorizontal: 6 },
  band: { flexDirection: 'row', justifyContent: 'center', gap: 4, height: 22, alignItems: 'center', marginTop: 2, maxWidth: '100%', paddingHorizontal: 4, overflow: 'hidden' },
  rarityDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: BRAND.white },
  name: { fontFamily: FONT.body, fontSize: 14, lineHeight: 16, height: 32, color: BRAND.navy, paddingHorizontal: 6, textAlign: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, minHeight: 19 },
  coin: { width: 17, height: 17, marginRight: 3 },
  price: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy },
  priceShort: { color: '#8b9bb0' },
  ownedText: { fontFamily: FONT.display, fontSize: 14, color: '#7c93ab' },
  rarity: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  rarityText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, letterSpacing: 0.4 },
  setChip: { flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1.5, borderColor: BRAND.white },
  setChipText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.navy },
  corner: { position: 'absolute', top: -9, right: -9 },
  heart: { width: 30, height: 30, borderRadius: 15, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#ff9bbf' },
  heartOn: { borderColor: '#ff4f8b', backgroundColor: '#fff0f5' },
  stamp: { position: 'absolute', top: '32%', alignSelf: 'center', borderWidth: 3, borderColor: BRAND.greenLip, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.92)' },
  stampText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.greenLip, letterSpacing: 1 },
});
