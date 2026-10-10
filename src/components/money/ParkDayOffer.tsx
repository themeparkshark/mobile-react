import AsyncStorage from '@react-native-async-storage/async-storage';
import { useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { AuthContext } from '../../context/AuthProvider';
import { LocationContext } from '../../context/LocationProvider';
import { storeAvailable } from '../../services/purchases';
import { buyPack, outcomeMessage, useSupplies } from '../../services/money/supplies';
import { baseRates, bundleWorth } from '../../services/money/offers';
import { PARK_OFFER_KEY, shouldShowParkOffer, type ParkOfferSeen } from '../../services/money/parkOffer';
import { trackImpression } from '../../services/money/track';
import { FONT, gameAlert } from '../../ui';
import BundleCard from './BundleCard';
import { GotIt, MAX_FONT } from './moneyUi';

/**
 * "At the park today?": the Park Day Pack, once per park day, the first time the kid is inside a park.
 * For the map HUD (the coordinator mounts it). Every buy goes through buyPack (the grown-up gate).
 * "Not now" hides it for the day; nothing nags.
 */
export default function ParkDayOffer({ style }: { style?: StyleProp<ViewStyle> }) {
  const { player } = useContext(AuthContext);
  const { park } = useContext(LocationContext);
  const inPark = !!park && !!player && storeAvailable();
  const { catalog, prices } = useSupplies(inPark);
  const [seen, setSeen] = useState<ParkOfferSeen | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    void AsyncStorage.getItem(PARK_OFFER_KEY).then(raw => setSeen(raw ? (JSON.parse(raw) as ParkOfferSeen) : null)).catch(() => setSeen(null));
  }, []);
  const pack = catalog?.products.find(p => p.product_id.endsWith('.pack.parkday'));
  const price = pack ? prices[pack.product_id] : undefined;
  const show = seen !== undefined && shouldShowParkOffer({
    inPark, shopDay: catalog?.day ?? null, seen, packAvailable: !!pack?.available, priced: !!price,
  });
  const markSeen = () => {
    if (!catalog) return;
    const next = { day: catalog.day };
    setSeen(next);
    void AsyncStorage.setItem(PARK_OFFER_KEY, JSON.stringify(next)).catch(() => undefined);
  };
  useEffect(() => { if (show && pack) trackImpression('park.arrival', pack.product_id); }, [show, pack?.product_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (landed) return <GotIt grants={landed} art="bag" onDone={() => setLanded(null)} />;
  if (!show || !pack || !price || !catalog) return null;
  const worth = bundleWorth(pack, prices, baseRates(catalog.products, prices));
  const buy = async () => {
    const outcome = await buyPack(pack, { onStart: () => setBusy(true), placement: 'park.arrival' });
    setBusy(false);
    if (outcome.status === 'success') { markSeen(); setLanded(outcome.result.results[0]?.granted ?? pack.grants); return; }
    const message = outcomeMessage(outcome, null);
    if (message) gameAlert(message.title, message.body);
  };
  return (
    <View style={[st.wrap, style]}>
      <Text maxFontSizeMultiplier={MAX_FONT} style={st.kicker}>{`AT ${String(park?.name ?? 'THE PARK').toUpperCase()} TODAY?`}</Text>
      <BundleCard product={pack} price={price.price} worth={worth} busy={busy} disabled={busy} onBuy={() => void buy()} band="PARK DAY PACK" art="bag" compact />
      <Pressable onPress={markSeen} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'center' }}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={st.notNow}>Not now</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: 6, padding: 10, borderRadius: 20, backgroundColor: 'rgba(5,40,90,0.85)', borderWidth: 2, borderColor: '#ffffff' },
  kicker: { fontFamily: FONT.display, fontSize: 15, color: '#ffd34d', textAlign: 'center' },
  notNow: { fontFamily: FONT.display, fontSize: 15, color: '#e2f6ff' },
});
