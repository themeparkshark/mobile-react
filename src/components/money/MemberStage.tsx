/**
 * The VIP page's hero: the player's OWN shark on a gold stage, wearing this
 * week's Secret Shop hero piece live (Club Penguin's "members wear this",
 * on your own penguin). When the Secret Shop is off or has nothing wearable
 * today, the shark wears its own look with the VIP badge. Rays turn slowly on
 * the UI thread; Reduce Motion holds everything still. Nothing here is bought.
 */
import { Image } from 'expo-image';
import { useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import getShopToday from '../../api/endpoints/stores/today';
import getStores from '../../api/endpoints/stores/stores';
import { AuthContext } from '../../context/AuthProvider';
import { fxKeyOf } from '../../fx/registry';
import { slotForItem } from '../../helpers/wardrobe';
import type { InventoryType } from '../../models/inventory-type';
import type { ShopItem } from '../../models/shop-today';
import { loadSecretShopFlag } from '../../services/secretShopFlag';
import { FONT, GameIcon } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import Playercard from '../Playercard';

const RAYS = require('../../../assets/images/reveal/rays.webp');

/** The first Secret piece the shark can wear on the stage (a backdrop scene needs the full try-on stage). */
export function stagePiece(items: readonly ShopItem[]): ShopItem | null {
  return items.find(item => !!fxKeyOf(item) && !!item.paper_url && slotForItem(item) && slotForItem(item) !== 'background_item') ?? null;
}

/** The player's look with one piece put on (nothing is saved). */
export function withPiece(base: InventoryType, item: ShopItem): InventoryType {
  const slot = slotForItem(item);
  if (!slot) return base;
  return { ...base, [slot]: { id: item.id, name: item.name, icon_url: item.icon_url, paper_url: item.paper_url,
    no_eye_url: item.no_eye_url ?? null, item_type: item.item_type, fx_key: item.fx_key ?? null } } as unknown as InventoryType;
}

let cachedPiece: ShopItem | null | undefined;

async function loadPiece(): Promise<ShopItem | null> {
  if (cachedPiece !== undefined) return cachedPiece;
  try {
    if (!(await loadSecretShopFlag())) return (cachedPiece = null);
    const secret = (await getStores()).find(store => store.is_secret_store);
    const today = secret ? await getShopToday(Number(secret.id)) : null;
    const sections = today?.sections ?? [];
    const ordered = [...sections.filter(s => s.type === 'featured'), ...sections.filter(s => s.type !== 'featured')];
    const hero = ordered.flatMap(s => s.items.filter(i => i.id === s.hero_id));
    return (cachedPiece = stagePiece([...hero, ...ordered.flatMap(s => s.items)]));
  } catch {
    return null;
  }
}

export default function MemberStage() {
  const { player } = useContext(AuthContext);
  const still = useUiReducedMotion();
  const [piece, setPiece] = useState<ShopItem | null>(cachedPiece ?? null);
  const spin = useSharedValue(0);
  useEffect(() => { let live = true; void loadPiece().then(p => { if (live) setPiece(p); }); return () => { live = false; }; }, []);
  useEffect(() => {
    if (still) return undefined;
    spin.value = withRepeat(withTiming(1, { duration: 24000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [still, spin]);
  const rays = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const base = player?.inventory as InventoryType | undefined;
  const look = base?.skin_item ? (piece ? withPiece(base, piece) : base) : null;

  return (
    <View style={st.stage} accessible accessibilityLabel={piece ? `Your shark wearing ${piece.name}, a VIP piece from the Secret Shop.` : 'Your shark as a VIP.'}>
      <Animated.Image source={RAYS} style={[st.rays, rays]} resizeMode="contain" />
      <View style={st.disc} />
      {look ? (
        <Animated.View entering={still ? undefined : ZoomIn.springify().damping(12)} style={st.card}>
          <Playercard inventory={look} showBackground={false} style={StyleSheet.absoluteFill} shadow fxLod="full" fxSound={false} />
        </Animated.View>
      ) : (
        <Image source={require('../../../assets/images/vip-hero.png')} style={st.fallback} contentFit="contain" />
      )}
      {/* No Secret piece to show: the VIP look is a gold crown on your own shark, never a bare stage. */}
      {!piece && look && <View style={st.crown} pointerEvents="none"><GameIcon name="crown" size={70} /></View>}
      <View style={st.badge}><GameIcon name="member" size={34} /></View>
      {piece && (
        <View style={st.caption}>
          <GameIcon name="crown" size={18} />
          <Text maxFontSizeMultiplier={1.2} style={st.captionText} numberOfLines={1}>{`VIP look: ${piece.name}`}</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  stage: { width: 300, height: 232, alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  rays: { position: 'absolute', top: -60, width: 360, height: 360, opacity: 0.35 },
  disc: { position: 'absolute', bottom: 14, width: 190, height: 40, borderRadius: 95, backgroundColor: '#ffcf3b',
    borderWidth: 4, borderColor: '#ffffff', borderBottomWidth: 7, borderBottomColor: '#d99a00' },
  card: { width: 210, height: 236, marginBottom: -8 },
  fallback: { width: 150, height: 150, marginBottom: 30 },
  crown: { position: 'absolute', top: 2, alignSelf: 'center', marginLeft: 26, transform: [{ rotate: '-10deg' }] },
  badge: { position: 'absolute', right: 58, top: 30, transform: [{ rotate: '12deg' }] },
  caption: { position: 'absolute', bottom: -6, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#05346e',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 2, borderColor: '#ffcf3b' },
  captionText: { fontFamily: FONT.display, fontSize: 14, color: '#ffffff' },
});
