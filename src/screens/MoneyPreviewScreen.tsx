/**
 * Dev-only capture bench for the money offers (devRoutes, __DEV__ only):
 * the top-up card in each place other screens will put it, on the real
 * catalog and the capture prices.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { GotIt } from '../components/money/moneyUi';
import { SafeAreaView } from 'react-native-safe-area-context';
import CoinTopUpOffer from '../components/money/CoinTopUpOffer';
import { BRAND, FONT } from '../ui';

export default function MoneyPreviewScreen({ route }: { route?: { params?: { screen?: string } } }) {
  const screen = route?.params?.screen;
  // Payoff captures: a Supplies buy landing, and a late Ask to Buy approval of the Shark Pass.
  const [payoff, setPayoff] = useState(screen === 'payoff' || screen === 'asktobuy');
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
  label: { fontFamily: FONT.display, fontSize: 14, color: '#fff' },
  blue: { backgroundColor: '#0a4f96', borderRadius: 20, padding: 12, borderWidth: 3, borderColor: '#fff' },
  cream: { backgroundColor: BRAND.cream, borderRadius: 20, padding: 12, borderWidth: 3, borderColor: BRAND.navy },
});
