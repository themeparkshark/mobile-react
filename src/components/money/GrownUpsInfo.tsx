import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getMoneySpend } from '../../api/endpoints/me/money-spend';
import { useWishlist } from '../../services/money/wishlist';
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

/** "This month on this account: $6.98 in 2 buys." Exported for tests. */
export function spendLine(spend: { usd: number; buys: number } | null): string | null {
  if (!spend) return null;
  if (spend.buys === 0) return 'This month on this account: nothing bought yet.';
  return `This month on this account: $${spend.usd.toFixed(2)} in ${spend.buys} ${spend.buys === 1 ? 'buy' : 'buys'} (Supplies, Shark Pass, gift plans; list prices). VIP renewals show in the Apple ID's history of buys.`;
}

export default function GrownUpsInfo({ tone = 'onNavy' }: { tone?: 'onNavy' | 'onLight' }) {
  const ink = tone === 'onNavy' ? '#ffffff' : '#0b2a55';
  const [spend, setSpend] = useState<{ usd: number; buys: number } | null>(null);
  useEffect(() => { void getMoneySpend().then(setSpend); }, []);
  const wishes = useWishlist();
  const extra = [
    spendLine(spend),
    wishes.length ? `Your kid’s wishlist (saved on this phone, nothing is bought): ${wishes.map(w => w.name).join(', ')}.` : null,
  ].filter((x): x is string => !!x);
  return (
    <View style={st.list} accessible accessibilityLabel={`For grown-ups. ${[...extra, ...GROWN_UP_LINES].join(' ')}`}>
      {extra.map(line => (
        <View key={line} style={st.row}>
          <GameIcon name="info" size={16} />
          <Text maxFontSizeMultiplier={1.3} style={[st.text, { color: ink, fontFamily: FONT.display }]}>{line}</Text>
        </View>
      ))}
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
