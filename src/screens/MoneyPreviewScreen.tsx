/**
 * Dev-only capture bench for the money offers (devRoutes, __DEV__ only):
 * the top-up card in each place other screens will put it, on the real
 * catalog and the capture prices.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CoinTopUpOffer from '../components/money/CoinTopUpOffer';
import { BRAND, FONT } from '../ui';

export default function MoneyPreviewScreen() {
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
