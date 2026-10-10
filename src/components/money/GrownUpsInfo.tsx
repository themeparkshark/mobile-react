import { StyleSheet, Text, View } from 'react-native';
import { FONT, GameIcon } from '../../ui';

/**
 * One page for grown-ups (money stream round 4): everything a parent wants to know about paying in
 * Theme Park Shark, in plain words. Shown from the grown-up gate's offer card and the VIP page's
 * "Show a grown-up" card. Every line is true of the app and server rules (tests pin the key ones).
 */
export const GROWN_UP_LINES: readonly string[] = [
  'Every real-money buy asks a grown-up question first. Ask to Buy in Family Sharing works too.',
  'VIP is a subscription. A free trial turns into a paid plan unless it is turned off at least 24 hours before. Turn it off in Settings, your name, Subscriptions.',
  'The Shark Pass is one buy per season. It never renews. Steps come only from playing.',
  'Gift plans of VIP (1 or 12 months) never renew.',
  'Nothing random is sold for real money. Coins can be bought with real money; Mystery Pin Boxes cost coins and show their odds on the box.',
  'Gold editions and frames are looks only. They never change how the game plays, and they stay yours forever.',
  'If a buy is refunded, the coins, tickets and passes from it that are still unspent are taken back. Pins and frames already given stay.',
  'Supplies packs show exactly what they hold. No surprise prizes.',
  'Bring back an earlier buy with Restore on the VIP page or the Shark Pass page.',
];

export default function GrownUpsInfo({ tone = 'onNavy' }: { tone?: 'onNavy' | 'onLight' }) {
  const ink = tone === 'onNavy' ? '#ffffff' : '#0b2a55';
  return (
    <View style={st.list} accessible accessibilityLabel={`For grown-ups. ${GROWN_UP_LINES.join(' ')}`}>
      {GROWN_UP_LINES.map(line => (
        <View key={line} style={st.row}>
          <GameIcon name="check" size={16} />
          <Text maxFontSizeMultiplier={1.3} style={[st.text, { color: ink }]}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  list: { gap: 6, alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  text: { flex: 1, fontFamily: FONT.body, fontSize: 14 },
});
