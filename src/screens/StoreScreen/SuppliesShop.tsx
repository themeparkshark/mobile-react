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
 *   pack; a bundle's worth at regular pack prices ("$6.60") only inside the
 *   grown-up gate, never on a card a kid sees. Nothing invented.
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
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AuthContext } from '../../context/AuthProvider';
import type { ShopGrants, ShopProduct } from '../../api/endpoints/me/shop';
import { getAdSummary, type AdSummary } from '../../api/endpoints/me/ad-rewards';
import getVipPerks, { type VipPerk } from '../../api/endpoints/economy/vip-perks';
import { onShopDelivered, replayShopPurchases, storeAvailable, type ShopReplayOutcome } from '../../services/purchases';
import { adsAvailable, rewardText, watchForReward } from '../../services/ads';
import { baseRates, bestValueHolds, bonusPercent, dropDays, gearLine, vipCardTiles, VIP_PITCH } from '../../services/money/offers';
import { handoffFreeWay, handoffHead, isDeal as isDealProduct, isParkDay as isParkDayProduct, planSupplies, type HeroKind, type SuppliesNeed } from '../../services/money/suppliesPlan';
import getStores from '../../api/endpoints/stores/stores';
import getStoreRotation from '../../api/endpoints/stores/rotation';
import { buyPack, outcomeMessage, refreshSupplies, useSupplies } from '../../services/money/supplies';
import { trackImpression } from '../../services/money/track';
import { BRAND, FONT, GameButton, GameIcon, SharkLoader, gameAlert, type GameIconName } from '../../ui';
import { haptic } from '../../gamekit/Haptics';
import OneTimeTip from '../../components/help/OneTimeTip';
import RealMoneyMark, { REAL_MONEY_GREEN, REAL_MONEY_INK, REAL_MONEY_TINT } from '../../components/RealMoneyMark';
import { openMembership } from '../../components/GrownUpGate';
import { BOTTOM_BAR_OVERHANG } from '../../components/Wrapper';
import { useHelp } from '../../components/help/HelpProvider';
import * as RootNavigation from '../../RootNavigation';
import { getSharkPass } from '../../api/endpoints/me/shark-pass';
import BundleCard from '../../components/money/BundleCard';
import WishHeart from '../../components/money/WishHeart';
import { VIP_WEEKLY_BOX_PERK, useMoneyFlag } from '../../services/money/flags';
import {
  Band, CARD, Contents, CurrencyPicture, GotIt, MAX_FONT, PackArt, PriceBar, ShopCard, Sticker, packArtKey, unitWord, type PackArtKey,
} from '../../components/money/moneyUi';
import type { GlossaryKey } from '../../services/help/glossary';
import countText from '../../helpers/countText';
import { tryAgainLine } from '../../services/connectionCopy';

export { grantsText, gateReasonFor } from '../../services/money/supplies';

const APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6758812566';
/** Alex's churro treat (the same picture the out-of-Tickets card uses for "3 treats at home"). */
const TREAT_ART = require('../../../assets/images/prep-items/churros/churro_18.png');

/** What "Check again" says for each replay outcome. Exported for tests. */
export function replayMessage(outcome: ShopReplayOutcome): { title: string; body: string } {
  switch (outcome.status) {
    case 'delivered': return { title: 'Found it!', body: outcome.count === 1 ? 'One buy was still on its way. It\u2019s in your Supplies now.' : `${outcome.count} buys were still on their way. They\u2019re in your Supplies now.` };
    case 'nothing': return { title: 'Nothing missing', body: 'Everything bought with this Apple ID is already in your Supplies.' };
    case 'other_account': return { title: 'Bought on another account', body: 'This was bought on a different Theme Park Shark account. Sign in to that account to get it.' };
    case 'unavailable': return { title: 'Update the game', body: 'Update Theme Park Shark in the App Store to check your buys.' };
    default: return { title: 'That didn\u2019t work', body: tryAgainLine() };
  }
}

import type { SuppliesFocus } from './storeParams';
export type { SuppliesFocus } from './storeParams';

// Fix w3 T229: the shop's wallet shows the two things you spend here, Tickets and Shark Coins. Energy lives
// on the shelf and extra tries show on PLAY! when you hold one, so the row no longer lists four balances.
const WALLET: { key: keyof ShopGrants; icon: GameIconName; term: GlossaryKey; many: string }[] = [
  { key: 'tickets', icon: 'ticket', term: 'tickets', many: 'tickets' },
  { key: 'coins', icon: 'coins', term: 'coins', many: 'Shark Coins' },
];

/**
 * The wallet the header shows: the signed-in player's live balances (refreshed after every
 * reward), never the catalog's copy from the last shop load. Exported for tests.
 */
export function freshWallet(player: { tickets?: number | null; coins?: number | null; energy?: number | null; rescue_passes?: number | null } | null,
  catalogWallet: Partial<ShopGrants> | null | undefined): Record<keyof ShopGrants, number> {
  const pick = (live: number | null | undefined, cached: number | undefined) =>
    typeof live === 'number' && Number.isFinite(live) ? live : cached ?? 0;
  return {
    tickets: pick(player?.tickets, catalogWallet?.tickets),
    coins: pick(player?.coins, catalogWallet?.coins),
    energy: pick(player?.energy, catalogWallet?.energy),
    rescue_passes: pick(player?.rescue_passes, catalogWallet?.rescue_passes),
  };
}

/**
 * Free ways to get Tickets, said before any pack (core loop 4.1 and 5.10): treats at home, stamps,
 * today's free try, and the line Ticket only while Queue Tickets is on. Exported for tests.
 */
export function freeTicketWays(queueTicketsOn: boolean): { icon: GameIconName; text: string }[] {
  return [
    { icon: 'search', text: 'Every 3 treats on your home map = 1 Ticket' },
    { icon: 'star', text: 'Stamps in your Stamp Book give free Tickets' },
    { icon: 'gift', text: 'Today\u2019s free try plays one ride coin' },
    ...(queueTicketsOn ? [{ icon: 'ride' as GameIconName, text: '10 minutes in a ride line earns a Ticket' }] : []),
  ];
}

/** What a section's coins or tickets are for, said once under its title. */
const SECTION_NOTE: Partial<Record<ShopProduct['section'], string>> = {
  tickets: 'One Ticket plays one ride coin game.',
  coins: 'Shark Coins buy gear for your shark in the Shark Shop.',
  rescue: 'An extra try at a ride coin you don’t have yet.',
};

/**
 * The money word in a server line: "2x XP and coins" reads "2x XP and Shark Coins", while
 * "ride coins" stays (4.5: one word per thing). Exported for tests.
 */
export function sharkCoinsWord(line: string): string {
  return line.replace(/(^|[^A-Za-z])(ride |Shark )?coins\b/gi, (match, pre: string, word: string | undefined) =>
    word ? match : `${pre}Shark Coins`);
}

/**
 * A server VIP perk line in the app's words (4.5): treats at home (never finds), Shark Coins for the
 * money, and Ticket and Energy with capitals, so Supplies and the VIP page read the same.
 * Exported for tests and for MembershipScreen.
 */
export function vipPerkWords(line: string): string {
  return sharkCoinsWord(line.replace(/\bfinds\b/g, 'treats').replace(/\bfind\b/g, 'treat'))
    .replace(/\btickets\b/g, 'Tickets').replace(/\bticket\b/g, 'Ticket').replace(/\benergy\b/g, 'Energy');
}

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
  // Purchase doors never wait for a rung (core loop 4.4): listed whenever the player's switch is on.
  const passOn = useMoneyFlag('shark_pass');
  const giftPlansOn = useMoneyFlag('vip_gift_plans');
  const queueTicketsOn = useMoneyFlag('queue_tickets');
  const [ads, setAds] = useState<AdSummary | null>(null);
  const [perks, setPerks] = useState<VipPerk[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [landed, setLanded] = useState<{ grants: ShopGrants; art: PackArtKey } | null>(null);
  // Supplies always opens at its top (T155): a door's focus picks the hand-off card, never a scroll.
  const scroll = useRef<ScrollView>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  // Read-only: the Shark Shop's next new-gear days, from its own rotation (nothing to buy here).
  const [drops, setDrops] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void getStores().then(list => list.find(x => x.name === 'Shark Shop')?.id).then(id => (id ? getStoreRotation(id) : null))
      .then(r => { if (live && r) setDrops(dropDays(r.next_rotation_at, r.interval_days)); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
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

  useEffect(() => { if (catalog && Object.keys(prices).length) trackImpression('supplies'); }, [catalog, prices]);
  const rates = useMemo(() => baseRates(catalog?.products ?? [], prices), [catalog, prices]);

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
      gameAlert('That didn’t work', `${tryAgainLine()}`);
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
  // A product Apple hasn't priced (not set up yet in this storefront) is never shown as a dead card.
  const priced = (p: ShopProduct) => !!prices[p.product_id] || Object.keys(prices).length === 0;
  const holdCap = catalog.ticket_hold_cap;
  const wallet = freshWallet(player, catalog.wallet);
  // What shows first and what waits under More (services/money/suppliesPlan.ts, tested).
  const plan = planSupplies({ products: catalog.products, prices, focus, wallet, priced });
  const sectionTitle = (key: 'tickets' | 'coins' | 'rescue') => key === 'rescue' ? 'Extra tries' : key === 'coins' ? 'Shark Coins'
    : catalog.sections.find(s => s.key === key)?.title ?? 'Tickets';
  const allPriced = catalog.products.filter(priced);
  // A pack's picture follows its place in its whole section (25 Tickets keeps the big bundle under More).
  const tierOf = (p: ShopProduct) => Math.max(0, allPriced.filter(x => x.section === p.section).indexOf(p));
  const packCard = (p: ShopProduct, _i: number, columns: 1 | 2 | 3, flag?: string | null) => (
    <PackCard key={p.product_id} product={p} tier={tierOf(p)} columns={columns} flag={flag}
      best={p.badge === 'Best value' && bestValueHolds(p, allPriced, prices)}
      price={prices[p.product_id]?.price} bonus={bonusPercent(p, prices, rates)}
      note={unavailableText(p, holdCap)} busy={busy === p.product_id} disabled={!!busy}
      onBuy={() => void buy(p, packArtKey(p, tierOf(p)))} />
  );
  const moreCount = plan.more.bundles.length + plan.more.deals.length + plan.more.packs.reduce((n, s) => n + s.packs.length, 0);
  const sellable = canBuy && catalog.enabled;

  return (
    <ScrollView ref={scroll} contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
      <View style={st.wallet}>
        {WALLET.map(w => (
          // Each balance explains itself, like the map's pills.
          <Pressable key={w.key} style={st.walletChip} accessibilityRole="button"
            accessibilityLabel={`${wallet[w.key].toLocaleString('en-US')} ${w.many}`}
            accessibilityHint="Explains what this is"
            onPress={() => explain(w.term, { count: wallet[w.key] })}>
            {/* Extra tries wear their own life-ring picture (T218), so every chip is picture plus number. */}
            <CurrencyPicture kind={w.key} size={22} />
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.walletText}>{countText(wallet[w.key])}</Text>
          </Pressable>
        ))}
      </View>

      {/* Free Ticket ways come before any price: one line, the rest a tap away (T155). */}
      {/* The out-of-Tickets hand-off card says the free way itself: one free line on screen, and its price above the fold on SE. */}
      {!(sellable && plan.handoff?.need === 'tickets') && <FreeTicketsLine ways={freeTicketWays(queueTicketsOn)} />}

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

          {/* Came for one thing (out of Tickets at a ride): say so first, with its smallest pack and the free way (T154). */}
          {plan.handoff && (
            <HandoffCard need={plan.handoff.need} out={plan.handoff.out} pack={plan.handoff.pack}
              price={plan.handoff.pack ? prices[plan.handoff.pack.product_id]?.price : undefined}
              note={plan.handoff.pack ? unavailableText(plan.handoff.pack, holdCap) : null}
              busy={!!plan.handoff.pack && busy === plan.handoff.pack.product_id} disabled={!!busy}
              onBuy={() => { if (plan.handoff?.pack) void buy(plan.handoff.pack, packArtKey(plan.handoff.pack)); }} />
          )}

          {/* One hero pack, right under the pill: the Starter Pack, or after it "Your next pack" (T155, T168). */}
          {plan.hero && (
            <BundleCard product={plan.hero.product} price={prices[plan.hero.product.product_id]?.price}
              busy={busy === plan.hero.product.product_id} disabled={!!busy}
              onBuy={() => { if (plan.hero) void buy(plan.hero.product, plan.hero.kind === 'starter' ? 'chest' : 'bag'); }}
              {...heroLook(plan.hero.kind, plan.hero.product)} />
          )}

          {/* One Ticket row (T221): today's Ticket deal, when there is one, beside the Ticket packs. */}
          {plan.ticketRow.length > 0 && (
            <View style={st.section}>
              <View style={st.sectionHead}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={st.sectionTitle} accessibilityRole="header">{sectionTitle('tickets')}</Text>
                <View style={st.sectionRule} />
              </View>
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.sectionNote}>{SECTION_NOTE.tickets}</Text>
              <View style={st.grid}>
                {plan.ticketRow.map((p, i) => packCard(p, i, plan.ticketRow.length === 1 ? 2 : 3,
                  isDealProduct(p) ? (plan.bestTicketDeal === p.product_id ? 'BEST TICKET DEAL TODAY' : 'TODAY’S PICK') : null))}
              </View>
            </View>
          )}
        </>
      )}

      {!vip && <VipCard perks={perks && boxesLive ? [...perks, VIP_WEEKLY_BOX_PERK as VipPerk] : perks} />}
      {/* Members: the VIP page, with the gift plans when their switch is on. */}
      {vip && giftPlansOn && <VipGiftDoor />}

      {/* Everything else waits under More: a first look holds a handful of prices, not thirteen (T221). */}
      <MoreFold open={moreOpen} onToggle={() => setMoreOpen(o => !o)} count={moreCount}>
        {/* The Shark Pass door (Pass and Pass Plus), whenever its switch is on for this player. */}
        <SharkPassDoor switchOn={passOn} playerId={player?.id ?? null} />
        {sellable && plan.more.bundles.map(p => (
          <BundleCard key={p.product_id} product={p} price={prices[p.product_id]?.price}
            busy={busy === p.product_id} disabled={!!busy || !!unavailableText(p, holdCap)} onBuy={() => void buy(p, 'bag')}
            {...heroLook(isParkDayProduct(p) ? 'parkday' : 'trip', p)} />
        ))}
        {sellable && plan.more.deals.length > 0 && (
          <View style={st.row}>
            {plan.more.deals.map((p, i) => (
              <DayCard key={p.product_id} product={p} index={i} price={prices[p.product_id]?.price}
                note={unavailableText(p, holdCap)} busy={busy === p.product_id} disabled={!!busy} onBuy={() => void buy(p, packArtKey(p))} />
            ))}
          </View>
        )}
        {showDaily && (
          <View style={st.freeCard}>
            <PackArt art="tickets-1" size={46} bob={false} />
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.freeTitle}>FREE DAILY TICKET</Text>
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.freeBody}>
                {daily.remaining > 0
                  ? vip ? 'Free for VIP members. Tap Claim.' : 'Watch one short ad for 1 free ticket. You don’t have to.'
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
          </View>
        )}
        {sellable && plan.more.packs.map(({ key, packs }) => (
          <View key={key} style={st.section}>
            <View style={st.sectionHead}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.sectionTitle} accessibilityRole="header">{sectionTitle(key)}</Text>
              <View style={st.sectionRule} />
            </View>
            {SECTION_NOTE[key] && <Text maxFontSizeMultiplier={MAX_FONT} style={st.sectionNote}>{SECTION_NOTE[key]}</Text>}
            <View style={st.grid}>
              {packs.map((p, i) => packCard(p, i, key === 'coins' && packs.length === 4 ? 2 : packs.length === 1 ? 2 : 3))}
            </View>
          </View>
        ))}
        {drops.length > 0 && (
          <View style={st.drops} accessible accessibilityLabel={`New gear in the Shark Shop: ${drops.join(', ')}.`}>
            <GameIcon name="shark" size={30} />
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.dropsHead}>NEW GEAR IN THE SHARK SHOP</Text>
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.dropsText}>{drops.join('\n')}</Text>
            </View>
          </View>
        )}
      </MoreFold>

      <View style={st.rules}>
        {catalog.rules.map(rule => (
          <View key={rule} style={st.ruleRow}>
            <GameIcon name="check" size={16} />
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.rule}>{rule}</Text>
          </View>
        ))}
        {/* A buy that never showed up: the same replay the app runs at launch, on demand (T169). */}
        {canBuy && <MissingPurchaseRow />}
      </View>

      <GotIt grants={landed?.grants ?? null} art={landed?.art ?? 'gift'} onDone={() => setLanded(null)} />
    </ScrollView>
  );
}

/** The hero card's band and art: Starter Pack (just once), Your next pack (after it), today's Park Day Pack. */
function heroLook(kind: HeroKind | 'trip', product: ShopProduct): { band: string; art: PackArtKey } {
  if (kind === 'starter') return { band: 'STARTER PACK · JUST ONCE', art: 'chest' };
  if (kind === 'next') return { band: `YOUR NEXT PACK · ${product.title.toUpperCase()}`, art: 'bag' };
  // Plain pack names (T228): no "one a day" limit words on a band a kid reads.
  return { band: product.title.toUpperCase(), art: 'bag' };
}

/**
 * "FREE TICKETS: 3 treats at home = 1 Ticket. See all": the free ways on one line, opened in place.
 * Exported for the dev preview.
 */
export function FreeTicketsLine({ ways }: { ways: { icon: GameIconName; text: string }[] }) {
  const [open, setOpen] = useState(false);
  const first = ways[0];
  return (
    <View style={st.freeWays} accessible={!open}
      accessibilityLabel={`Free ways to get Tickets: ${ways.map(w => w.text).join('. ')}.`}>
      <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Free Tickets. Hide the list.' : 'Free Tickets. See all the free ways.'}
        hitSlop={6} style={st.freeWayRow}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={st.freeWaysHead}>FREE TICKETS</Text>
        {!open && first && <Image source={TREAT_ART} style={{ width: 24, height: 24 }} contentFit="contain" />}
        {!open && first && <Text maxFontSizeMultiplier={MAX_FONT} style={st.freeWayText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>3 treats at home = 1 Ticket</Text>}
        {open && <View style={{ flex: 1 }} />}
        <Text maxFontSizeMultiplier={MAX_FONT} style={st.seeAll}>{open ? 'Hide' : 'See all'}</Text>
      </Pressable>
      {open && (
        <Animated.View entering={FadeInUp.springify().damping(16)} style={{ gap: 6 }}>
          {ways.map(way => (
            <View key={way.text} style={st.freeWayRow}>
              <GameIcon name={way.icon} size={22} />
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.freeWayText}>{way.text}</Text>
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

/**
 * The hand-off card (T154): what the kid ran out of, said to the grown-up holding the phone, with the
 * smallest pack of it (the price on the card; the grown-up gate on the tap) and the free way beside it.
 */
function HandoffCard({ need, out, pack, price, note, busy, disabled, onBuy }: {
  need: SuppliesNeed; out: boolean; pack: ShopProduct | null; price?: string; note: string | null;
  busy: boolean; disabled: boolean; onBuy: () => void;
}) {
  const kind = need === 'tickets' ? 'tickets' : need === 'coins' ? 'coins' : 'rescue_passes';
  const n = pack?.grants[kind] ?? 0;
  return (
    <Animated.View entering={FadeInUp.springify().damping(15)}>
      <ShopCard onPress={pack && price && !note ? onBuy : undefined} disabled={disabled || !pack || !price || !!note} glow
        accessibilityLabel={`${handoffHead(need, out)}. ${pack ? `${countText(n)} ${unitWord(kind, n)}, ${price ?? ''}, real money, a grown-up buys it.` : ''} ${handoffFreeWay(need)}.`}>
        <Band text={handoffHead(need, out).toUpperCase()} color="gold" size={16} />
        <View style={st.handoffBody}>
          {pack && (
            <View style={st.handoffPack}>
              <PackArt art={packArtKey(pack)} size={58} bob={false} />
              <Text maxFontSizeMultiplier={MAX_FONT} style={st.handoffCount}>{`${countText(n)} ${unitWord(kind, n).toUpperCase()}`}</Text>
            </View>
          )}
          <View style={st.handoffFree}>
            <Image source={TREAT_ART} style={{ width: 34, height: 34 }} contentFit="contain" />
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.handoffFreeText}>{handoffFreeWay(need)}</Text>
          </View>
        </View>
        {pack && <PriceBar price={price} busy={busy} note={note} />}
      </ShopCard>
    </Animated.View>
  );
}

/** The More fold: one navy door that opens the rest of Supplies in place. */
function MoreFold({ open, onToggle, count, children }: { open: boolean; onToggle: () => void; count: number; children: ReactNode }) {
  return (
    <>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Show less' : `More Supplies${count ? `, ${count} more packs` : ''}`}
        style={({ pressed }) => [st.door, pressed && { transform: [{ translateY: 2 }] }]}>
        <PackArt art="gift" size={34} bob={false} />
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.doorTitle}>{open ? 'SHOW LESS' : 'MORE SUPPLIES'}</Text>
          {!open && <Text maxFontSizeMultiplier={MAX_FONT} style={st.doorBody}>Park packs, Shark Coins, extra tries and the Shark Pass</Text>}
        </View>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}><GameIcon name="arrow" size={22} /></View>
      </Pressable>
      {open && <Animated.View entering={FadeInUp.springify().damping(16)} style={{ gap: 14 }}>{children}</Animated.View>}
    </>
  );
}

/** "Missing a purchase? Check again": re-runs the unfinished-purchase replay and says what happened (T169). */
function MissingPurchaseRow() {
  const { refreshPlayer } = useContext(AuthContext);
  const [checking, setChecking] = useState(false);
  const check = async () => {
    if (checking) return;
    setChecking(true);
    const outcome = await replayShopPurchases().catch(() => ({ status: 'failed' as const }));
    setChecking(false);
    if (outcome.status === 'delivered') {
      haptic('success');
      await refreshPlayer().catch(() => undefined);
      void refreshSupplies(true);
    }
    const message = replayMessage(outcome);
    gameAlert(message.title, message.body);
  };
  return (
    <Pressable onPress={() => void check()} disabled={checking} accessibilityRole="button"
      accessibilityLabel="Bought something that did not show up? Check again." style={({ pressed }) => [st.ruleRow, st.missing, pressed && { opacity: 0.7 }]}>
      <GameIcon name="retry" size={16} />
      <Text maxFontSizeMultiplier={MAX_FONT} style={[st.rule, st.missingText]}>
        {checking ? 'Checking with the App Store…' : 'Bought something that did not show up? Check again'}
      </Text>
    </Pressable>
  );
}

/** Daily Deal and Park Day Pack, side by side: today's picks. */
function DayCard({ product, index, price, note, busy, disabled, onBuy }: {
  product: ShopProduct; index: number; price?: string; note: string | null;
  busy: boolean; disabled: boolean; onBuy: () => void;
}) {
  const deal = !!product.deal_key || product.product_id.endsWith('.deal.daily');
  return (
    <Animated.View entering={FadeInUp.delay(120 + index * 70).springify().damping(15)} style={{ flex: 1 }}>
      <ShopCard onPress={onBuy} disabled={disabled || !price || !!note} style={{ flex: 1 }} fill
        accessibilityLabel={`${product.title}. ${deal ? 'Today\u2019s pick.' : 'For one park day.'} ${price ?? ''}, real money.`}>
        <Band text={deal ? 'TODAY’S PICK' : 'PARK DAY'} color={deal ? 'green' : 'blue'} size={15} />
        <View style={st.dayBody}>
          <PackArt art={packArtKey(product)} size={64} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.dayTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{product.title.toUpperCase()}</Text>
          <View style={{ flex: 1, justifyContent: 'center', alignSelf: 'stretch' }}><Contents grants={product.grants} size="tight" /></View>
          {/* No WORTH pill (psychology r8): one BEST VALUE per shelf is the only value badge. */}
          {/* Fix w3 T228: no deal wording on a kid's shelf; the band already says TODAY'S PICK. */}
          <Text maxFontSizeMultiplier={MAX_FONT} style={st.dayNote}>{deal ? 'Changes each day' : 'For one park day'}</Text>
        </View>
        <PriceBar price={price} busy={busy} note={note} />
      </ShopCard>
    </Animated.View>
  );
}

function PackCard({ product, tier, columns, price, bonus, note, busy, disabled, onBuy, best = false, flag = null }: {
  product: ShopProduct; tier: number; columns: 1 | 2 | 3; price?: string; bonus: number | null; note: string | null;
  /** Today's deal in the Ticket row: "TODAY'S PICK", or "BEST TICKET DEAL TODAY" only on days it is true (T170). */
  flag?: string | null;
  /** The server's badge, kept only when it is true for the whole page (bestValueHolds). */
  best?: boolean;
  busy: boolean; disabled: boolean; onBuy: () => void;
}) {
  const main = (['tickets', 'coins', 'rescue_passes'] as const).find(k => (product.grants[k] ?? 0) > 0) ?? 'tickets';
  const n = product.grants[main] ?? 0;
  const wide = columns === 1;
  // Real-money coin packs are priced in gear only (T153): never in Mystery Pin Boxes, so real money never
  // points at a random box.
  const gear = main === 'coins' ? gearLine(product.buys, bonus) : null;
  // No % stickers at all (psychology r6): coin packs say it in the gear line, tickets in the label below.
  const sticker = null as string | null;
  return (
    <View style={[columns === 3 ? st.col3 : columns === 2 ? st.col2 : st.col1]}>
      <ShopCard onPress={onBuy} disabled={disabled || !price || !!note} glow={best}
        accessibilityLabel={`${n.toLocaleString('en-US')} ${unitWord(main, n)}.${gear ? ` ${gear}.` : ''} ${price ?? ''}, real money, a grown-up buys it.${bonus ? ` ${bonus}% more than the smallest pack.` : ''}${best ? ' Best value.' : ''}`}>
        <View style={[st.packArtWell, wide && st.packArtWide]}>
          <PackArt art={packArtKey(product, tier)} size={wide ? 70 : columns === 2 ? 82 : 64} bob={false} />
        </View>
        <Band text={`${countText(n)} ${main === 'rescue_passes' ? (n === 1 ? 'EXTRA TRY' : 'EXTRA TRIES') : unitWord(main, n).toUpperCase()}`}
          color={best ? 'gold' : 'navy'} size={columns === 3 ? 14 : 16} />
        {gear && <Text maxFontSizeMultiplier={MAX_FONT} style={st.gearLine} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.85}>{gear}</Text>}
        <PriceBar price={price} busy={busy} note={note} />
        <WishHeart id={product.product_id} name={`${countText(n)} ${unitWord(main, n)}`} />
        {sticker && <Sticker text={sticker} style={{ top: 6, right: 4 }} />}
      </ShopCard>
      {(best || flag) && <View style={[st.bestPill, flag ? st.flagPill : null]} pointerEvents="none"><Text maxFontSizeMultiplier={1.1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[st.bestPillText, flag ? st.flagPillText : null]}>{flag ?? 'BEST VALUE'}</Text></View>}
    </View>
  );
}

/** The player's own pass read once per player for 5 minutes, so opening Supplies again never refetches it. */
const PASS_SEASON_TTL = 5 * 60_000;
let passSeasonCache: { playerId: number; season: boolean; at: number } | null = null;

/**
 * The Shark Pass door: the pass page lists the Shark Pass and Shark Pass Plus (grown-up gated there).
 * Shown when the switch says on, or when the player's own pass reads enabled with a season, so a
 * switch read before sign-in can never hide the App Review path.
 */
function SharkPassDoor({ switchOn, playerId }: { readonly switchOn: boolean; readonly playerId: number | null }) {
  const known = playerId != null && passSeasonCache?.playerId === playerId && Date.now() - passSeasonCache.at < PASS_SEASON_TTL
    ? passSeasonCache.season : null;
  const [season, setSeason] = useState<boolean | null>(known);
  useEffect(() => {
    if (playerId == null || known !== null) return undefined;
    let live = true;
    void getSharkPass().then(state => {
      const value = !!state?.enabled && !!state.season;
      passSeasonCache = { playerId, season: value, at: Date.now() };
      if (live) setSeason(value);
    }).catch(() => { if (live) setSeason(null); });
    return () => { live = false; };
  }, [playerId, known]);
  if (season === false || (!switchOn && season !== true)) return null;
  return (
    <Pressable onPress={() => RootNavigation.navigate('SharkPass')} accessibilityRole="button"
      accessibilityLabel="Shark Pass and Shark Pass Plus. Opens the pass."
      style={({ pressed }) => [st.door, pressed && { transform: [{ translateY: 2 }] }]}>
      <GameIcon name="star" size={34} />
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={st.doorTitle}>SHARK PASS</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={st.doorBody}>The Shark Pass and Shark Pass Plus</Text>
      </View>
      <GameIcon name="arrow" size={24} />
    </Pressable>
  );
}

/** For VIP members: the VIP page, where the gift plans are. */
function VipGiftDoor() {
  return (
    <Pressable onPress={() => { void openMembership(); }} accessibilityRole="button"
      accessibilityLabel="Your VIP, and VIP for this account that never renews. Opens VIP."
      style={({ pressed }) => [st.door, pressed && { transform: [{ translateY: 2 }] }]}>
      <GameIcon name="member" size={34} />
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={st.doorTitle}>VIP, NO RENEWING</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={st.doorBody}>VIP for this account, no renewing</Text>
      </View>
      <GameIcon name="arrow" size={24} />
    </Pressable>
  );
}

/** The VIP door on the shelf: what VIP gives, no price (the page after the grown-up gate has it). */
function VipCard({ perks }: { perks: VipPerk[] | null }) {
  // T156: the VIP page's concrete perks first ("Every ride coin win pays double"), then the server's other lines in
  // the app's words (4.5: an older server's lines say "finds"; the kid reads "treats").
  const lines = vipCardTiles(perks ?? []).map(t => ({ icon: t.icon as GameIconName, title: vipPerkWords(t.text) }));
  return (
    <Animated.View entering={FadeInUp.delay(180).springify().damping(15)} style={st.vipLip}>
      <View style={st.vip}>
        <View style={st.vipHead}>
          <GameIcon name="member" size={40} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.vipTitle}>GO VIP</Text>
            <Text maxFontSizeMultiplier={MAX_FONT} style={st.vipSub}>{VIP_PITCH}</Text>
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
  drops: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: BRAND.navy, borderWidth: 3, borderColor: BRAND.gold },
  dropsHead: { fontFamily: FONT.display, fontSize: 16, color: '#ffd34d' },
  dropsText: { fontFamily: FONT.display, fontSize: 15, color: '#ffffff', lineHeight: 22 },
  center: { flex: 1, justifyContent: 'center' },
  // The last card clears the footer's raised Map compass (T160).
  scroll: { padding: 14, paddingBottom: BOTTOM_BAR_OVERHANG + 24, gap: 14 },
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
  freeWays: { backgroundColor: '#e4f7ff', borderRadius: 18, borderWidth: 3, borderColor: '#ffffff', padding: 10, gap: 6 },
  freeWaysHead: { fontFamily: FONT.display, fontSize: 17, color: '#075b9b' },
  freeWayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  freeWayText: { flex: 1, fontFamily: FONT.body, fontSize: 15, color: '#17446c' },
  seeAll: { fontFamily: FONT.display, fontSize: 15, color: '#0b62b8' },
  flagPill: { backgroundColor: '#2fb44a', maxWidth: '96%' },
  flagPillText: { color: '#ffffff' },
  handoffBody: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'stretch' },
  handoffPack: { alignItems: 'center', gap: 2, width: 96 },
  handoffCount: { fontFamily: FONT.display, fontSize: 16, color: '#ffffff', textShadowColor: CARD.lip, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  handoffFree: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(5,52,110,0.45)', borderRadius: 14,
    paddingHorizontal: 8, paddingVertical: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  handoffFreeText: { flex: 1, fontFamily: FONT.display, fontSize: 15, color: '#ffffff' },
  missing: { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)' },
  missingText: { fontFamily: FONT.display, color: '#ffd34d' },
  door: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#123f80', borderRadius: 18, borderWidth: 3,
    borderColor: BRAND.gold, padding: 12 },
  doorTitle: { fontFamily: FONT.display, fontSize: 20, color: BRAND.gold },
  doorBody: { fontFamily: FONT.body, fontSize: 15, color: '#e2f6ff' },
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
