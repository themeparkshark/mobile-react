/**
 * Try before you buy: the item on the player's own shark (the Playercard
 * overlay), with the rest of its set one tap away. Preview only: nothing is
 * saved to the look, so a "TRY-ON" stamp sits on the stage.
 */
import * as Haptics from 'expo-haptics';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import Playercard from '../../components/Playercard';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { missingPiecesToday, setProgressText, setRewardText } from '../../helpers/shopShelves';
import { itemDisplayName, slotForItem, wearableBadge } from '../../helpers/wardrobe';
import { InventoryType } from '../../models/inventory-type';
import { ShopItem, ShopSetSummary } from '../../models/shop-today';
import * as RootNavigation from '../../RootNavigation';
import { BRAND, FONT, GameButton, GameIcon, SHADOW } from '../../ui';
import { TileArt } from './ShopTile';

const STAGE_H = Math.min(330, Dimensions.get('window').height * 0.38);

/** The player's look with these items put on (pins and backdrops included). */
export function previewLook(base: InventoryType | undefined, items: ShopItem[]): InventoryType | null {
  if (!base?.skin_item?.no_eye_url) return null;
  const look: Record<string, unknown> = { ...base };
  for (const item of items) {
    const slot = slotForItem(item);
    if (!slot) continue;
    look[slot] = { id: item.id, name: item.name, icon_url: item.icon_url, paper_url: item.paper_url,
      no_eye_url: (item as { no_eye_url?: string }).no_eye_url, item_type: item.item_type };
  }
  return look as unknown as InventoryType;
}

export default function TryOnSheet({ item, allItems, sets, wished, onClose, onBuy, onWish }: {
  readonly item: ShopItem | null;
  readonly allItems: ShopItem[];
  readonly sets: ShopSetSummary[];
  readonly wished: boolean;
  readonly onClose: () => void;
  readonly onBuy: (item: ShopItem) => void;
  readonly onWish: (item: ShopItem) => void;
}) {
  const { player } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const [extra, setExtra] = useState<number[]>([]);
  useEffect(() => { setExtra([]); }, [item?.id]);

  const set = item?.shop?.set ? sets.find(s => s.slug === item.shop?.set?.slug) ?? null : null;
  const others = useMemo(() => (item && set ? missingPiecesToday(set.slug, allItems).filter(p => p.id !== item.id) : []),
    [item, set, allItems]);
  const wearing = useMemo(() => (item ? [item, ...others.filter(p => extra.includes(p.id))] : []), [item, others, extra]);
  const look = previewLook(player?.inventory, wearing);

  if (!item) return null;
  const badge = wearableBadge(item);
  const owned = !!(item.shop?.is_owned ?? item.has_purchased);
  const vipLocked = !!item.is_member_item && !player?.is_subscribed;
  const name = itemDisplayName(item);

  const toggleExtra = (piece: ShopItem) => {
    playSound(require('../../../assets/sounds/inventory_item_tap.mp3'));
    void Haptics.selectionAsync().catch(() => undefined);
    setExtra(ids => (ids.includes(piece.id) ? ids.filter(id => id !== piece.id) : [...ids, piece.id]));
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close try-on" />
        <Animated.View entering={SlideInDown.springify().damping(18).stiffness(180)} style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={[styles.stage, { height: STAGE_H }]}>
            {look ? (
              <>
                <Playercard inventory={look} popLayers style={{ position: 'absolute', width: '100%', height: STAGE_H - 10 }} />
                <View style={styles.stamp} pointerEvents="none"><Text style={styles.stampText}>TRY-ON</Text></View>
              </>
            ) : (
              <View style={styles.flatArt}><TileArt item={item} size={170} /></View>
            )}
            <Pressable onPress={onClose} style={styles.close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <GameIcon name="close" size={30} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={2}>{name}</Text>
              {badge.label && <View style={[styles.rarity, { backgroundColor: badge.labelColor }]}><Text style={styles.rarityText}>{badge.label}</Text></View>}
            </View>
            {item.shop?.last_chance && <Text style={styles.leaving}>Leaving the shop soon. It comes back next season.</Text>}
            {item.shop?.returning && <Text style={styles.back}>Back again by popular demand.</Text>}

            {set && (
              <View style={[styles.setCard, { borderColor: set.color ?? BRAND.gold }]}>
                <View style={styles.setHead}>
                  <Text style={styles.setName}>{set.name}</Text>
                  <Text style={styles.setCount}>{setProgressText(set)}</Text>
                </View>
                <Text style={styles.setReward}>{set.reward_state === 'claimed' ? `You wear the ${set.title ?? set.name} look.` : setRewardText(set)}</Text>
                {others.length > 0 && (
                  <>
                    <Text style={styles.complete}>Complete the look: tap to try the whole set</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                      {others.map(piece => {
                        const on = extra.includes(piece.id);
                        return (
                          <Pressable key={piece.id} onPress={() => toggleExtra(piece)} style={[styles.piece, on && styles.pieceOn]}
                            accessibilityRole="button" accessibilityState={{ selected: on }}
                            accessibilityLabel={`${on ? 'Take off' : 'Try on'} ${itemDisplayName(piece)}`}>
                            <TileArt item={piece} size={54} />
                            {on && <View style={styles.pieceCheck}><GameIcon name="check" size={18} /></View>}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.actions}>
            {!owned && (
              <Pressable onPress={() => onWish(item)} style={[styles.wish, wished && styles.wishOn]} accessibilityRole="button"
                accessibilityState={{ selected: wished }} accessibilityLabel={wished ? 'Remove from wishlist' : 'Add to wishlist'}>
                <GameIcon name="heart" size={22} style={wished ? undefined : { opacity: 0.35 }} />
              </Pressable>
            )}
            <View style={{ flex: 1 }}>
              {owned ? (
                <GameButton label="Wear it on your profile" variant="secondary" fullWidth
                  onPress={() => { onClose(); RootNavigation.navigate('Inventory'); }} />
              ) : vipLocked ? (
                <GameButton label="VIP only: see VIP" icon="member" variant="secondary" fullWidth
                  onPress={() => { onClose(); RootNavigation.navigate('Membership'); }} />
              ) : (
                <GameButton label={`Buy for ${item.cost.toLocaleString('en-US')}`} icon="coins" fullWidth onPress={() => onBuy(item)} />
              )}
            </View>
          </View>
          {!owned && <Text style={styles.wishHint}>{wished ? 'We will tell you when it is back.' : 'Heart it and we will tell you when it is back.'}</Text>}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: BRAND.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: BRAND.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 30,
    borderWidth: 3, borderColor: BRAND.white, ...SHADOW.card },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#d9cfae', marginTop: 8 },
  stage: { marginHorizontal: 14, marginTop: 8, borderRadius: 22, overflow: 'hidden', backgroundColor: BRAND.sky,
    borderWidth: 3, borderColor: BRAND.white },
  flatArt: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stamp: { position: 'absolute', left: 12, top: 12, backgroundColor: 'rgba(5,52,110,0.82)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, transform: [{ rotate: '-6deg' }] },
  stampText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.white, letterSpacing: 1 },
  close: { position: 'absolute', right: 10, top: 10 },
  body: { paddingHorizontal: 18, paddingTop: 12, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, fontFamily: FONT.display, fontSize: 24, color: BRAND.navy },
  rarity: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  rarityText: { fontFamily: FONT.display, fontSize: 11, color: BRAND.white, letterSpacing: 0.5 },
  leaving: { fontFamily: FONT.body, fontSize: 16, color: BRAND.red },
  back: { fontFamily: FONT.body, fontSize: 16, color: '#7c4dff' },
  setCard: { backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 3, padding: 12, gap: 4 },
  setHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  setName: { fontFamily: FONT.display, fontSize: 18, color: BRAND.navy },
  setCount: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navySoft },
  setReward: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navySoft },
  complete: { fontFamily: FONT.body, fontSize: 14, color: BRAND.blue, marginTop: 4 },
  piece: { width: 70, height: 66, borderRadius: 12, backgroundColor: '#f1f8ff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#d7e6f5' },
  pieceOn: { borderColor: BRAND.gold, backgroundColor: '#fff6d6' },
  pieceCheck: { position: 'absolute', top: -6, right: -6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  wish: { width: 54, height: 54, borderRadius: 27, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#d7e6f5' },
  wishOn: { borderColor: '#ff4f8b', backgroundColor: '#fff0f5' },
  wishHint: { textAlign: 'center', fontFamily: FONT.body, fontSize: 14, color: BRAND.navySoft, marginTop: 8 },
});
