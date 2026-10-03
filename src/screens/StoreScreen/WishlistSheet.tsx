/**
 * My Wishlist: every hearted item, marked "In the shop today" or "Comes back
 * later", with a way to unheart. Opened from the heart pill in the tab row.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getWishlist, removeFromWishlist, type WishlistItem } from '../../api/endpoints/me/wishlist';
import { formatCoins } from '../../helpers/shopShelves';
import { BRAND, FONT, GameIcon, SHADOW } from '../../ui';
import { MAX_FONT, SHOP_SURFACE, WishHeart } from './shopUi';
import { wishStore } from './wishStore';

export default function WishlistSheet({ visible, still, onClose, onOpenItem }: {
  readonly visible: boolean;
  readonly still: boolean;
  readonly onClose: () => void;
  /** An item that is in the shop today: open its try-on. */
  readonly onOpenItem: (id: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setItems(null); setFailed(false);
    getWishlist().then(r => setItems(r.items)).catch(() => setFailed(true));
  }, [visible]);

  const [note, setNote] = useState<string | null>(null);
  const unheart = async (id: number) => {
    const before = items;
    setItems(list => list?.filter(i => i.id !== id) ?? null);
    wishStore.set(id, false);
    try { await removeFromWishlist(id); }
    catch {
      // Put the row back where it was and say so.
      wishStore.set(id, true);
      setItems(before);
      setNote('Couldn’t remove that. Try again.');
    }
  };

  if (!visible) return null;
  const alerts = wishStore.alerts();
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(140)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close wishlist" />
        <Animated.View entering={still ? FadeIn.duration(120) : SlideInDown.springify().damping(18)}
          style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
          <View style={styles.head}>
            <WishHeart on size={24} />
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.title}>My Wishlist</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"><GameIcon name="close" size={30} /></Pressable>
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.note}>
            {alerts ? 'Items come back. We’ll tell you next time one of these is in the shop.' : 'Items come back. Check the shop each day, or turn on Wishlist Alerts in Settings.'}
          </Text>
          {items === null && !failed && <ActivityIndicator color={BRAND.white} style={{ marginVertical: 24 }} />}
          {note && <View style={styles.alert}><Text maxFontSizeMultiplier={MAX_FONT} style={styles.alertText}>{note}</Text></View>}
          {failed && <Text style={styles.empty}>Couldn’t load your wishlist. Try again in a moment.</Text>}
          {items && items.length === 0 && <Text style={styles.empty}>Heart anything in the shop to save it here.</Text>}
          {items && items.length > 0 && (
            <FlatList data={items} keyExtractor={i => String(i.id)} style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <Pressable disabled={!item.in_shop_today} onPress={() => { onClose(); onOpenItem(item.id); }} style={styles.row}
                  accessibilityRole={item.in_shop_today ? 'button' : 'text'}
                  accessibilityLabel={`${item.name}, ${item.in_shop_today ? 'in the shop today, tap to try it on' : 'comes back later'}`}>
                  <Image source={item.icon_thumb_url ?? item.icon_url} style={styles.icon} contentFit="contain" />
                  <View style={{ flex: 1 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.name} numberOfLines={1}>{item.name}</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.state, item.in_shop_today && styles.stateIn]}>
                      {item.in_shop_today ? `In the shop today: ${formatCoins(item.cost)}` : 'Comes back later'}</Text>
                  </View>
                  <Pressable onPress={() => void unheart(item.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`}>
                    <WishHeart on size={24} />
                  </Pressable>
                </Pressable>
              )} />
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const S = SHOP_SURFACE;
const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: BRAND.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: S.panel, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 3, borderColor: S.border,
    paddingHorizontal: 16, paddingTop: 14, gap: 8, ...SHADOW.card },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontFamily: FONT.display, fontSize: 24, color: S.ink },
  note: { fontFamily: FONT.body, fontSize: 15, color: S.inkSoft },
  alert: { alignSelf: 'flex-start', backgroundColor: S.alert, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 2, borderColor: S.border },
  alertText: { fontFamily: FONT.display, fontSize: 15, color: S.ink },
  empty: { fontFamily: FONT.body, fontSize: 16, color: S.inkSoft, textAlign: 'center', marginVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: S.line },
  icon: { width: 52, height: 52, borderRadius: 12, backgroundColor: S.card },
  name: { fontFamily: FONT.display, fontSize: 17, color: S.ink },
  state: { fontFamily: FONT.body, fontSize: 15, color: S.inkSoft },
  stateIn: { color: S.inkGold },
});
