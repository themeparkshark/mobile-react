/**
 * One Shark Shop v2 tile, in fixed lanes:
 * - rarity chip top-left (hidden when a time ribbon shows: the backplate still says rarity)
 * - heart (or the owned check) top-right
 * - one full-width top ribbon for a time tag: LEAVING SOON, BACK AGAIN or NEW
 * - SET chip on the art's bottom-left corner
 * Owned has one look: the check badge plus a dimmed "Owned" line. A tile
 * bought this visit slams an OWNED stamp for a second, then settles into it.
 * Tiles draw the 256 px thumbnail when the server has one.
 *
 * The heart state comes from the wishlist store per id, so a heart tap
 * re-renders this tile only.
 */
import { Image } from 'expo-image';
import { FxTileArt } from '../../fx/FxSolo';
import { fxKeyOf, isSecretItem } from '../../fx/registry';
import { SECRET_THEME } from '../../fx/secretTheme';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { formatCoins, slotWord, tileBand, tileLanes, type TileRibbon } from '../../helpers/shopShelves';
import { itemDisplayName, wearableBadge } from '../../helpers/wardrobe';
import { ShopItem } from '../../models/shop-today';
import { BRAND, FONT, GameIcon, SHADOW } from '../../ui';
import { MAX_FONT, Sheen, WishHeart, plateFor } from './shopUi';
import { useWished } from './wishStore';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
import { leavingIcon, leavingRibbon, leavingSay, visibleLeaving } from '../../helpers/shopLifecycle';

const RIBBON: Record<Exclude<TileRibbon, null>, { label: string; color: string; ink: string }> = {
  // Calm like LEAVING, never a red hurry (kids UX round 2).
  last_chance: { label: 'LEAVING SOON', color: BRAND.navy, ink: BRAND.gold },
  // Calm on purpose: navy and gold, never red. The label comes from the item (LEAVING or RETIRING) with its icon.
  leaving: { label: 'LEAVING', color: BRAND.navy, ink: BRAND.gold },
  returning: { label: 'BACK AGAIN', color: '#7c4dff', ink: BRAND.white },
  new: { label: 'NEW!', color: BRAND.gold, ink: BRAND.navy },
};

/**
 * Tile art. Body pieces show the garment alone (the server crops it from the
 * paper layer, then resizes: sharp, no mini shark); the flat icon is the
 * fallback. Everything else uses the 256 px icon thumbnail.
 */
export function TileArt({ item, size, thumb = true, still = false }: {
  readonly item: Pick<ShopItem, 'id' | 'item_type' | 'icon_url' | 'paper_url'> & { icon_thumb_url?: string | null; paper_torso_thumb_url?: string | null;
    fx_key?: string | null };
  readonly size: number; readonly thumb?: boolean;
  /** Secret Shop pieces animate in their tile (secret-shop/DESIGN.md 6); Reduce Motion holds the rest pose. */
  readonly still?: boolean;
}) {
  const h = size * 0.8;
  const fx = fxKeyOf(item);
  if (fx) {
    return <View style={{ width: size, height: h, alignItems: 'center', justifyContent: 'center' }}><FxTileArt fxKey={fx} size={h} still={still} /></View>;
  }
  const source = item.item_type?.id === 4
    ? (item.paper_torso_thumb_url || item.icon_url)
    : ((thumb && item.icon_thumb_url) || item.icon_url);
  return <Image source={source} recyclingKey={`art-${item.id}`} cachePolicy="memory-disk"
    style={{ width: size, height: h }} contentFit="contain" transition={120} />;
}

function ShopTile({ item, width, vipLocked, affordable, still, justBought, quiet = false, balance, onOpen, onWish }: {
  readonly item: ShopItem;
  readonly width: number;
  readonly vipLocked: boolean;
  readonly affordable: boolean;
  /** The player's coins, to say how many more a short tile needs. */
  readonly balance?: number;
  readonly still: boolean;
  /** Bought this visit: a one-second OWNED slam, then the normal owned look. */
  readonly justBought?: boolean;
  /** The banner already says it is the last chance: no ribbon on this tile. */
  readonly quiet?: boolean;
  readonly onOpen: (item: ShopItem) => void;
  readonly onWish: (item: ShopItem) => void;
}) {
  const wished = useWished(item.id);
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const badge = wearableBadge(item);
  const owned = !!(item.shop?.is_owned ?? item.has_purchased);
  // A members-only piece never tells a non-member it is retiring (that would be a VIP nudge).
  const leaving = visibleLeaving(item.shop, { secret: isSecretItem(item), vipLocked });
  const { ribbon } = tileLanes(leaving || !item.shop?.leaving ? item : { ...item, shop: { ...item.shop, leaving: null } }, quiet);
  const ribbonLabel = ribbon === 'leaving' && leaving ? leavingRibbon(leaving) : ribbon ? RIBBON[ribbon].label : '';
  const name = itemDisplayName(item);
  const secret = isSecretItem(item);
  const plate = secret ? SECRET_THEME.tilePlate : plateFor(item.rarity);
  const set = item.shop?.set;
  const artSize = width - 18;
  // The band is decided from the tile's measured width (the prop is the first guess, so the first
  // frame is already right and a matching measure never re-renders).
  const [measured, setMeasured] = useState(width);
  const band = tileBand(measured, badge.label, !!set && !owned, PixelRatio.getFontScale());

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

  const a11y = `${name}${badge.label ? `, ${badge.label.toLowerCase()}` : ''}${set ? `, part of ${set.name} set` : ''}, ${owned ? 'owned' : vipLocked && secret ? `${formatCoins(item.cost)} coins, VIP members can buy` : vipLocked ? 'VIP only'
    : `${formatCoins(item.cost)} coins${affordable ? '' : ', you need more coins'}`}${ribbon === 'leaving' && leaving ? `, ${leavingSay(leaving)}` : ribbon ? `, ${RIBBON[ribbon].label.toLowerCase()}` : ''}. Tap to try it on.`;

  return (
    <AnimatedPressable
      onPress={() => onOpen(item)}
      // Every tap squishes and clicks (game feel, Oct 8): a spring, not a flat snap.
      onPressIn={() => { void Haptics.selectionAsync().catch(() => undefined); if (!still) press.value = withTiming(0.94, { duration: 70 }); }}
      onPressOut={() => { press.value = still ? 1 : withSpring(1, { damping: 12, stiffness: 320 }); }}
      onLayout={e => { const w = Math.round(e.nativeEvent.layout.width); if (Math.abs(w - measured) >= 1) setMeasured(w); }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[styles.tile, pressStyle, { width, borderColor: secret ? SECRET_THEME.gold : badge.border === '#FFFFFF' ? '#c9dbeb' : badge.border },
        // The vault tile: gold rim with the gold button's darker lip under it (the house 3D edge).
        secret ? { borderBottomWidth: 6, borderBottomColor: SECRET_THEME.goldLip } : null,
        badge.glow ? { shadowColor: badge.glow, shadowOpacity: 0.9, shadowRadius: 10 } : null]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
        <LinearGradient colors={plate} style={StyleSheet.absoluteFill} />
        {/* Vault tiles: the panels' top gloss, not a sweeping sheen. */}
        {secret && <LinearGradient colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']} style={styles.gloss} />}
        {badge.rarity === 4 && !secret && !owned && <Sheen still={still} width={width + 60} />}
      </View>
      {/* White keyline: every rarity border reads on every banner colour. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.keyline, badge.inner ? { borderColor: badge.inner } : null]} />
      {ribbon && (
        <View style={[styles.ribbon, { backgroundColor: RIBBON[ribbon].color }, ribbon === 'leaving' && styles.ribbonClearOfHeart]}>
          {ribbon === 'leaving' && leaving && <GameIcon name={leavingIcon(leaving)} size={13} />}
          <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.ribbonText, { color: RIBBON[ribbon].ink }]}>{ribbonLabel}</Text>
        </View>
      )}
      <View style={[styles.art, { marginTop: ribbon ? 10 : secret ? 8 : 0 }, owned && { opacity: 0.6 }]}>
        <TileArt item={item} size={artSize} still={still} />
      </View>
      {/* Secret: a violet-and-gold corner tag (DESIGN.md 6.5), so a Secret tile reads from across a room. */}
      {secret && (
        <View style={styles.secretTag}>
          <GameIcon name="sparkle" size={12} />
          <Text maxFontSizeMultiplier={1} style={styles.secretTagText}>SECRET</Text>
        </View>
      )}
      {/* Reserved chip band: rarity and SET never sit on the art. */}
      {/* Secret tiles carry their badge in the corner tag, so the chip band shrinks (no dead gap under the art). */}
      <View style={[styles.band, secret && !set && { height: 6 }]}>
        {/* When rarity plus SET would not fit the measured tile, rarity shows as a dot (the label still says it). */}
        {/* No rarity to show: say what it is in one word (kids UX / shop critic, Oct 8). */}
        {!badge.label && !secret && slotWord(item.item_type?.id) && (
          <View style={styles.slot}><Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.slotText}>{slotWord(item.item_type?.id)}</Text></View>
        )}
        {badge.label && !owned && !secret && (band === 'dot' ? (
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
      <Text style={[styles.name, secret && styles.secretInk]} numberOfLines={2} ellipsizeMode="tail" maxFontSizeMultiplier={1.15}>{name}</Text>
      <View style={styles.priceRow}>
        {owned ? (
          slam ? null : <Text maxFontSizeMultiplier={MAX_FONT} style={styles.ownedText}>Yours</Text>
        ) : vipLocked && secret ? (
          // One price marker everywhere: the coin and the price, with a lock for non-members (kids UX round 1).
          <>
            {item.currency?.icon_url ? <Image source={{ uri: item.currency.icon_url }} style={styles.coin} contentFit="contain" /> : null}
            <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.price, styles.secretInk]}>{formatCoins(item.cost)} </Text>
            <GameIcon name="lock" size={16} />
          </>
        ) : vipLocked ? (
          <><GameIcon name="member" size={15} /><Text maxFontSizeMultiplier={MAX_FONT} style={styles.price}> VIP</Text></>
        ) : (
          <>
            {item.currency?.icon_url ? <Image source={{ uri: item.currency.icon_url }} style={[styles.coin, !affordable && { opacity: 0.6 }]} contentFit="contain" /> : null}
            {/* Short of coins: how many more, never just a grey price (monetization round 1). The try-on shows the price. */}
            {!affordable && balance != null
              ? <Text maxFontSizeMultiplier={1.1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                  style={[styles.need, secret && styles.secretInk]}>Need {formatCoins(item.cost - balance)} more</Text>
              : <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.price, secret && styles.secretInk, !affordable && styles.priceShort]}>{formatCoins(item.cost)}</Text>}
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
          accessibilityLabel={wished ? `Remove ${name} from Favorites` : `Save ${name} to Favorites`}>
          <Animated.View style={[styles.heart, wished && styles.heartOn, heartStyle]}>
            <WishHeart on={wished} size={18} />
          </Animated.View>
        </Pressable>
      )}
    </AnimatedPressable>
  );
}

export default memo(ShopTile);

const styles = StyleSheet.create({
  tile: { borderRadius: 16, borderWidth: 3, paddingTop: 12, paddingBottom: 8, alignItems: 'center', overflow: 'visible',
    backgroundColor: BRAND.white, ...SHADOW.card },
  clip: { borderRadius: 13, overflow: 'hidden' },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '35%' },
  keyline: { borderRadius: 13, borderWidth: 2, borderColor: 'rgba(255,255,255,0.95)' },
  ribbon: { position: 'absolute', top: 0, left: 0, right: 0, height: 20, borderTopLeftRadius: 13, borderTopRightRadius: 13,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3 },
  // The label centres in the space left of the heart (heart 30 pt, sitting 9 pt outside the tile, plus 4).
  ribbonClearOfHeart: { paddingRight: 25, paddingLeft: 4 },
  ribbonText: { fontFamily: FONT.display, fontSize: 12, letterSpacing: 0.6 },
  art: { marginHorizontal: 6 },
  band: { flexDirection: 'row', justifyContent: 'center', gap: 4, height: 22, alignItems: 'center', marginTop: 2, maxWidth: '100%', paddingHorizontal: 4, overflow: 'hidden' },
  rarityDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: BRAND.white },
  name: { fontFamily: FONT.body, fontSize: 14, lineHeight: 16, height: 32, color: BRAND.navy, paddingHorizontal: 6, textAlign: 'center' },
  // The Secret corner tag (DESIGN.md 6.5): gold plate with the vault-navy ink, in the corner of every Secret tile.
  // Drawn after the art, so nothing (a scene, a peeking ghost) ever covers it.
  secretTag: { position: 'absolute', top: 3, left: 3, zIndex: 5, borderTopLeftRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 8, paddingRight: 10,
    height: 22, backgroundColor: '#ffcf3b', borderBottomRightRadius: 12, borderRightWidth: 2, borderBottomWidth: 3, borderColor: '#d99a00' },
  secretTagText: { fontFamily: FONT.display, fontSize: 11, letterSpacing: 1, color: '#0b2156' },
  // Secret tiles are midnight, so their ink is white (art panel round 1: animated pieces glow on dark).
  secretInk: { color: '#ffffff' },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, minHeight: 19, maxWidth: '100%', paddingHorizontal: 6 },
  coin: { width: 17, height: 17, marginRight: 3 },
  price: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy },
  priceShort: { color: '#8b9bb0' },
  ownedText: { fontFamily: FONT.display, fontSize: 15, color: '#1b7f45' },
  need: { fontFamily: FONT.display, fontSize: 13, color: '#46607e', flexShrink: 1 },
  rarity: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  rarityText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, letterSpacing: 0.4 },
  setChip: { flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1.5, borderColor: BRAND.white },
  setChipText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.navy },
  // Inside the tile corner, never straddling the border (art director round 2).
  corner: { position: 'absolute', top: 4, right: 4 },
  slot: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: 'rgba(10,35,80,0.1)' },
  slotText: { fontFamily: FONT.display, fontSize: 12, color: '#34506f', letterSpacing: 0.4 },
  heart: { width: 28, height: 28, borderRadius: 14, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#ff9bbf' },
  heartOn: { borderColor: '#ff4f8b', backgroundColor: '#fff0f5' },
  stamp: { position: 'absolute', top: '32%', alignSelf: 'center', borderWidth: 3, borderColor: BRAND.greenLip, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.92)' },
  stampText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.greenLip, letterSpacing: 1 },
});
