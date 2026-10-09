/**
 * The Starter Pack, offered once at an earned moment (the post-win sheet),
 * never as a pop-up: one calm card with its honest worth, Apple's price, and
 * the grown-up gate on the tap. Shown at most once per device (and never
 * again after it is bought, which the server knows), so it never nags.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AuthContext } from '../../context/AuthProvider';
import { haptic } from '../../gamekit/Haptics';
import { baseRates, bundleWorth } from '../../services/money/offers';
import { buyPack, outcomeMessage, useSupplies } from '../../services/money/supplies';
import { storeAvailable } from '../../services/purchases';
import { trackImpression } from '../../services/money/track';
import { BRAND, FONT, gameAlert } from '../../ui';
import { CARD, Contents, GotIt, MAX_FONT, PackArt, PriceBar, Sticker } from './moneyUi';

const SEEN_KEY = 'money:starter-offer-seen';

export default function StarterOfferCard({ ready, onShown }: { ready: boolean; onShown?: (shown: boolean) => void }) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const canBuy = !!player && storeAvailable();
  const [show, setShow] = useState<boolean | null>(null);
  const { catalog, prices } = useSupplies(canBuy && show === true);
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!ready || !canBuy || show !== null) return;
    void AsyncStorage.getItem(SEEN_KEY).then((seen) => {
      setShow(!seen);
      if (!seen) void AsyncStorage.setItem(SEEN_KEY, String(Date.now())).catch(() => undefined);
    }).catch(() => setShow(false));
  }, [ready, canBuy, show]);

  const starter = catalog?.enabled ? catalog.products.find(p => p.limit === 'once' && p.available) : undefined;
  const price = starter ? prices[starter.product_id] : undefined;
  const visible = !!(show && starter && price);
  useEffect(() => { onShown?.(visible); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!show || !starter || !price) return null;
  const worth = bundleWorth(starter, prices, baseRates(catalog!.products, prices));
  trackImpression('postwin.starter', starter.product_id);

  const buy = async () => {
    haptic('tapLight');
    const outcome = await buyPack(starter, { onStart: () => setBusy(true), placement: 'postwin.starter' });
    setBusy(false);
    if (outcome.status === 'success') {
      await refreshPlayer?.().catch(() => undefined);
      setLanded(outcome.result.results[0]?.granted ?? starter.grants);
      return;
    }
    const message = outcomeMessage(outcome, null);
    if (message) gameAlert(message.title, message.body);
  };

  return (
    <Animated.View entering={FadeInUp.delay(400).springify().damping(15)} style={st.wrap}>
      <Pressable onPress={() => void buy()} disabled={busy} accessibilityRole="button"
        accessibilityLabel={`Starter Pack, just once. ${price.price}, real money, a grown-up buys it.${worth ? ` Worth ${worth.worth}.` : ''}`}
        style={({ pressed }) => [st.lip, pressed && st.lipPressed]}>
        <View style={st.card}>
          <PackArt art="chest" size={70} />
          <View style={{ flex: 1, gap: 4, paddingVertical: 8 }}>
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.title}>STARTER PACK · JUST ONCE</Text>
            {worth && <Text maxFontSizeMultiplier={MAX_FONT} style={st.worth}>{`Worth ${worth.worth}${worth.plusEnergy ? ' plus energy' : ''}`}</Text>}
            <Contents grants={starter.grants} size="tight" />
          </View>
          <View style={st.priceCol}><PriceBar price={price.price} busy={busy} /></View>
          {worth?.times && <Sticker text={`${worth.times}X VALUE`} style={{ top: 2, left: 2 }} />}
        </View>
      </Pressable>
      <GotIt grants={landed} art="chest" onDone={() => setLanded(null)} />
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: 4, marginTop: 8 },
  kicker: { fontFamily: FONT.display, fontSize: 13, color: BRAND.navy, textAlign: 'center', letterSpacing: 0.6 },
  lip: { borderRadius: 16, backgroundColor: CARD.lip, paddingBottom: 5 },
  lipPressed: { paddingBottom: 1, marginTop: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 3, borderColor: '#ffd84a',
    backgroundColor: CARD.bottom, overflow: 'hidden', paddingLeft: 6 },
  title: { fontFamily: FONT.display, fontSize: 14, color: '#ffffff' },
  worth: { fontFamily: FONT.display, fontSize: 13, color: '#ffe07a' },
  priceCol: { width: 96, alignSelf: 'stretch', justifyContent: 'center' },
});
