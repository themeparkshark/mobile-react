/**
 * Supplies: the Shark Shop's real-money shelf (Apple StoreKit 2 consumables),
 * the free daily ticket and the VIP door, in Alex's shop card language
 * (references/alex/shop/Shop_ref.png): blue cards, thick white rims, colored
 * name bands, navy price bars, a bigger pile of Alex's art for a bigger pack.
 *
 * Fair by design, and the copy says so:
 * - Every price is Apple's localized price, exactly what the grown-up pays,
 *   always beside the green "$". Every pack shows exactly what it holds.
 * - Every value note is computed from the catalog and Apple's prices
 *   (services/money/offers.ts, tested): "+21% more" against the smallest
 *   pack, "worth $6.60" for a bundle at regular pack prices. Nothing invented.
 * - Only tickets, coins, energy and Rescue Passes are sold. Ride Parts, ride
 *   coins and coin levels are earned at the park, never sold.
 * - No countdown on anything you can buy; the deal says it changes each day.
 * - Every buy goes through buyPack(): a grown-up answers first (Apple Kids
 *   guideline 1.3 practice), and the gate restates the price and contents.
 *   Ask to Buy is explained, never retried behind a grown-up's back.
 *
 * The server grants, never this screen: a purchase is sent to the server,
 * which verifies Apple's signature and credits it once.
 *
 * Works on the 1.7.0 binary and later (StoreKit module). On 1.6.0 it asks
 * for an update; VIP players can still claim the free ticket there.
 */
import { openExternal } from '../../services/external';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AuthContext } from '../../context/AuthProvider';
import type { ShopGrants, ShopProduct } from '../../api/endpoints/me/shop';
import { getAdSummary, type AdSummary } from '../../api/endpoints/me/ad-rewards';
import getVipPerks, { type VipPerk } from '../../api/endpoints/economy/vip-perks';
import { onShopDelivered, storeAvailable } from '../../services/purchases';
import { adsAvailable, rewardText, watchForReward } from '../../services/ads';
import { baseRates, bonusPercent, bundleWorth, gearLine } from '../../services/money/offers';
import { buyPack, outcomeMessage, refreshSupplies, useSupplies } from '../../services/money/supplies';
import { trackImpression } from '../../services/money/track';
import { BRAND, FONT, GameButton, GameIcon, SharkLoader, gameAlert, type GameIconName } from '../../ui';
import { haptic } from '../../gamekit/Haptics';
import OneTimeTip from '../../components/help/OneTimeTip';
import RealMoneyMark, { REAL_MONEY_GREEN, REAL_MONEY_INK, REAL_MONEY_TINT } from '../../components/RealMoneyMark';
import { openMembership } from '../../components/GrownUpGate';
import { useHelp } from '../../components/help/HelpProvider';
import SharkPassBanner from '../../components/money/SharkPassBanner';
import BundleCard from '../../components/money/BundleCard';
import { VIP_WEEKLY_BOX_PERK, useMoneyFlag } from '../../services/money/flags';
import {
  Band, CARD, Contents, GotIt, MAX_FONT, PackArt, PriceBar, ShopCard, Sticker, packArtKey, unitWord, type PackArtKey,
} from '../../components/money/moneyUi';
import type { GlossaryKey } from '../../services/help/glossary';

export { grantsText, gateReasonFor } from '../../services/money/supplies';

const APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6758812566';

export type SuppliesFocus = 'tickets' | 'coins' | 'rescue' | 'featured';

const WALLET: { key: keyof ShopGrants; icon: GameIconName; term: GlossaryKey; many: string }[] = [
  { key: 'tickets', icon: 'ticket', term: 'tickets', many: 'tickets' },
  { key: 'coins', icon: 'coins', term: 'coins', many: 'coins' },
  { key: 'energy', icon: 'energy', term: 'energy', many: 'energy' },
  { key: 'rescue_passes', icon: 'retry', term: 'rescue_pass', many: 'Rescue Passes' },
];

/** What a section's coins or tickets are for, said once under its title. */
const SECTION_NOTE: Partial<Record<ShopProduct['section'], string>> = {
  tickets: 'One ticket plays one ride challenge.',
  coins: 'Coins buy gear for your shark in the Shark Shop.',
  rescue: 'One more try at a ride coin you don’t have yet.',
};

function unavailableText(product: ShopProduct, holdCap: number | null): string | null {
  switch (product.unavailable_reason) {
    case 'bought_today': return 'Got it today. Back tomorrow.';
    case 'pouch_full': return `You can hold ${holdCap ?? 30} tickets. Use some first.`;
    case 'unavailable': return 'Not here right now.';
    default: return null;
  }
}

export default function SuppliesShop({ focus }: { focus?: SuppliesFocus }) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { hasSeenTip, explain } = useHelp();
  const canBuy = storeAvailable();
  const vip = !!player?.is_subscribed;
  const { catalog, prices, status } = useSupplies(!!player);
  const boxesLive = useMoneyFlag('pin_mystery_boxes');
  const [ads, setAds] = useState<AdSummary | null>(null);
  const [perks, setPerks] = useState<VipPerk[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [landed, setLanded] = useState<{ grants: ShopGrants; art: PackArtKey } | null>(null);
  const scroll = useRef<ScrollView>(null);
  const scrolledTo = useRef(false);

  const reloadAds = useCallback(() => getAdSummary().then(setAds).catch(() => null), []);
  useEffect(() => {
    if (!player) return;
    void reloadAds();
    void refreshSupplies(true);
    if (!vip) void getVipPerks().then(setPerks);
  }, [player?.id, vip, reloadAds]);

  // Ask to Buy approvals and last run's unfinished purchases land here.
  useEffect(() => onShopDelivered(() => {
    void refreshPlayer().catch(() => undefined);
    void refreshSupplies(true);
  }), [refreshPlayer]);

  const onSection = (key: SuppliesFocus) => (event: LayoutChangeEvent) => {
    if (focus === key && !scrolledTo.current) {
      scrolledTo.current = true;
      const y = event.nativeEvent.layout.y;
      setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }), 250);
    }
  };

  useEffect(() => { if (catalog && Object.keys(prices).length) trackImpression('supplies'); }, [catalog, prices]);
  const rates = useMemo(() => baseRates(catalog?.products ?? [], prices), [catalog, prices]);
  const sections = useMemo(() => {
    const bySection = new Map<string, ShopProduct[]>();
    for (const p of catalog?.products ?? []) bySection.set(p.section, [...(bySection.get(p.section) ?? []), p]);
    return bySection;
  }, [catalog]);

  const buy = async (product: ShopProduct, art: PackArtKey) => {
    if (busy) return;
    haptic('tapLight');
    // The one gated way to buy (services/money/supplies.ts): a grown-up answers first, and the gate
    // says what they are saying yes to: the price and what's in the pack.
    const outcome = await buyPack(product, { onStart: () => setBusy(product.product_id), placement: 'supplies' });
    setBusy(null);
    if (outcome.status === 'success') {
      setLanded({ grants: outcome.result.results[0]?.granted ?? product.grants, art });
      await refreshPlayer().catch(() => undefined);
      return;
    }
    const message = outcomeMessage(outcome, null);
    if (message) gameAlert(message.title, message.body);
  };

  const claimDailyTicket = async () => {
    if (busy) return;
    setBusy('daily_ticket');
    const outcome = await watchForReward('daily_ticket', ads?.placements.daily_ticket.ref ?? null, vip);
    setBusy(null);
    if (outcome.status === 'granted') {
      haptic('success');
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
    await reloadAds();
  };

  if (!player) {
    return <Notice icon="lock" title="Sign in to shop" body="Sign in first. Then your Supplies stay with your shark on every phone." />;
  }
  if (!catalog) {
    return (
      <View style={st.center}>
        <SharkLoader tone="onBlue" state={status === 'error' ? 'error' : 'loading'} compact
          title={status === 'error' ? 'Supplies couldn’t open' : undefined} onRetry={() => void refreshSupplies(true)} />
      </View>
    );
  }

  const daily = ads?.placements.daily_ticket;
  const showDaily = !!ads?.enabled && !!daily && (vip || adsAvailable());
  const featured = sections.get('featured') ?? [];
  const starter = featured.find(p => p.limit === 'once');
  // Bigger featured bundles with no daily limit (the Park Trip Pack) get Alex's big card like the Starter Pack.
  const bigBundles = featured.filter(p => p !== starter && !p.limit);
  const todays = featured.filter(p => p !== starter && !bigBundles.includes(p));
  // A product Apple hasn't priced (not set up yet in this storefront) is never shown as a dead card.
  const priced = (p: ShopProduct) => !!prices[p.product_id] || Object.keys(prices).length === 0;
  const holdCap = catalog.ticket_hold_cap;

  return (
    <ScrollView ref={scroll} contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
      <View style={st.wallet}>
        {WALLET.map(w => (
          // Each balance explains itself, like the map's pills.
          <Pressable key={w.key} style={st.walletChip} accessibilityRole="button"
            accessibilityLabel={`${(catalog.wallet[w.key] ?? 0).toLocaleString('en-US')} ${w.many}`}
            accessibilityHint="Explains what this is"
            onPress={() => explain(w.term, { count: catalog.wallet[w.key] ?? 0 })}>
            <GameIcon name={w.icon} size={22} />
            {/* Rescue Passes have no picture of their own yet, so the chip says the word too. */}
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.walletText}>{(catalog.wallet[w.key] ?? 0).toLocaleString('en-US')}{w.key === 'rescue_passes' ? ((catalog.wallet[w.key] ?? 0) === 1 ? ' pass' : ' passes') : ''}</Text>
          </Pressable>
        ))}
      </View>

      <SharkPassBanner />

      {/* First visit: what Supplies is, once. Then, at the first ad offer, that ads are optional. */}
      <OneTimeTip id="supplies_tab" ready={status === 'ready' && !busy} compact />
      {showDaily && !vip && daily.remaining > 0 && hasSeenTip('supplies_tab') && (
        <OneTimeTip id="bonus_ads" ready={status === 'ready' && !busy} compact />
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
            <RealMoneyMark size={22} />
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.realMoneyText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              Supplies cost real money. A grown-up buys them.
            </Text>
          </View>

          <View onLayout={onSection('featured')} style={{ gap: 12 }}>
            {starter && starter.available && priced(starter) && (
              <BundleCard product={starter} price={prices[starter.product_id]?.price} worth={bundleWorth(starter, prices, rates)}
                busy={busy === starter.product_id} disabled={!!busy} onBuy={() => void buy(starter, 'chest')} />
            )}
            {bigBundles.filter(priced).map(p => (
              <BundleCard key={p.product_id} product={p} price={prices[p.product_id]?.price} worth={bundleWorth(p, prices, rates)}
                busy={busy === p.product_id} disabled={!!busy} onBuy={() => void buy(p, 'bag')}
                band={`${p.title.toUpperCase()} · FOR A PARK TRIP`} art="bag" />
            ))}
            {todays.length > 0 && (
              <View style={st.row}>
                {todays.filter(priced).map((p, i) => (
                  <DayCard key={p.product_id} product={p} index={i} price={prices[p.product_id]?.price}
                    worth={bundleWorth(p, prices, rates)} note={unavailableText(p, holdCap)}
                    busy={busy === p.product_id} disabled={!!busy} onBuy={() => void buy(p, packArtKey(p))} />
                ))}
              </View>
            )}
          </View>
        </>
      )}

      {!vip && <VipCard perks={perks && boxesLive ? [...perks, VIP_WEEKLY_BOX_PERK as VipPerk] : perks} />}

      {showDaily && (
        <Animated.View entering={FadeInUp.springify().damping(15)} style={st.freeCard}>
          <PackArt art="tickets-1" size={46} bob={false} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.freeTitle}>FREE DAILY TICKET</Text>
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.freeBody}>
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

      {canBuy && catalog.enabled && (['tickets', 'coins', 'rescue'] as const).map(key => {
        const packs = (sections.get(key) ?? []).filter(priced);
        if (!packs.length) return null;
        const title = catalog.sections.find(s => s.key === key)?.title ?? key;
        return (
          <View key={key} onLayout={onSection(key)} style={st.section}>
            <View style={st.sectionHead}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.sectionTitle} accessibilityRole="header">{title}</Text>
              <View style={st.sectionRule} />
            </View>
            {SECTION_NOTE[key] && <Text maxFontSizeMultiplier={MAX_FONT} style={st.sectionNote}>{SECTION_NOTE[key]}</Text>}
            {key === 'coins' && boxesLive && (
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.sectionNote}>Coins can open Mystery Pin Boxes. Odds are shown on each box.</Text>
            )}
            <View style={st.grid}>
              {packs.map((p, i) => (
                <PackCard key={p.product_id} product={p} tier={i} columns={key === 'coins' && packs.length === 4 ? 2 : packs.length === 1 ? 2 : 3}
                  price={prices[p.product_id]?.price} bonus={bonusPercent(p, prices, rates)}
                  note={unavailableText(p, holdCap)} busy={busy === p.product_id} disabled={!!busy}
                  onBuy={() => void buy(p, packArtKey(p, i))} />
              ))}
            </View>
          </View>
        );
      })}

      <View style={st.rules}>
        {catalog.rules.map(rule => (
          <View key={rule} style={st.ruleRow}>
            <GameIcon name="check" size={16} />
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.rule}>{rule}</Text>
          </View>
        ))}
      </View>

      <GotIt grants={landed?.grants ?? null} art={landed?.art ?? 'gift'} onDone={() => setLanded(null)} />
    </ScrollView>
  );
}

/** Daily Deal and Park Day Pack, side by side: today's picks. */
function DayCard({ product, index, price, worth, note, busy, disabled, onBuy }: {
  product: ShopProduct; index: number; price?: string; worth: ReturnType<typeof bundleWorth>; note: string | null;
  busy: boolean; disabled: boolean; onBuy: () => void;
}) {
  const deal = !!product.deal_key || product.product_id.endsWith('.deal.daily');
  return (
    <Animated.View entering={FadeInUp.delay(120 + index * 70).springify().damping(15)} style={{ flex: 1 }}>
      <ShopCard onPress={onBuy} disabled={disabled || !price || !!note} style={{ flex: 1 }} fill
        accessibilityLabel={`${product.title}. ${deal ? 'A new deal every day.' : 'One a day.'} ${price ?? ''}, real money.`}>
        <Band text={deal ? 'TODAY’S DEAL' : 'PARK DAY'} color={deal ? 'green' : 'blue'} size={15} />
        <View style={st.dayBody}>
          <PackArt art={packArtKey(product)} size={64} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.dayTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{product.title.toUpperCase()}</Text>
          <View style={{ flex: 1, justifyContent: 'center', alignSelf: 'stretch' }}><Contents grants={product.grants} size="tight" /></View>
          {worth ? (
            <View style={st.worthPill}><Text maxFontSizeMultiplier={MAX_FONT} style={st.worthPillText}>{`WORTH ${worth.worth}`}</Text></View>
          ) : (
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.dayNote}>{deal ? 'New deal every day' : 'One a day'}</Text>
          )}
        </View>
        <PriceBar price={price} busy={busy} note={note} />
        {worth?.times && <Sticker text={`${worth.times}X VALUE`} style={{ top: 34, right: 4 }} />}
      </ShopCard>
    </Animated.View>
  );
}

function PackCard({ product, tier, columns, price, bonus, note, busy, disabled, onBuy }: {
  product: ShopProduct; tier: number; columns: 1 | 2 | 3; price?: string; bonus: number | null; note: string | null;
  busy: boolean; disabled: boolean; onBuy: () => void;
}) {
  const main = (['tickets', 'coins', 'rescue_passes'] as const).find(k => (product.grants[k] ?? 0) > 0) ?? 'tickets';
  const n = product.grants[main] ?? 0;
  const best = product.badge === 'Best value';
  const wide = columns === 1;
  const gear = main === 'coins' ? gearLine(product.buys) : null;
  return (
    <View style={[columns === 3 ? st.col3 : columns === 2 ? st.col2 : st.col1]}>
      <ShopCard onPress={onBuy} disabled={disabled || !price || !!note} glow={best}
        accessibilityLabel={`${n.toLocaleString('en-US')} ${unitWord(main, n)}.${gear ? ` ${gear}.` : ''} ${price ?? ''}, real money, a grown-up buys it.${bonus ? ` ${bonus}% more than the smallest pack.` : ''}${best ? ' Best value.' : ''}`}>
        <View style={[st.packArtWell, wide && st.packArtWide]}>
          <PackArt art={packArtKey(product, tier)} size={wide ? 70 : columns === 2 ? 82 : 64} bob={false} />
        </View>
        <Band text={`${n.toLocaleString('en-US')} ${main === 'rescue_passes' ? (n === 1 ? 'RESCUE PASS' : 'RESCUE PASSES') : unitWord(main, n).toUpperCase()}`}
          color={best ? 'gold' : 'navy'} size={columns === 3 ? 14 : 16} />
        {gear && <Text maxFontSizeMultiplier={MAX_FONT} style={st.gearLine} numberOfLines={2}>{gear}</Text>}
        <PriceBar price={price} busy={busy} note={note} />
        {bonus && <Sticker text={`+${bonus}% MORE`} style={{ top: 6, right: 4 }} />}
      </ShopCard>
      {best && <View style={st.bestPill} pointerEvents="none"><Text maxFontSizeMultiplier={1.1} style={st.bestPillText}>BEST VALUE</Text></View>}
    </View>
  );
}

/** The VIP door on the shelf: what VIP gives, no price (the page after the grown-up gate has it). */
function VipCard({ perks }: { perks: VipPerk[] | null }) {
  const lines = (perks ?? []).filter(p => p.icon !== 'member').slice(0, 4);
  return (
    <Animated.View entering={FadeInUp.delay(180).springify().damping(15)} style={st.vipLip}>
      <View style={st.vip}>
        <View style={st.vipHead}>
          <GameIcon name="member" size={40} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.vipTitle}>GO VIP</Text>
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.vipSub}>Bigger rewards every day. No ads.</Text>
          </View>
        </View>
        <View style={st.vipTiles}>
          {lines.map(perk => (
            <View key={perk.title} style={st.vipTile}>
              <View style={st.vipTileIcon}><GameIcon name={perk.icon} size={28} /></View>
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.vipTileText} numberOfLines={2}>{perk.title}</Text>
            </View>
          ))}
        </View>
        <GameButton label="See VIP" icon="member" size="compact" onPress={() => { void openMembership(); }}
          accessibilityLabel="See everything VIP gives" style={{ alignSelf: 'center', marginTop: 4 }} />
      </View>
    </Animated.View>
  );
}

function Notice({ icon, title, body, action }: {
  icon: GameIconName; title: string; body: string; action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={st.notice}>
      <GameIcon name={icon} size={36} />
      <Text maxFontSizeMultiplier={MAX_FONT} style={st.noticeTitle}>{title}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT} style={st.noticeBody}>{body}</Text>
      {action && <GameButton label={action.label} onPress={action.onPress} />}
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  scroll: { padding: 14, paddingBottom: 48, gap: 14 },
  wallet: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
  walletChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BRAND.blue, borderRadius: 999,
    borderWidth: 3, borderColor: BRAND.white, paddingHorizontal: 10, paddingVertical: 3 },
  walletText: { fontFamily: FONT.display, fontSize: 16, color: '#fff', textShadowColor: BRAND.navy, textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 0 },
  realMoney: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,248,228,0.95)', borderRadius: 999,
    borderWidth: 2, borderColor: REAL_MONEY_GREEN, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'center' },
  realMoneyHead: { fontFamily: FONT.display, fontSize: 15, color: REAL_MONEY_INK },
  realMoneyText: { flexShrink: 1, fontFamily: FONT.display, fontSize: 14, color: REAL_MONEY_INK },
  row: { flexDirection: 'row', gap: 10 },
  starterBody: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 10, alignSelf: 'stretch' },
  starterArt: { width: 128, height: 118, alignItems: 'center', justifyContent: 'center' },
  worth: { fontFamily: FONT.display, fontSize: 19, color: '#ffffff', textShadowColor: CARD.lip, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  dayBody: { alignItems: 'center', gap: 5, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 8, flex: 1, alignSelf: 'stretch' },
  dayTitle: { fontFamily: FONT.display, fontSize: 17, color: '#ffffff', textShadowColor: CARD.lip, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  worthPill: { backgroundColor: '#ffcf3b', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 2, borderColor: '#ffffff' },
  worthPillText: { fontFamily: FONT.display, fontSize: 13, color: '#6a3b00' },
  dayNote: { fontFamily: FONT.body, fontSize: 13, color: '#e2f6ff', textAlign: 'center' },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontFamily: FONT.display, fontSize: 24, color: '#fff', textShadowColor: BRAND.navy,
    textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 0 },
  sectionRule: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)' },
  sectionNote: { fontFamily: FONT.body, fontSize: 15, color: '#e2f6ff', marginTop: -4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 16, paddingTop: 6 },
  col3: { width: '31.2%', flexGrow: 1, alignItems: 'stretch' },
  col2: { width: '48.5%', alignItems: 'stretch' },
  col1: { width: '100%' },
  gearLine: { fontFamily: FONT.display, fontSize: 13, color: CARD.lip, textAlign: 'center', paddingHorizontal: 6, marginTop: 2 },
  packArtWell: { height: 92, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
  packArtWide: { flexDirection: 'row', gap: 12, height: 86 },
  wideNote: { fontFamily: FONT.display, fontSize: 22, color: '#ffffff', textShadowColor: CARD.lip, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  bestPill: { position: 'absolute', top: -11, alignSelf: 'center', backgroundColor: '#ffcf3b', borderRadius: 10, borderWidth: 2,
    borderColor: '#ffffff', paddingHorizontal: 8, paddingVertical: 1 },
  bestPillText: { fontFamily: FONT.display, fontSize: 12, color: '#6a3b00' },
  bestAmount: { fontFamily: FONT.display, fontSize: 14, color: '#ffffff', paddingVertical: 2, alignSelf: 'stretch', textAlign: 'center',
    backgroundColor: CARD.band.navy },
  vipLip: { borderRadius: 22, backgroundColor: '#5a3a00', paddingBottom: 6 },
  vip: { borderRadius: 22, borderWidth: 4, borderColor: BRAND.gold, backgroundColor: '#123f80', padding: 12, gap: 6 },
  vipHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vipTitle: { fontFamily: FONT.display, fontSize: 26, color: BRAND.gold, textShadowColor: '#5a3a00', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  vipSub: { fontFamily: FONT.body, fontSize: 15, color: '#e2f6ff' },
  vipTiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vipTile: { width: '47.5%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0a4f96', borderRadius: 14,
    borderWidth: 2, borderColor: '#ffffff', borderBottomWidth: 4, borderBottomColor: BRAND.navy, padding: 6 },
  vipTileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 2, borderColor: BRAND.gold,
    alignItems: 'center', justifyContent: 'center' },
  vipTileText: { flex: 1, fontFamily: FONT.display, fontSize: 13, color: '#ffffff' },
  vipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  vipRowText: { flex: 1, fontFamily: FONT.display, fontSize: 15, color: '#ffffff' },
  freeCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#e4f7ff', borderRadius: 18,
    borderWidth: 3, borderColor: '#ffd443', padding: 10 },
  freeTitle: { fontFamily: FONT.display, fontSize: 17, color: '#075b9b' },
  freeBody: { fontFamily: FONT.body, fontSize: 15, color: '#17446c', lineHeight: 19 },
  rules: { backgroundColor: 'rgba(5,52,110,0.55)', borderRadius: 16, padding: 12, gap: 6, marginTop: 4 },
  ruleRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  rule: { flex: 1, fontFamily: FONT.body, fontSize: 14, color: '#fff', lineHeight: 18 },
  notice: { backgroundColor: '#fff', borderRadius: 20, padding: 18, alignItems: 'center', gap: 8 },
  noticeTitle: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navy },
  noticeBody: { fontFamily: FONT.body, fontSize: 16, color: '#334155', textAlign: 'center' },
});
