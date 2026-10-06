/**
 * Supplies: the Shark Shop's in-app purchase shelf (Apple StoreKit 2
 * consumables) plus the free daily Ticket.
 *
 * Fair by design, and the copy says so:
 * - Every price is Apple's localized price, exactly what the player is
 *   charged. Every pack lists exactly what it holds. No random rewards.
 * - Only Park Tickets, Shark Coins, Energy and Rescue Passes are sold. Ride
 *   Parts, ride coins and coin levels are earned at the park, never sold.
 * - "Best value" only where it is true (the server checks it), one-time and
 *   daily packs say so, and the Daily Deal timer is the real day rollover.
 * - Parents control purchases through Apple (Ask to Buy); a pending approval
 *   is explained, never retried behind their back.
 *
 * The server grants, never this screen: a purchase is sent to the server,
 * which verifies Apple's signature and credits it once.
 *
 * Works on the 1.7.0 binary only (StoreKit module). On 1.6.0 it asks for an
 * update; VIP players can still claim the free Ticket there (no ad needed).
 */
import { openExternal } from '../../services/external';
import * as Haptics from 'expo-haptics';
import { askGrownUp, type GateReason } from '../../components/GrownUpGate';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AuthContext } from '../../context/AuthProvider';
import { getShop, type ShopCatalog, type ShopGrants, type ShopProduct } from '../../api/endpoints/me/shop';
import { getAdSummary, type AdSummary } from '../../api/endpoints/me/ad-rewards';
import { buyShopProduct, loadShopPrices, onShopDelivered, storeAvailable, type ShopPrice } from '../../services/purchases';
import { adsAvailable, rewardText, watchForReward } from '../../services/ads';
import { BRAND, GameButton, GameIcon, SharkLoader, gameAlert, type GameIconName } from '../../ui';
import OneTimeTip from '../../components/help/OneTimeTip';
import RealMoneyMark, { REAL_MONEY_GREEN, REAL_MONEY_INK, REAL_MONEY_TINT } from '../../components/RealMoneyMark';
import { useHelp } from '../../components/help/HelpProvider';
import type { GlossaryKey } from '../../services/help/glossary';

const APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6758812566';

export type SuppliesFocus = 'tickets' | 'coins' | 'rescue' | 'featured';

const CURRENCY: Record<keyof ShopGrants, { icon: GameIconName; one: string; many: string }> = {
  tickets: { icon: 'ticket', one: 'ticket', many: 'tickets' },
  coins: { icon: 'coins', one: 'coin', many: 'coins' },
  energy: { icon: 'energy', one: 'energy', many: 'energy' },
  rescue_passes: { icon: 'retry', one: 'Rescue Pass', many: 'Rescue Passes' },
};
const ORDER: (keyof ShopGrants)[] = ['tickets', 'coins', 'energy', 'rescue_passes'];
const WALLET_TERM: Record<keyof ShopGrants, GlossaryKey> = {
  tickets: 'tickets', coins: 'coins', energy: 'energy', rescue_passes: 'rescue_pass',
};

/** "15 tickets, 1,500 coins and 2 Rescue Passes". */
export function grantsText(grants: ShopGrants): string {
  const parts = ORDER.filter(k => (grants[k] ?? 0) > 0)
    .map(k => `${(grants[k] ?? 0).toLocaleString('en-US')} ${grants[k] === 1 ? CURRENCY[k].one : CURRENCY[k].many}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
}

/** What the grown-up gate restates before a real-money buy: "$4.99 for 15 tickets". */
export function gateReasonFor(product: ShopProduct, price: ShopPrice | undefined): GateReason {
  return { kind: 'money', price: price?.price ?? 'Real money', gets: grantsText(product.grants) };
}

export default function SuppliesShop({ focus }: { focus?: SuppliesFocus }) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { hasSeenTip, explain } = useHelp();
  const canBuy = storeAvailable();
  const vip = !!player?.is_subscribed;
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [prices, setPrices] = useState<Record<string, ShopPrice>>({});
  const [ads, setAds] = useState<AdSummary | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const buyingRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<SuppliesFocus, number>>>({});
  const scrolledTo = useRef(false);

  const reload = useCallback(async () => {
    const [nextCatalog, nextAds] = await Promise.all([getShop(), getAdSummary().catch(() => null)]);
    setCatalog(nextCatalog);
    setAds(nextAds);
    return nextCatalog;
  }, []);

  useEffect(() => {
    if (!player) return;
    let live = true;
    setStatus('loading');
    reload().then(async (next) => {
      if (!live) return;
      setStatus('ready');
      if (!canBuy) return;
      const loaded = await loadShopPrices(next.products.map(p => p.product_id)).catch(() => ({}));
      if (live) setPrices(loaded);
    }).catch(() => { if (live) setStatus('error'); });
    return () => { live = false; };
  }, [player?.id, attempt, canBuy, reload]);

  // Ask to Buy approvals and last run's unfinished purchases land here.
  useEffect(() => onShopDelivered(() => {
    void refreshPlayer().catch(() => undefined);
    void reload().catch(() => undefined);
  }), [refreshPlayer, reload]);

  const onSection = (key: SuppliesFocus) => (event: LayoutChangeEvent) => {
    sectionY.current[key] = event.nativeEvent.layout.y;
    if (focus === key && !scrolledTo.current) {
      scrolledTo.current = true;
      setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 8), animated: true }), 250);
    }
  };

  const buy = async (product: ShopProduct) => {
    // A ref, not state: a second tap while the gate is up must never start a second purchase.
    if (busy || buyingRef.current || !catalog) return;
    buyingRef.current = true;
    try {
      // Real money: a grown-up answers first (Apple Kids category, guideline 1.3),
      // and the gate says what they are saying yes to: the price and what's in the pack.
      if (!(await askGrownUp(gateReasonFor(product, prices[product.product_id])))) return;
      await buyNow(product, catalog);
    } finally {
      buyingRef.current = false;
    }
  };
  const buyNow = async (product: ShopProduct, catalog: ShopCatalog) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(product.product_id);
    const outcome = await buyShopProduct(product.product_id, { accountToken: catalog.account_token, shownDay: catalog.day });
    setBusy(null);
    if (outcome.status === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const granted = outcome.result.results[0]?.granted ?? product.grants;
      gameAlert('You got it!', `${grantsText(granted)}. They’re yours now.`);
      await refreshPlayer().catch(() => undefined);
      await reload().catch(() => undefined);
    } else if (outcome.status === 'pending') {
      gameAlert('Waiting for a grown-up', 'A grown-up needs to say yes on their phone. Your Supplies show up after that.');
    } else if (outcome.status === 'unverified') {
      gameAlert('Almost there', 'It worked! Your Supplies show up in a minute. If not, they come next time you open the game.');
    } else if (outcome.status === 'other_account') {
      gameAlert('Bought on another account', 'This was bought on a different Theme Park Shark account. Sign in to that account to get it.');
    } else if (outcome.status === 'unavailable') {
      gameAlert('Update the game', 'Update Theme Park Shark in the App Store to buy Supplies.');
    } else if (outcome.status === 'failed') {
      gameAlert('That didn’t work', 'You weren’t charged. Check your internet, then tap the price again.');
    }
  };

  const claimDailyTicket = async () => {
    if (busy) return;
    setBusy('daily_ticket');
    const outcome = await watchForReward('daily_ticket', ads?.placements.daily_ticket.ref ?? null, vip);
    setBusy(null);
    if (outcome.status === 'granted') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      gameAlert('Free ticket!', outcome.reward.reward.overflow_message ?? `${rewardText(outcome.reward.reward)} added.`);
      await refreshPlayer().catch(() => undefined);
    } else if (outcome.status === 'checking') {
      gameAlert('Almost there', 'Thanks for watching. Your ticket shows up in a moment.');
    } else if (outcome.status === 'no_fill') {
      gameAlert('No ad right now', 'There’s no ad to show. Try again in a little while.');
    } else if (outcome.status === 'capped' || outcome.status === 'claimed') {
      gameAlert('Done for today', 'Your free ticket comes back tomorrow.');
    } else if (outcome.status === 'failed') {
      gameAlert('That didn’t work', 'Check your internet and try again.');
    }
    await reload().catch(() => undefined);
  };

  const sections = useMemo(() => {
    const bySection = new Map<string, ShopProduct[]>();
    for (const p of catalog?.products ?? []) bySection.set(p.section, [...(bySection.get(p.section) ?? []), p]);
    return bySection;
  }, [catalog]);

  if (!player) {
    return <Notice icon="lock" title="Sign in to shop" body="Sign in first. Then your Supplies stay with your shark on every phone." />;
  }
  if (status !== 'ready' || !catalog) {
    return (
      <View style={st.center}>
        <SharkLoader tone="onBlue" state={status === 'error' ? 'error' : 'loading'} compact
          title={status === 'error' ? 'Supplies couldn’t open' : undefined} onRetry={() => setAttempt(a => a + 1)} />
      </View>
    );
  }

  const daily = ads?.placements.daily_ticket;
  const showDaily = !!ads?.enabled && !!daily && (vip || adsAvailable());

  return (
    <ScrollView ref={scroll} contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
      <View style={st.wallet}>
        {ORDER.map(k => (
          // Each balance explains itself, like the map's pills.
          <Pressable key={k} style={st.walletChip} accessibilityRole="button"
            accessibilityLabel={`${(catalog.wallet[k] ?? 0).toLocaleString('en-US')} ${CURRENCY[k].many}`}
            accessibilityHint="Explains what this is"
            onPress={() => explain(WALLET_TERM[k], { count: catalog.wallet[k] ?? 0 })}>
            <GameIcon name={CURRENCY[k].icon} size={22} />
            {/* Rescue Passes have no picture of their own yet, so the chip says the word too. */}
            <Text style={st.walletText}>{(catalog.wallet[k] ?? 0).toLocaleString('en-US')}{k === 'rescue_passes' ? ((catalog.wallet[k] ?? 0) === 1 ? ' pass' : ' passes') : ''}</Text>
          </Pressable>
        ))}
      </View>

      {/* First visit: what Supplies is, once. Then, at the first ad offer, that ads are optional. */}
      <OneTimeTip id="supplies_tab" ready={status === 'ready' && !busy} compact style={{ marginBottom: 10 }} />
      {showDaily && !vip && daily.remaining > 0 && hasSeenTip('supplies_tab') && (
        <OneTimeTip id="bonus_ads" ready={status === 'ready' && !busy} compact style={{ marginBottom: 10 }} />
      )}
      {showDaily && (
        <Animated.View entering={FadeInUp.springify().damping(15)} style={st.freeCard}>
          <GameIcon name="ticket" size={40} />
          <View style={{ flex: 1 }}>
            <Text style={st.freeTitle}>FREE DAILY TICKET</Text>
            <Text style={st.freeBody}>
              {daily.remaining > 0
                ? vip ? 'Free for VIP members. No ad. Tap Claim.' : 'Watch one short ad for 1 free ticket. You don’t have to.'
                : 'Claimed. Back tomorrow.'}
            </Text>
          </View>
          {daily.remaining > 0 && (
            <GameButton label={vip ? 'Claim' : 'Watch'} size="compact" fullWidth={false} icon={vip ? 'member' : 'play'}
              loading={busy === 'daily_ticket'} disabled={!!busy} onPress={() => void claimDailyTicket()}
              // A fixed width: an unsized art button grows to its cap and squeezes the copy to one word a line.
              style={{ width: 118 }}
              accessibilityLabel={vip ? 'Claim your free daily ticket' : 'Watch an ad for a free ticket'} />
          )}
        </Animated.View>
      )}

      {!canBuy ? (
        <Notice icon="info" title="Update the game" body="Update Theme Park Shark to buy Supplies."
          action={{ label: 'Update the app', onPress: () => void openExternal(APP_STORE_URL, 'system') }} />
      ) : !catalog.enabled ? (
        <Notice icon="timer" title="Back soon" body="Supplies are closed right now. Come back later." />
      ) : (
        <>
          {/* Before any price: these cost real money, and a grown-up buys them. */}
          <View style={st.realMoney} accessible accessibilityLabel="Supplies cost real money. A grown-up buys them.">
            <RealMoneyMark size={36} />
            <View style={{ flex: 1 }}>
              <Text style={st.realMoneyHead}>REAL MONEY</Text>
              <Text style={st.realMoneyBody}>Supplies cost real money. A grown-up buys them.</Text>
            </View>
          </View>
          <View onLayout={onSection('featured')}>
            {(sections.get('featured') ?? []).map((p, i) => (
              <FeaturedCard key={p.product_id} product={p} price={prices[p.product_id]} index={i}
                busy={busy === p.product_id} disabled={!!busy} onBuy={() => void buy(p)} />
            ))}
          </View>
          {(['tickets', 'coins', 'rescue'] as const).map(key => (sections.get(key)?.length ?? 0) > 0 && (
            <View key={key} onLayout={onSection(key)} style={st.section}>
              <Text style={st.sectionTitle}>{catalog.sections.find(s => s.key === key)?.title ?? key}</Text>
              {key === 'rescue' && <Text style={st.sectionNote}>A Rescue Pass gives you one more try at a ride coin you don’t have yet.</Text>}
              <View style={st.grid}>
                {(sections.get(key) ?? []).map(p => (
                  <PackCard key={p.product_id} product={p} price={prices[p.product_id]}
                    busy={busy === p.product_id} disabled={!!busy} onBuy={() => void buy(p)}
                    holdCap={catalog.ticket_hold_cap} />
                ))}
              </View>
            </View>
          ))}
        </>
      )}

      <View style={st.rules}>
        {catalog.rules.map(rule => (
          <View key={rule} style={st.ruleRow}>
            <GameIcon name="check" size={16} />
            <Text style={st.rule}>{rule}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function unavailableText(product: ShopProduct, holdCap: number | null): string | null {
  switch (product.unavailable_reason) {
    case 'bought_today': return 'Bought today. Back tomorrow.';
    case 'pouch_full': return `You can hold ${holdCap ?? 30} tickets. Use some first.`;
    case 'unavailable': return 'Not available right now.';
    default: return null;
  }
}

function PriceButton({ product, price, busy, disabled, onBuy, holdCap = null }: {
  product: ShopProduct; price?: ShopPrice; busy: boolean; disabled: boolean; onBuy: () => void; holdCap?: number | null;
}) {
  const blocked = unavailableText(product, holdCap);
  if (blocked) return <Text style={st.blocked}>{blocked}</Text>;
  return (
    <Pressable onPress={onBuy} disabled={disabled || !price}
      style={({ pressed }) => [st.price, (!price || disabled) && st.priceDisabled, pressed && st.pricePressed]}
      accessibilityRole="button" accessibilityLabel={price ? `Buy ${product.title} for ${price.price}. Real money. A grown-up buys it.` : `${product.title} is loading`}>
      <Text style={st.priceText}>{busy ? 'ONE MOMENT' : price ? price.price : 'LOADING'}</Text>
      {/* The price never stands alone: every one says it is real money. */}
      {price && !busy && <Text style={st.priceNote}>real money</Text>}
    </Pressable>
  );
}

function Contents({ grants, size = 'big' }: { grants: ShopGrants; size?: 'big' | 'small' }) {
  return (
    <View style={st.contents}>
      {ORDER.filter(k => (grants[k] ?? 0) > 0).map(k => (
        <View key={k} style={st.contentChip}>
          <GameIcon name={CURRENCY[k].icon} size={size === 'big' ? 22 : 18} />
          <Text style={[st.contentText, size === 'small' && st.contentTextSmall]}>
            {(grants[k] ?? 0).toLocaleString('en-US')} {grants[k] === 1 ? CURRENCY[k].one : CURRENCY[k].many}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FeaturedCard({ product, price, index, busy, disabled, onBuy }: {
  product: ShopProduct; price?: ShopPrice; index: number; busy: boolean; disabled: boolean; onBuy: () => void;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(80 + index * 80).springify().damping(15)} style={st.featured}>
      <View style={st.featuredHead}>
        <Text style={st.featuredTitle}>{product.title.toUpperCase()}</Text>
        {/* Every limit sits in the same spot: the badge. */}
        {(product.badge ?? (product.limit === 'daily' ? 'One per day' : null)) && (
          <Text style={st.badge}>{(product.badge ?? 'One per day').toUpperCase()}</Text>
        )}
      </View>
      {/* No countdown on anything you can buy. The deal looks like every other pack; its badge says it changes each day. */}
      <Contents grants={product.grants} />
      <PriceButton product={product} price={price} busy={busy} disabled={disabled} onBuy={onBuy} />
    </Animated.View>
  );
}

function PackCard({ product, price, busy, disabled, onBuy, holdCap }: {
  product: ShopProduct; price?: ShopPrice; busy: boolean; disabled: boolean; onBuy: () => void; holdCap: number | null;
}) {
  const main = ORDER.find(k => (product.grants[k] ?? 0) > 0) ?? 'tickets';
  return (
    <View style={[st.pack, product.badge === 'Best value' && st.packBest]}>
      {product.badge && <Text style={st.packBadge}>{product.badge.toUpperCase()}</Text>}
      <GameIcon name={CURRENCY[main].icon} size={44} />
      <Text style={st.packAmount}>{(product.grants[main] ?? 0).toLocaleString('en-US')}</Text>
      <Text style={st.packLabel}>{product.grants[main] === 1 ? CURRENCY[main].one : CURRENCY[main].many}</Text>
      <PriceButton product={product} price={price} busy={busy} disabled={disabled} onBuy={onBuy} holdCap={holdCap} />
    </View>
  );
}

function Notice({ icon, title, body, action }: {
  icon: GameIconName; title: string; body: string; action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={st.notice}>
      <GameIcon name={icon} size={36} />
      <Text style={st.noticeTitle}>{title}</Text>
      <Text style={st.noticeBody}>{body}</Text>
      {action && <GameButton label={action.label} onPress={action.onPress} />}
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  scroll: { padding: 14, paddingBottom: 40, gap: 12 },
  wallet: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
  walletChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BRAND.blue, borderRadius: 999,
    borderWidth: 3, borderColor: BRAND.white, paddingHorizontal: 10, paddingVertical: 3 },
  walletText: { fontFamily: 'Shark', fontSize: 16, color: '#fff', textShadowColor: BRAND.navy, textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 0 },
  freeCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#e4f7ff', borderRadius: 18,
    borderWidth: 3, borderColor: '#ffd443', padding: 12 },
  freeTitle: { fontFamily: 'Shark', fontSize: 17, color: '#075b9b' },
  freeBody: { fontFamily: 'Knockout', fontSize: 15, color: '#17446c', lineHeight: 19 },
  featured: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 3, borderColor: '#ffcf3b', padding: 14, gap: 8, marginBottom: 12 },
  featuredHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  featuredTitle: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, flexShrink: 1 },
  badge: { backgroundColor: BRAND.greenLip, color: '#fff', fontFamily: 'Shark', fontSize: 12, paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  contents: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  contentChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef6ff', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4 },
  contentText: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navy },
  contentTextSmall: { fontSize: 14 },
  section: { gap: 8 },
  sectionTitle: { fontFamily: 'Shark', fontSize: 22, color: '#fff', textShadowColor: BRAND.navy,
    textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pack: { flexGrow: 1, flexBasis: '30%', minWidth: 100, backgroundColor: '#fff', borderRadius: 18, borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', paddingTop: 16, paddingBottom: 10, paddingHorizontal: 8, gap: 2 },
  packBest: { borderColor: '#ffcf3b' },
  packBadge: { position: 'absolute', top: -11, backgroundColor: BRAND.greenLip, color: '#fff', fontFamily: 'Shark', fontSize: 11,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, overflow: 'hidden' },
  packAmount: { fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, marginTop: 2 },
  packLabel: { fontFamily: 'Knockout', fontSize: 14, color: '#475569', marginBottom: 6, textAlign: 'center' },
  price: { alignSelf: 'stretch', backgroundColor: '#ffcf3b', borderRadius: 14, paddingVertical: 9, alignItems: 'center',
    borderBottomWidth: 4, borderBottomColor: '#d99a00' },
  priceDisabled: { opacity: 0.55 },
  pricePressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  priceText: { fontFamily: 'Shark', fontSize: 19, color: '#6a3b00' },
  blocked: { fontFamily: 'Knockout', fontSize: 14, color: '#64748b', textAlign: 'center', paddingVertical: 6 },
  realMoney: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: REAL_MONEY_TINT, borderRadius: 16,
    borderWidth: 3, borderColor: REAL_MONEY_GREEN, paddingHorizontal: 12, paddingVertical: 8 },
  realMoneyHead: { fontFamily: 'Shark', fontSize: 18, color: REAL_MONEY_INK },
  priceNote: { fontFamily: 'Knockout', fontSize: 12, color: '#6a3b00', opacity: 0.8, marginTop: -2 },
  sectionNote: { fontFamily: 'Knockout', fontSize: 15, color: '#fff', marginTop: -4 },
  realMoneyBody: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navy, lineHeight: 20 },
  rules: { backgroundColor: 'rgba(5,52,110,0.55)', borderRadius: 16, padding: 12, gap: 6, marginTop: 4 },
  ruleRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  rule: { flex: 1, fontFamily: 'Knockout', fontSize: 14, color: '#fff', lineHeight: 18 },
  notice: { backgroundColor: '#fff', borderRadius: 20, padding: 18, alignItems: 'center', gap: 8 },
  noticeTitle: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy },
  noticeBody: { fontFamily: 'Knockout', fontSize: 16, color: '#334155', textAlign: 'center' },
});
