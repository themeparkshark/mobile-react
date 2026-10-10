/**
 * Dev-only capture bench for the money offers (devRoutes, __DEV__ only):
 * the top-up card in each place other screens will put it, on the real
 * catalog and the capture prices.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { GotIt } from '../components/money/moneyUi';
import { useContext } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthContext } from '../context/AuthProvider';
import MemberFlex from '../components/money/MemberFlex';
import ParkDayOffer from '../components/money/ParkDayOffer';
import SharkPassBanner, { devPretendEarlier, noteSharkPassPoints } from '../components/money/SharkPassBanner';
import StarterOfferCard from '../components/money/StarterOfferCard';
import { getSharkPass } from '../api/endpoints/me/shark-pass';
import { useEffect } from 'react';
import type { InventoryType } from '../models/inventory-type';
import { SafeAreaView } from 'react-native-safe-area-context';
import CoinTopUpOffer from '../components/money/CoinTopUpOffer';
import { BRAND, FONT } from '../ui';

export default function MoneyPreviewScreen({ route }: { route?: { params?: { screen?: string } } }) {
  const screen = route?.params?.screen;
  // Payoff captures: a Supplies buy landing, and a late Ask to Buy approval of the Shark Pass.
  const [payoff, setPayoff] = useState(screen === 'payoff' || screen === 'asktobuy');
  const { player } = useContext(AuthContext);
  const look = player?.inventory as InventoryType | undefined;
  // The post-win sheet's money block on its own (the real sheet's preview does not scroll in captures):
  // the Shark Pass banner with its "+N pts" tick, then the one offer (Starter Pack, once ever).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (screen !== 'postwin-money') return;
    void getSharkPass().then(st => { noteSharkPassPoints(st); devPretendEarlier(120); setReady(true); });
  }, [screen]);
  if (screen === 'postwin-money') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a4f96', padding: 14, paddingTop: 80, gap: 10 }}>
        <Text style={s.label}>Post-win sheet, money block</Text>
        {ready && <SharkPassBanner style={{ alignSelf: 'stretch' }} />}
        <StarterOfferCard ready onShown={() => undefined} />
      </View>
    );
  }
  if (screen === 'park') {
    return <View style={{ flex: 1, backgroundColor: BRAND.blue, padding: 14, paddingTop: 80 }}><ParkDayOffer devPreview /></View>;
  }
  if (screen === 'flex') {
    // C9 dev preview: how MemberFlex reads in a Standings row and on a share card (the coordinator wires the real ones).
    const rows = [
      { rank: 1, name: 'You', pts: 2480, frame: 's1:aurora-frame', vip: true },
      { rank: 2, name: 'Player two', pts: 2310, frame: null, vip: false, step: 50 },
      { rank: 3, name: 'Player three', pts: 2205, frame: 's1:snowbound-frame', vip: false },
    ];
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BRAND.blue }}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={s.label}>Standings rows</Text>
          {rows.map(r => (
            <View key={r.rank} style={[s.row, r.vip && { borderLeftWidth: 6, borderLeftColor: BRAND.gold }]}>
              <Text style={s.rank}>{r.rank}</Text>
              <MemberFlex inventory={look} frame={r.frame} vip={r.vip} size={56} step={'step' in r ? (r as { step: number }).step : null} />
              <Text style={s.name}>{r.name}</Text>
              <Text style={s.pts}>{r.pts.toLocaleString('en-US')}</Text>
            </View>
          ))}
          <Text style={s.label}>Share card</Text>
          <LinearGradient colors={['#0d73c9', '#083d7a']} style={s.card}>
            <Text style={s.cardTitle}>FROSTY FINS</Text>
            <MemberFlex inventory={look} frame="s1:aurora-frame" vip variant="card" size={230} caption="Step 40 · Aurora Frame" />
            <Text style={s.cardFoot}>Theme Park Shark</Text>
          </LinearGradient>
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (payoff && screen === 'payoff') {
    return <View style={{ flex: 1, backgroundColor: BRAND.blue }}><GotIt grants={{ tickets: 15, coins: 1500, energy: 150, rescue_passes: 2 }} art="chest" onDone={() => setPayoff(false)} /></View>;
  }
  if (payoff && screen === 'asktobuy') {
    return (
      <View style={{ flex: 1, backgroundColor: BRAND.blue }}>
        <GotIt grants={{}} art="gift" title="Shark Pass on!" onDone={() => setPayoff(false)}
          caption="A grown-up said yes. Every Shark Pass reward you reach is yours." />
      </View>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BRAND.blue }}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.label}>Gear try-on (blue sheet), 120 coins short</Text>
        <View style={s.blue}><CoinTopUpOffer need={120} reason="gear" tone="onBlue" /></View>
        <Text style={s.label}>Mystery Pin Box, 830 coins short</Text>
        <View style={s.cream}><CoinTopUpOffer need={830} reason="mystery-box" /></View>
        <Text style={s.label}>Ride challenge, out of tickets</Text>
        <View style={s.cream}><CoinTopUpOffer need={1} reason="ride" currency="tickets" /></View>
        <Text style={s.label}>Coin level-up, 40 energy short</Text>
        <View style={s.cream}><CoinTopUpOffer need={40} reason="level-up" currency="energy" /></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 14, gap: 10, paddingBottom: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff8e4', borderRadius: 16, padding: 8, borderWidth: 2, borderColor: BRAND.navy },
  rank: { width: 24, fontFamily: FONT.display, fontSize: 20, color: BRAND.navy, textAlign: 'center' },
  name: { flex: 1, fontFamily: FONT.display, fontSize: 17, color: BRAND.navy },
  pts: { fontFamily: FONT.display, fontSize: 17, color: BRAND.navy },
  card: { alignItems: 'center', gap: 8, borderRadius: 24, padding: 18, borderWidth: 4, borderColor: '#fff' },
  cardTitle: { fontFamily: FONT.display, fontSize: 26, color: '#ffd34d' },
  cardFoot: { fontFamily: FONT.display, fontSize: 14, color: '#e2f6ff' },
  label: { fontFamily: FONT.display, fontSize: 14, color: '#fff' },
  blue: { backgroundColor: '#0a4f96', borderRadius: 20, padding: 12, borderWidth: 3, borderColor: '#fff' },
  cream: { backgroundColor: BRAND.cream, borderRadius: 20, padding: 12, borderWidth: 3, borderColor: BRAND.navy },
});
