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
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { formatCoins, tileLanes, type TileRibbon } from '../../helpers/shopShelves';
import { itemDisplayName, wearableBadge } from '../../helpers/wardrobe';
import { ShopItem } from '../../models/shop-today';
import { BRAND, FONT, GameIcon, SHADOW } from '../../ui';
import { MAX_FONT, Sheen, WishHeart, plateFor } from './shopUi';
import { useWished } from './wishStore';

const SHARK = require('../../../assets/images/screens/inventory/shark-colored-v2.png');

const RIBBON: Record<Exclude<TileRibbon, null>, { label: string; color: string; ink: string }> = {
  last_chance: { label: 'LAST CHANCE', color: BRAND.red, ink: BRAND.white },
  returning: { label: 'BACK AGAIN', color: '#7c4dff', ink: BRAND.white },
  new: { label: 'NEW!', color: BRAND.gold, ink: BRAND.navy },
};

/** Body pieces are drawn on the shark, then zoomed to the torso so the shirt fills the tile. */
export function TileArt({ item, size, torso = true, thumb = true }: {
  readonly item: Pick<ShopItem, 'id' | 'item_type' | 'icon_url' | 'paper_url'> & { icon_thumb_url?: string | null; paper_thumb_url?: string | null };
  readonly size: number; readonly torso?: boolean; readonly thumb?: boolean;
}) {
  const h = size * 0.8;
  if (item.item_type?.id === 4) {
    const zoom = torso ? 2.5 : 1;
    const paper = (thumb && item.paper_thumb_url) || item.paper_url;
    return (
      <View style={{ width: size, height: h, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', width: size * zoom, height: h * zoom,
          left: size * (0.5 - 0.52 * zoom), top: h * (0.5 - 0.64 * zoom) }}>
          <Image source={SHARK} style={StyleSheet.absoluteFill} contentFit="contain" />
          <Image source={paper} recyclingKey={`paper-${item.id}`} cachePolicy="memory-disk" style={StyleSheet.absoluteFill} contentFit="contain" />
        </View>
      </View>
    );
  }
  return <Image source={(thumb && item.icon_thumb_url) || item.icon_url} recyclingKey={`icon-${item.id}`} cachePolicy="memory-disk"
    style={{ width: size, height: h }} contentFit="contain" transition={120} />;
}

function ShopTile({ item, width, vipLocked, affordable, still, justBought, showNew, onOpen, onWish }: {
  readonly item: ShopItem;
  readonly width: number;
  readonly vipLocked: boolean;
  readonly affordable: boolean;
  readonly still: boolean;
  /** Bought this visit: a one-second OWNED slam, then the normal owned look. */
  readonly justBought?: boolean;
  /** First open of the shop day: today's new items wear a NEW! ribbon. */
  readonly showNew: boolean;
  readonly onOpen: (item: ShopItem) => void;
  readonly onWish: (item: ShopItem) => void;
}) {
  const wished = useWished(item.id);
  const badge = wearableBadge(item);
  const owned = !!(item.shop?.is_owned ?? item.has_purchased);
  const { ribbon, showRarity } = tileLanes(item, showNew);
  const name = itemDisplayName(item);
  const plate = plateFor(item.rarity);
  const set = item.shop?.set;
  const artSize = width - 18;

  // Heart pop on toggle (skipped under Reduce Motion).
  const heart = useSharedValue(1);
  const [firstHeart, setFirstHeart] = useState(true);
  useEffect(() => {
    if (firstHeart) { setFirstHeart(false); return; }
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
      <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={MAX_FONT}>{name}</Text>
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
      {showRarity && badge.label && !owned && (
        <View style={[styles.rarity, { backgroundColor: badge.labelColor }]}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.rarityText}>{badge.label}</Text>
        </View>
      )}
      {set && !owned && (
        <View style={[styles.setChip, { backgroundColor: set.color ?? BRAND.gold, top: (ribbon ? 22 : 12) + artSize * 0.8 - 20 }]}>
          <GameIcon name="sparkle" size={13} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setChipText}>SET</Text>
        </View>
      )}
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
  name: { fontFamily: FONT.body, fontSize: 14, lineHeight: 15, color: BRAND.navy, marginTop: 4, paddingHorizontal: 6,
    textAlign: 'center', minHeight: 30 },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, minHeight: 19 },
  coin: { width: 17, height: 17, marginRight: 3 },
  price: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy },
  priceShort: { color: '#8b9bb0' },
  ownedText: { fontFamily: FONT.display, fontSize: 14, color: '#7c93ab' },
  rarity: { position: 'absolute', top: 6, left: 6, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  rarityText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, letterSpacing: 0.4 },
  setChip: { position: 'absolute', left: 6, flexDirection: 'row', alignItems: 'center', gap: 2,
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
