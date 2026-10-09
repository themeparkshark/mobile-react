/**
 * <CoinTopUpOffer need={120} reason="gear" onDone={retry} />
 *
 * The out-of-coins (or tickets, or energy) moment, in one calm card, right
 * where the player is short: the one pack that covers the gap at the lowest
 * price, Apple's price on it, a grown-up gate before anything is bought, and
 * the free way to earn it underneath. Never a pop-up, never a timer, never
 * shown mid-game: the screen that is short places it.
 *
 * - need: how many are missing (the card says it, and picks the pack).
 * - reason: where the player is ("gear", "mystery-box", "ride", "level-up",
 *   "raid"), for the headline only.
 * - currency: coins (default), tickets or energy.
 * - onDone: called after a purchase lands (the payoff closes first), so the
 *   caller can retry the buy or the play.
 *
 * Renders nothing for a guest or an app build without StoreKit, and only the
 * free path while the catalog loads or when no pack covers the currency.
 */
import { useContext, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { ShopCurrency } from '../../api/endpoints/me/shop';
import { AuthContext } from '../../context/AuthProvider';
import { haptic } from '../../gamekit/Haptics';
import * as RootNavigation from '../../RootNavigation';
import { pickTopUp } from '../../services/money/offers';
import { buyPack, outcomeMessage, useSupplies } from '../../services/money/supplies';
import { trackImpression } from '../../services/money/track';
import { storeAvailable } from '../../services/purchases';
import { BRAND, FONT, GameIcon, gameAlert } from '../../ui';
import { CARD, GotIt, MAX_FONT, PackArt, PriceBar, currencyIcon, packArtKey, unitWord, type PackArtKey } from './moneyUi';
import { topUpHeadline, type TopUpCurrency, type TopUpReason } from '../../services/money/copy';

export type { TopUpCurrency, TopUpReason };

const FREE_PATH: Record<TopUpCurrency, string> = {
  coins: 'Or win ride coins at the park and open your daily chest. Free.',
  tickets: 'Or grab home finds near you for free tickets.',
  energy: 'Or grab home finds near you for free energy.',
};

export { topUpHeadline };

export default function CoinTopUpOffer({ need, reason, onDone, currency = 'coins', tone = 'onLight', style }: {
  need: number; reason: TopUpReason; onDone?: () => void; currency?: TopUpCurrency;
  /** onBlue on the house blue panels (try-on, Secret Shop), onLight on cream and white cards. */
  tone?: 'onLight' | 'onBlue'; style?: StyleProp<ViewStyle>;
}) {
  const blue = tone === 'onBlue';
  const kind = currency;
  const { player, refreshPlayer } = useContext(AuthContext);
  const canBuy = !!player && storeAvailable();
  const { catalog, prices } = useSupplies(canBuy);
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState<{ grants: Record<string, number>; art: PackArtKey } | null>(null);
  if (!canBuy || need <= 0) return null;

  const pack = catalog?.enabled ? pickTopUp(need, kind, catalog.products, prices) : null;
  const price = pack ? prices[pack.product_id] : undefined;
  const tier = pack && pack.section !== 'featured'
    ? catalog!.products.filter(p => p.section === pack.section).findIndex(p => p.product_id === pack.product_id) : 0;
  const amount = pack?.grants[kind] ?? 0;
  if (pack && price) trackImpression(`topup.${reason}.${kind}`, pack.product_id);

  const buy = async () => {
    if (!pack || busy) return;
    haptic('tapLight');
    const outcome = await buyPack(pack, { onStart: () => setBusy(true), placement: `topup.${reason}.${kind}` });
    setBusy(false);
    if (outcome.status === 'success') {
      await refreshPlayer?.().catch(() => undefined);
      setLanded({ grants: outcome.result.results[0]?.granted ?? pack.grants, art: packArtKey(pack, Math.max(0, tier)) });
      return;
    }
    const message = outcomeMessage(outcome, null);
    if (message) gameAlert(message.title, message.body);
  };

  const seeAll = () => RootNavigation.navigate('Store', { store: 'shark-shop', tab: 'supplies', focus: kind === 'tickets' ? 'tickets' : kind === 'coins' ? 'coins' : 'featured' });

  return (
    <Animated.View entering={FadeIn.duration(180)} style={[st.wrap, blue && st.wrapBlue, style]}>
      <View style={st.head}>
        <GameIcon name={currencyIcon(kind)} size={26} />
        <Text maxFontSizeMultiplier={MAX_FONT} style={[st.headline, blue && st.inkBlue]} numberOfLines={2}>{topUpHeadline(need, kind, reason)}</Text>
      </View>
      {pack && (
        <Pressable onPress={() => void buy()} disabled={busy || !price}
          accessibilityRole="button"
          accessibilityLabel={price ? `Get ${amount.toLocaleString('en-US')} ${unitWord(kind, amount)} for ${price.price}. Real money. A grown-up buys it.` : 'Loading the price'}
          style={({ pressed }) => [st.lip, pressed && st.lipPressed]}>
          <View style={st.card}>
            <View style={st.artWell}><PackArt art={packArtKey(pack, Math.max(0, tier))} size={58} /></View>
            <View style={{ flex: 1, paddingVertical: 8 }}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.packName} numberOfLines={1}>
                {pack.section === 'featured' ? pack.title : `${amount.toLocaleString('en-US')} ${unitWord(kind, amount)}`}
              </Text>
              {pack.section === 'featured' && (
                <Text maxFontSizeMultiplier={MAX_FONT} style={st.packSub} numberOfLines={1}>
                  {`${amount.toLocaleString('en-US')} ${unitWord(kind, amount)} and more`}
                </Text>
              )}
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.packSub}>A grown-up buys it</Text>
            </View>
            <View style={st.priceCol}><PriceBar price={price?.price} busy={busy} /></View>
          </View>
        </Pressable>
      )}
      <Text maxFontSizeMultiplier={MAX_FONT} style={[st.free, blue && st.inkSoftBlue]}>{FREE_PATH[kind]}</Text>
      {pack && (
        <Pressable onPress={seeAll} hitSlop={8} accessibilityRole="button" style={st.more}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={[st.moreText, blue && st.inkBlue]}>See all packs</Text>
          <GameIcon name="arrow" size={16} />
        </Pressable>
      )}
      <GotIt grants={landed?.grants ?? null} art={landed?.art ?? 'gift'} onDone={() => { setLanded(null); onDone?.(); }} />
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: 8, backgroundColor: 'rgba(5,52,110,0.08)', borderRadius: 18, padding: 10,
    borderWidth: 2, borderColor: 'rgba(5,52,110,0.12)' },
  wrapBlue: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.22)' },
  inkBlue: { color: '#ffffff' },
  inkSoftBlue: { color: '#e2f6ff' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headline: { flex: 1, fontFamily: FONT.display, fontSize: 18, color: BRAND.navy },
  lip: { borderRadius: 16, backgroundColor: CARD.lip, paddingBottom: 5 },
  lipPressed: { paddingBottom: 1, marginTop: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 3, borderColor: '#ffffff',
    backgroundColor: CARD.bottom, overflow: 'hidden', paddingLeft: 8 },
  artWell: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center' },
  packName: { fontFamily: FONT.display, fontSize: 19, color: '#ffffff', textShadowColor: CARD.lip, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  packSub: { fontFamily: FONT.body, fontSize: 13, color: '#e2f6ff' },
  priceCol: { width: 112, alignSelf: 'stretch', justifyContent: 'center' },
  free: { fontFamily: FONT.body, fontSize: 14, color: BRAND.navySoft, textAlign: 'center' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 32 },
  moreText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy },
});
