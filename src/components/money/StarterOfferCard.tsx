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
import { trackImpression, trackMoney } from '../../services/money/track';
import { BRAND, FONT, gameAlert } from '../../ui';
import { GotIt } from './moneyUi';
import BundleCard from './BundleCard';

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
    void AsyncStorage.getItem(SEEN_KEY).then((seen) => setShow(!seen)).catch(() => setShow(false));
  }, [ready, canBuy, show]);

  // The server keeps "seen" per player (a reinstall or a second phone never shows it again). Latched from the
  // first catalog this card saw, so the card never vanishes while it is on screen.
  const [serverSeen, setServerSeen] = useState<boolean | null>(null);
  useEffect(() => { if (catalog && serverSeen === null) setServerSeen(!!catalog.starter_seen_at); }, [catalog, serverSeen]);
  const starter = catalog?.enabled ? catalog.products.find(p => p.limit === 'once' && p.available) : undefined;
  const price = starter ? prices[starter.product_id] : undefined;
  const visible = !!(show && serverSeen === false && starter && price);
  // Seen only once it really showed with its price: a slow store or no signal never burns the one-time offer.
  useEffect(() => {
    if (!visible || !starter) return;
    void AsyncStorage.setItem(SEEN_KEY, String(Date.now())).catch(() => undefined);
    trackMoney('starter_seen', 'postwin.starter', starter.product_id);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  // The sheet's one money offer is decided before anything else renders: tell the sheet as soon as we know.
  const decided = !ready ? null : !canBuy || show === false || serverSeen === true ? false : visible ? true : null;
  useEffect(() => { if (decided !== null) onShown?.(decided); }, [decided]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Prices that never come (no store, no signal): give the sheet back its VIP line after a short wait.
    if (!ready || decided !== null) return undefined;
    const t = setTimeout(() => onShown?.(false), 2500);
    return () => clearTimeout(t);
  }, [ready, decided]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!visible || !starter || !price) return null;
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
    <View style={st.wrap}>
      <BundleCard product={starter} price={price.price} worth={worth} busy={busy} disabled={busy} onBuy={() => void buy()} compact />
      <GotIt grants={landed} art="chest" onDone={() => setLanded(null)} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: 8 },
});
