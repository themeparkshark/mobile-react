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
import * as Haptics from 'expo-haptics';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AuthContext } from '../../context/AuthProvider';
import { getShop, type ShopCatalog, type ShopGrants, type ShopProduct } from '../../api/endpoints/me/shop';
import { getAdSummary, type AdSummary } from '../../api/endpoints/me/ad-rewards';
import { buyShopProduct, loadShopPrices, onShopDelivered, storeAvailable, type ShopPrice } from '../../services/purchases';
import { adsAvailable, rewardText, watchForReward } from '../../services/ads';
import { BRAND, GameButton, GameIcon, SharkLoader, gameAlert, type GameIconName } from '../../ui';
import OneTimeTip from '../../components/help/OneTimeTip';
import { useHelp } from '../../components/help/HelpProvider';
import type { GlossaryKey } from '../../services/help/glossary';

const APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6758812566';

export type SuppliesFocus = 'tickets' | 'coins' | 'rescue' | 'featured';

const CURRENCY: Record<keyof ShopGrants, { icon: GameIconName; one: string; many: string }> = {
  tickets: { icon: 'ticket', one: 'Park Ticket', many: 'Park Tickets' },
  coins: { icon: 'coins', one: 'Shark Coin', many: 'Shark Coins' },
  energy: { icon: 'energy', one: 'Energy', many: 'Energy' },
  rescue_passes: { icon: 'gift', one: 'Rescue Pass', many: 'Rescue Passes' },
};
const ORDER: (keyof ShopGrants)[] = ['tickets', 'coins', 'energy', 'rescue_passes'];
const WALLET_TERM: Record<keyof ShopGrants, GlossaryKey> = {
  tickets: 'tickets', coins: 'coins', energy: 'energy', rescue_passes: 'rescue_pass',
};

/** "15 Park Tickets, 1,500 Shark Coins and 2 Rescue Passes". */
export function grantsText(grants: ShopGrants): string {
  const parts = ORDER.filter(k => (grants[k] ?? 0) > 0)
    .map(k => `${(grants[k] ?? 0).toLocaleString('en-US')} ${grants[k] === 1 ? CURRENCY[k].one : CURRENCY[k].many}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
}

/** "5h 12m" until the shop day rolls over. */
export function countdownText(endsAt: string, now = Date.now()): string {
  const ms = Math.max(0, new Date(endsAt).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
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
  const [attempt, setAttempt] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<SuppliesFocus, number>>>({});
  const scrolledTo = useRef(false);
  const now = useNow(30_000);

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
    if (busy || !catalog) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(product.product_id);
    const outcome = await buyShopProduct(product.product_id, { accountToken: catalog.account_token, shownDay: catalog.day });
    setBusy(null);
    if (outcome.status === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const granted = outcome.result.results[0]?.granted ?? product.grants;
      gameAlert('Supplies delivered!', `${grantsText(granted)} added to your shark.`);
      await refreshPlayer().catch(() => undefined);
      await reload().catch(() => undefined);
    } else if (outcome.status === 'pending') {
      gameAlert('Waiting for approval', 'This purchase needs a parent’s OK in Ask to Buy. It lands here as soon as it’s approved.');
    } else if (outcome.status === 'unverified') {
      gameAlert('Almost there', 'Your purchase went through. It lands as soon as we confirm it with Apple, at the latest the next time you open the app.');
    } else if (outcome.status === 'other_account') {
      gameAlert('Bought on another account', 'This purchase was made while signed in to a different Theme Park Shark account. Sign in to that account to get it.');
    } else if (outcome.status === 'unavailable') {
      gameAlert('Update to shop', 'Update Theme Park Shark in the App Store to buy Supplies.');
    } else if (outcome.status === 'failed') {
      gameAlert('Purchase didn’t go through', 'You weren’t charged. Please try again.');
    }
  };

  const claimDailyTicket = async () => {
    if (busy) return;
    setBusy('daily_ticket');
    const outcome = await watchForReward('daily_ticket', ads?.placements.daily_ticket.ref ?? null, vip);
    setBusy(null);
    if (outcome.status === 'granted') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      gameAlert('Free Ticket!', outcome.reward.reward.overflow_message ?? `${rewardText(outcome.reward.reward)} added.`);
      await refreshPlayer().catch(() => undefined);
    } else if (outcome.status === 'checking') {
      gameAlert('Almost there', 'Thanks for watching. Your Ticket lands in a moment.');
    } else if (outcome.status === 'no_fill') {
      gameAlert('No ad right now', 'There isn’t an ad to show right now. Try again in a little while.');
    } else if (outcome.status === 'capped' || outcome.status === 'claimed') {
      gameAlert('Done for today', 'Your free Ticket comes back tomorrow.');
    } else if (outcome.status === 'failed') {
      gameAlert('Couldn’t load', 'Check your connection and try again.');
    }
    await reload().catch(() => undefined);
  };

  const sections = useMemo(() => {
    const bySection = new Map<string, ShopProduct[]>();
    for (const p of catalog?.products ?? []) bySection.set(p.section, [...(bySection.get(p.section) ?? []), p]);
    return bySection;
  }, [catalog]);

  if (!player) {
    return <Notice icon="lock" title="Sign in to shop" body="Supplies follow your shark to every device, so they need a player account." />;
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
            <Text style={st.walletText}>{(catalog.wallet[k] ?? 0).toLocaleString('en-US')}</Text>
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
                ? vip ? 'VIP perk: claim it, no ad needed.' : 'Watch one short ad for +1 Park Ticket. Totally optional.'
                : `Claimed. Back in ${countdownText(ads.day_ends_at, now)}.`}
            </Text>
          </View>
          {daily.remaining > 0 && (
            <GameButton label={vip ? 'Claim' : 'Watch'} size="compact" fullWidth={false} icon={vip ? 'member' : 'play'}
              loading={busy === 'daily_ticket'} disabled={!!busy} onPress={() => void claimDailyTicket()}
              // A fixed width: an unsized art button grows to its cap and squeezes the copy to one word a line.
              style={{ width: 118 }}
              accessibilityLabel={vip ? 'Claim your free daily Ticket' : 'Watch an ad for a free Park Ticket'} />
          )}
        </Animated.View>
      )}

      {!canBuy ? (
        <Notice icon="info" title="Update to shop" body="Update Theme Park Shark to buy Supplies."
          action={{ label: 'Update the app', onPress: () => void Linking.openURL(APP_STORE_URL) }} />
      ) : !catalog.enabled ? (
        <Notice icon="timer" title="Back soon" body="Supplies are closed for a moment. Check back later." />
      ) : (
        <>
          <View onLayout={onSection('featured')}>
            {(sections.get('featured') ?? []).map((p, i) => (
              <FeaturedCard key={p.product_id} product={p} price={prices[p.product_id]} index={i}
                endsIn={p.limit === 'daily' ? countdownText(catalog.day_ends_at, now) : null}
                busy={busy === p.product_id} disabled={!!busy} onBuy={() => void buy(p)} />
            ))}
          </View>
          {(['tickets', 'coins', 'rescue'] as const).map(key => (sections.get(key)?.length ?? 0) > 0 && (
            <View key={key} onLayout={onSection(key)} style={st.section}>
              <Text style={st.sectionTitle}>{catalog.sections.find(s => s.key === key)?.title ?? key}</Text>
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
    case 'pouch_full': return `Your Ticket pouch holds ${holdCap ?? 30}. Use a few first.`;
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
      accessibilityRole="button" accessibilityLabel={price ? `Buy ${product.title} for ${price.price}` : `${product.title} is loading`}>
      <Text style={st.priceText}>{busy ? 'ONE MOMENT' : price ? price.price : 'LOADING'}</Text>
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

function FeaturedCard({ product, price, index, endsIn, busy, disabled, onBuy }: {
  product: ShopProduct; price?: ShopPrice; index: number; endsIn: string | null; busy: boolean; disabled: boolean; onBuy: () => void;
}) {
  const deal = product.deal_key != null;
  return (
    <Animated.View entering={FadeInUp.delay(80 + index * 80).springify().damping(15)} style={[st.featured, deal && st.featuredDeal]}>
      <View style={st.featuredHead}>
        <Text style={st.featuredTitle}>{product.title.toUpperCase()}</Text>
        {product.badge && <Text style={[st.badge, deal && st.badgeDeal]}>{product.badge.toUpperCase()}</Text>}
      </View>
      {deal && <Text style={st.dealLine}>{`Daily Deal · new deal in ${endsIn}`}</Text>}
      {!deal && product.limit === 'daily' && <Text style={st.dealLine}>One per day</Text>}
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
  featuredDeal: { borderColor: '#ff8a3d', backgroundColor: '#fff8ec' },
  featuredHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  featuredTitle: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, flexShrink: 1 },
  badge: { backgroundColor: BRAND.greenLip, color: '#fff', fontFamily: 'Shark', fontSize: 12, paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  badgeDeal: { backgroundColor: '#ff6b2c' },
  dealLine: { fontFamily: 'Knockout', fontSize: 15, color: '#9a4b00' },
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
  rules: { backgroundColor: 'rgba(5,52,110,0.55)', borderRadius: 16, padding: 12, gap: 6, marginTop: 4 },
  ruleRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  rule: { flex: 1, fontFamily: 'Knockout', fontSize: 14, color: '#fff', lineHeight: 18 },
  notice: { backgroundColor: '#fff', borderRadius: 20, padding: 18, alignItems: 'center', gap: 8 },
  noticeTitle: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy },
  noticeBody: { fontFamily: 'Knockout', fontSize: 16, color: '#334155', textAlign: 'center' },
});
