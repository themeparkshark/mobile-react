/**
 * VIP membership paywall. Only benefits the game actually delivers, the real
 * App Store plans, prices and trial (StoreKit 2), a Restore button (Apple
 * requires one), and the full auto-renew terms. A purchase or restore is sent
 * to the server, which verifies Apple's signature and switches VIP on before we
 * celebrate. A binary without the StoreKit module asks for an app update.
 */
import { clearGrownUpPass, grownUpForNextStep, type GateReason } from '../components/GrownUpGate';
import RealMoneyMark, { REAL_MONEY_GREEN, REAL_MONEY_INK, REAL_MONEY_TINT } from '../components/RealMoneyMark';
import { useFocusEffect } from '@react-navigation/native';
import { openExternal, openLegal } from '../services/external';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown, FadeInUp,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';
import getVipPerks, { type VipPerk } from '../api/endpoints/economy/vip-perks';
import {
  buyVip, legalText, loadVipPlans, priceText, restoreVip, savingsText, storeAvailable, trialEndsAt, type VipPlan,
} from '../services/purchases';
import { BRAND, GameButton, GameIcon, SharkLoader, gameAlert, type GameIconName } from '../ui';
import { perMonthText } from '../services/money/offers';
import MemberStage from '../components/money/MemberStage';
import MonthlyGiftCard from '../components/money/MonthlyGiftCard';
import { askGrownUp } from '../components/GrownUpGate';
import { VIP_GIFT_PRODUCT_IDS, buyVipGift, loadVipGiftPrices } from '../services/purchases';
import { trackImpression, trackMoney } from '../services/money/track';
import { VIP_WEEKLY_BOX_PERK, useMoneyFlag } from '../services/money/flags';
import { scheduleTrialReminder } from '../services/money/trialReminder';
import { getVipGift } from '../api/endpoints/me/vip-gift';
import GrownUpsInfo from '../components/money/GrownUpsInfo';

// Every line here is backed by live server logic: ride wins pay VIP double
// (CompleteTaskAction), VIP home maps spawn two extra finds and double their
// rewards (PrepItemSpawner, PrepItemController). VIP gear is left
// out until member items are live in the Shark Shop.
// This list is the offline fallback; the live list comes from GET /api/economy
// (vip_perks, built from the server's economy.vip flags), so flipping a VIP
// multiplier on the server changes this copy too.
export const VIP_BENEFITS: { icon: GameIconName; title: string; body: string }[] = [
  { icon: 'xp', title: '2x XP and coins', body: 'Every time you win a ride coin at the park.' },
  { icon: 'search', title: '2 extra finds on every home hunt', body: '2x energy, tickets and XP from every find.' },
  { icon: 'member', title: 'VIP badge on your profile', body: 'Everyone can see you’re VIP.' },
];

const APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6758812566';

const TRIAL_DAYS: Record<string, number> = { day: 1, week: 7, month: 30 };
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Thursday, October 15": the day the free trial ends. From StoreKit's intro period when known, else its words. */
export function trialEndText(trial: string | null, now: Date = new Date(), length?: VipPlan['trialLength']): string | null {
  const exact = length ? trialEndsAt({ trialLength: length }, now) : null;
  if (exact) return `${WEEKDAY[exact.getDay()]}, ${MONTH[exact.getMonth()]} ${exact.getDate()}`;
  const m = trial?.toLowerCase().match(/^(\w+) (day|week|month)s? free$/);
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const n = m ? words.indexOf(m[1]) : -1;
  if (!m || n <= 0) return null;
  const end = new Date(now.getTime() + n * TRIAL_DAYS[m[2]] * 86_400_000);
  return `${WEEKDAY[end.getDay()]}, ${MONTH[end.getMonth()]} ${end.getDate()}`;
}

/** "Free for 1 week. Then $4.99 a month." The deal, said once, right above the button. */
export function dealLine(plan: Pick<VipPlan, 'price' | 'period' | 'trial' | 'trialLength'>): string {
  const billing = priceText(plan);
  const until = trialEndText(plan.trial, new Date(), plan.trialLength);
  return plan.trial
    ? `${capitalize(plan.trial)}${until ? `, until ${until}` : ''}.\nThen ${billing}.`
    : `${billing}.`;
}
/** The buy button: the free part first when there is one. */
export function ctaLabel(trial: string | null): string {
  return trial ? `TRY ${trial.replace(/\s*free$/i, '').toUpperCase()} FREE` : 'BECOME VIP';
}

/** "a month", or "every 3 months". */
function perPeriod(period: string): string {
  return /\s/.test(period) ? `every ${period}` : `a ${period}`;
}
function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** What the grown-up gate restates before the App Store sheet. */
export function vipGateReason(plan: Pick<VipPlan, 'price' | 'period' | 'trial'>): GateReason {
  return { kind: 'renews', what: 'VIP', price: plan.price, period: plan.period, trial: plan.trial };
}

export default function MembershipScreen({ route }: { route: { params?: { intro?: boolean } } }) {
  const { intro } = route.params ?? {};
  const { labels, urls } = useCrumbs();
  const { player, refreshPlayer } = useContext(AuthContext);
  const [plans, setPlans] = useState<VipPlan[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<null | 'buy' | 'restore'>(null);
  const [perks, setPerks] = useState<VipPerk[]>(VIP_BENEFITS);
  const canBuy = storeAvailable();
  const member = player?.is_subscribed === true;
  // Pins: VIP gets a free Mystery Pin Box every week, listed only while boxes are live.
  const boxesLive = useMoneyFlag('pin_mystery_boxes');
  useEffect(() => {
    let live = true;
    getVipPerks().then(next => { if (live && next) setPerks(next); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!player || !canBuy || member) { setLoading(false); return; }
    let live = true;
    setLoading(true); setLoadFailed(false);
    loadVipPlans().then((next) => {
      if (!live) return;
      setPlans(next);
      setSelectedId(current => (current && next.some(p => p.productId === current) ? current : next[0]?.productId ?? null));
    }).catch((e) => {
      if (__DEV__) console.log('[vip] load failed', e?.code, e?.message ?? String(e));
      if (live) { setPlans([]); setLoadFailed(true); }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [player?.id, attempt, canBuy, member]);

  const plan = plans.find(p => p.productId === selectedId) ?? plans[0] ?? null;
  useEffect(() => { if (plans.length && !member) trackImpression('vip'); }, [plans.length, member]);

  const celebrate = async () => {
    await refreshPlayer().catch(() => undefined);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    gameAlert('Welcome to VIP!', labels.payment_complete ?? 'Your VIP boosts are on.');
    RootNavigation.navigate('Profile');
  };

  const ownedElsewhere = () => gameAlert('VIP is on another account',
    'This Apple ID’s VIP belongs to a different Theme Park Shark account. Sign in to that account to use it.');

  // Leaving the paywall (blur or unmount) drops the pass from its entry: only this visit's Buy may use it.
  useFocusEffect(useCallback(() => () => clearGrownUpPass(), []));
  // A ref, so a second tap while the gate is up can never start a second purchase.
  const buying = useRef(false);
  const buy = async () => {
    if (!plan || busy || buying.current) return;
    buying.current = true;
    try {
      // The paywall itself is gated: the pass from the door that opened it covers this one Buy
      // (once, within 2 minutes); otherwise a grown-up answers here. Nothing is bought without one.
      if (!(await grownUpForNextStep('vip', Date.now(), vipGateReason(plan)))) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setBusy('buy');
      trackMoney('gate_passed', 'vip', plan.productId);
      trackMoney('sheet', 'vip', plan.productId);
      const outcome = await buyVip(plan);
      trackMoney(outcome === 'success' ? 'bought' : outcome === 'pending' ? 'pending' : outcome === 'cancelled' ? 'cancelled' : 'failed', 'vip', plan.productId);
      setBusy(null);
      await reportBuy(outcome);
    } finally {
      buying.current = false;
    }
  };

  const reportBuy = async (outcome: Awaited<ReturnType<typeof buyVip>>) => {
    if (outcome === 'success') {
      // A free trial: one quiet reminder to the grown-up the day before it turns into a paid plan.
      // The real end of the trial period from the server (Apple's signed expiry), else from the intro period.
      if (plan.trial) {
        const billing = priceText(plan);
        void getVipGift().then((g) => {
          const real = g?.plan?.subscription_expires_at ? new Date(g.plan.subscription_expires_at) : null;
          const end = real && !Number.isNaN(real.getTime()) ? real : trialEndsAt(plan);
          if (end) void scheduleTrialReminder(end, billing);
        });
      }
      await celebrate();
    }
    else if (outcome === 'pending') gameAlert('Waiting for a grown-up', 'A grown-up needs to say yes on their phone. VIP turns on after that.');
    else if (outcome === 'unverified') gameAlert('Almost there', 'It worked! VIP turns on in a minute. If not, it turns on next time you open the game.');
    else if (outcome === 'owned_elsewhere') ownedElsewhere();
    else if (outcome === 'failed') gameAlert('That didn’t work', `You weren’t charged. Check your internet, then tap ${ctaLabel(plan?.trial ?? null)} again.`);
  };

  const restore = async () => {
    if (busy) return;
    setBusy('restore');
    const outcome = await restoreVip();
    setBusy(null);
    if (outcome === 'restored') await celebrate();
    else if (outcome === 'nothing') gameAlert('Nothing to bring back', 'We couldn’t find VIP on this Apple ID. Ask a grown-up to sign in with the Apple ID that bought it.');
    else if (outcome === 'owned_elsewhere') ownedElsewhere();
    else if (outcome === 'unavailable') gameAlert('Update the game', 'Update Theme Park Shark in the App Store to bring back VIP.');
    else gameAlert('That didn’t work', 'Check your internet and try again.');
  };

  const close = () => (intro ? RootNavigation.navigate('Explore') : RootNavigation.goBack());
  const trial = plan?.trial ?? null;
  const savings = savingsText(plans);

  return (
    <View style={s.root}>
      <Image source={require('../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient pointerEvents="none" colors={['rgba(9,90,170,0.82)', 'rgba(7,72,150,0.9)', 'rgba(5,52,110,0.95)']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        {/* The X sits in its own row, so nothing ever scrolls under it. */}
        <View style={s.closeRow}>
          <Pressable style={s.close} onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
            <GameIcon name="close" size={40} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <MemberStage />
          <Animated.Text entering={FadeInDown.delay(150)} style={s.title}>{member ? 'YOU’RE VIP' : 'GO VIP'}</Animated.Text>
          <Animated.Text entering={FadeInDown.delay(220)} style={s.sub}>
            {member ? 'Here’s everything you get.' : 'Bigger rewards at home and at the park.'}
          </Animated.Text>

          <View style={s.benefits}>
            {(boxesLive ? [...perks, VIP_WEEKLY_BOX_PERK as VipPerk] : perks).map((b, i, all) => (
              <Animated.View key={b.title} entering={FadeInUp.delay(280 + i * 70).springify().damping(15)}
                style={[s.benefit, all.length % 2 === 1 && i === all.length - 1 && s.benefitWide]}>
                <View style={s.benefitIcon}><GameIcon name={b.icon} size={36} /></View>
                <Text maxFontSizeMultiplier={1.25} style={s.benefitTitle}>{b.title}</Text>
                <Text maxFontSizeMultiplier={1.25} style={s.benefitBody}>{b.body}</Text>
              </Animated.View>
            ))}
          </View>

          {member ? (
            <>
              <MonthlyGiftCard />
              <Animated.View entering={FadeInUp.delay(560)} style={s.memberNote}>
                <GameIcon name="member" size={30} />
                <Text style={s.memberNoteText}>Your VIP is on. A grown-up can change it anytime in Apple ID settings.</Text>
              </Animated.View>
            </>
          ) : !player ? (
            // Guests see the perks and a way in, never a dead purchase button.
            <Animated.View entering={FadeInUp.delay(620)} style={s.guest}>
              <Text style={s.guestText}>Sign in first. Then VIP stays with your shark on every phone.</Text>
              <GameButton label="Sign in to join VIP" onPress={() => RootNavigation.navigate('Login')} />
            </Animated.View>
          ) : !canBuy ? (
            // A 1.6.0 binary running this JS has no StoreKit module.
            <Animated.View entering={FadeInUp.delay(620)} style={s.guest}>
              <Text style={s.guestText}>Update Theme Park Shark to join VIP.</Text>
              <GameButton label="Update the app" onPress={() => void openExternal(APP_STORE_URL, 'system')} />
            </Animated.View>
          ) : loading ? (
            <SharkLoader compact tone="onBlue" style={{ marginTop: 20 }} />
          ) : !plan ? (
            <SharkLoader compact tone="onBlue" state="error" style={{ marginTop: 20 }}
              title={loadFailed ? 'VIP couldn’t load' : 'VIP isn’t here right now'}
              message="Check your internet and try again." onRetry={() => setAttempt(a => a + 1)} />
          ) : (
            <Animated.View entering={FadeInUp.delay(620)} style={{ width: '100%' }}>
              <View style={s.plans}>
                {plans.map((p) => {
                  const selected = p.productId === plan.productId;
                  return (
                    <Pressable key={p.productId} onPress={() => setSelectedId(p.productId)} disabled={!!busy}
                      style={[s.planCard, selected && s.planCardSelected]}
                      accessibilityRole="radio" accessibilityState={{ selected }}
                      accessibilityLabel={`${p.period === 'year' ? 'Yearly' : 'Monthly'}, ${priceText(p)}`}>
                      {p.period === 'year' && savings && <Text style={s.planBadge}>{savings}</Text>}
                      <View style={[s.radio, selected && s.radioOn]}>{selected && <View style={s.radioDot} />}</View>
                      <Text style={[s.planName, selected && s.planNameSelected]}>{p.period === 'year' ? 'YEARLY' : 'MONTHLY'}</Text>
                      <Text style={[s.planPrice, selected && s.planNameSelected]}>{priceText(p)}</Text>
                      {perMonthText(p) && <Text style={s.planPer}>{`Just ${perMonthText(p)}`}</Text>}
                      {p.trial && <Text style={s.planTrial}>{p.trial}</Text>}
                    </Pressable>
                  );
                })}
              </View>
              {/* Before the button: the whole deal in plain words. Real money, what it costs, when, and how to stop. */}
              <View style={s.deal} accessible accessibilityLabel={`${dealLine(plan)} It keeps going until a grown-up turns it off in Apple\u00A0ID settings.`}>
                <RealMoneyMark size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={s.dealHead}>REAL MONEY</Text>
                  <Text style={s.dealBody}>{dealLine(plan)}</Text>
                  <Text style={s.dealBody}>{'It keeps going until a grown-up turns it off in Apple\u00A0ID settings.'}</Text>
                </View>
              </View>
              <Pressable style={({ pressed }) => [s.cta, pressed && s.ctaPressed]} onPress={() => void buy()}
                disabled={!!busy} accessibilityRole="button">
                <Text style={s.ctaText}>{busy === 'buy' ? 'ONE MOMENT…' : ctaLabel(trial)}</Text>
                {/* The billed price sits inside the button, as loud as the free part (App Store 3.1.2). */}
                {busy !== 'buy' && <Text style={s.ctaSub}>{`${trial ? 'Then ' : ''}${priceText(plan)}`}</Text>}
              </Pressable>
            </Animated.View>
          )}

          {!member && player && canBuy && plan && <GiftPlans />}
          {!member && player && canBuy && plan && <GrownUpNotes />}

          <View style={s.links}>
            <Pressable onPress={() => void restore()} disabled={!!busy} hitSlop={8}>
              <Text style={s.link}>{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text>
            </Pressable>
            <Text style={s.dot}>·</Text>
            <Pressable onPress={() => openLegal(urls?.terms)} hitSlop={8}>
              <Text style={s.link}>Terms</Text>
            </Pressable>
            <Text style={s.dot}>·</Text>
            <Pressable onPress={() => openLegal(urls?.privacy_policy)} hitSlop={8}>
              <Text style={s.link}>Privacy</Text>
            </Pressable>
          </View>
          {plan && <Text style={s.legal}>{legalText(plan)}</Text>}
          {intro && (
            <Pressable onPress={close} hitSlop={8}><Text style={s.skip}>{labels?.skip_for_now ?? 'Skip for now'}</Text></Pressable>
          )}
        </ScrollView>
      </SafeAreaView>

      {busy && (
        <View style={s.overlay}>
          <SharkLoader compact tone="onBlue" />
          <Text style={s.overlayText}>{busy === 'buy' ? (labels?.processing_payment ?? 'Turning on VIP…') : 'Checking your Apple ID…'}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * VIP as a gift (Dustin, Oct 9 2026): 1 month or 12 months that never renew, for a birthday or a
 * park trip. Shown only while the server sells them and Apple has priced them. Gated on the buy tap.
 */
function GiftPlans() {
  const { refreshPlayer } = useContext(AuthContext);
  const on = useMoneyFlag('vip_gift_plans');
  const [prices, setPrices] = useState<Record<string, { price: string; amount: number }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (on) void loadVipGiftPrices().then(setPrices).catch(() => undefined); }, [on]);
  const options = VIP_GIFT_PRODUCT_IDS.filter(id => prices[id]);
  if (!on || !options.length) return null;
  const buy = async (id: string) => {
    if (busy) return;
    const months = id.endsWith('.12m') ? 12 : 1;
    trackMoney('tap', 'vip.gift', id);
    if (!(await askGrownUp({ kind: 'money', price: prices[id].price, gets: `${months === 12 ? '12 months' : '1 month'} of VIP. It doesn’t renew` }))) return;
    trackMoney('gate_passed', 'vip.gift', id);
    trackMoney('sheet', 'vip.gift', id);
    setBusy(id);
    const outcome = await buyVipGift(id);
    setBusy(null);
    trackMoney(outcome.status === 'success' ? 'bought' : outcome.status === 'pending' ? 'pending' : outcome.status === 'cancelled' ? 'cancelled' : 'failed', 'vip.gift', id);
    if (outcome.status === 'success') {
      await refreshPlayer().catch(() => undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      gameAlert('Welcome to VIP!', outcome.state.gift_last_day ? `VIP is on until ${outcome.state.gift_last_day}. It won’t renew.` : 'VIP is on. It won’t renew.');
    } else if (outcome.status === 'pending') gameAlert('Waiting for a grown-up', 'A grown-up needs to say yes on their phone. VIP turns on after that.');
    else if (outcome.status === 'unverified') gameAlert('Almost there', 'It worked! VIP turns on in a minute.');
    else if (outcome.status === 'other_account') gameAlert('On another account', 'This VIP gift belongs to a different Theme Park Shark account.');
    else if (outcome.status === 'failed') gameAlert('That didn’t work', 'You weren’t charged. Check your internet, then try again.');
  };
  return (
    <Animated.View entering={FadeInUp.delay(660)} style={s.giftBox}>
      <Text style={s.grownUpsHead}>GIVE VIP AS A GIFT</Text>
      <Text style={s.grownUpText}>Pay once for a set time. It never renews. Great for a birthday or a park trip.</Text>
      <View style={s.giftRow}>
        {options.map(id => (
          <Pressable key={id} onPress={() => void buy(id)} disabled={!!busy} style={({ pressed }) => [s.giftBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button" accessibilityLabel={`VIP for ${id.endsWith('.12m') ? '12 months' : '1 month'}, ${prices[id].price}, one time, real money. A grown-up buys it.`}>
            <Text style={s.giftName}>{id.endsWith('.12m') ? '12 MONTHS' : '1 MONTH'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <RealMoneyMark size={20} />
              <Text style={s.giftPrice}>{busy === id ? 'ONE MOMENT' : prices[id].price}</Text>
            </View>
            <Text style={s.giftNote}>One time</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

/**
 * For the grown-up holding the phone: what VIP is in plain words, and the
 * promises the game keeps. Every line is true of the shipped game.
 */
const GROWN_UP_NOTES: { icon: GameIconName; text: string }[] = [
  { icon: 'play', text: 'No ads. VIP gets every bonus without watching one.' },
  { icon: 'lock', text: 'Every real-money buy asks a grown-up first. Ask to Buy works too.' },
  { icon: 'check', text: 'Everything you earn or buy stays in your closet for good.' },
  { icon: 'settings', text: 'Turn VIP off anytime in Apple\u00A0ID settings.' },
];

function GrownUpNotes() {
  // "Show a grown-up": the kid hands the phone over and the whole grown-up page opens right here.
  const [all, setAll] = useState(false);
  return (
    <Animated.View entering={FadeInUp.delay(700)} style={s.grownUps}>
      <Text style={s.grownUpsHead}>FOR GROWN-UPS</Text>
      {all ? <GrownUpsInfo /> : GROWN_UP_NOTES.map(note => (
        <View key={note.text} style={s.grownUpRow} accessible accessibilityLabel={note.text}>
          <GameIcon name={note.icon} size={20} />
          <Text style={s.grownUpText}>{note.text}</Text>
        </View>
      ))}
      {!all && (
        <GameButton label="Show a grown-up" size="compact" icon="member" onPress={() => setAll(true)}
          accessibilityLabel="Show a grown-up everything about paying in the game" style={{ alignSelf: 'center', marginTop: 6 }} />
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0768b9' },
  tint: { backgroundColor: 'rgba(7, 104, 185, 0.35)' },
  closeRow: { height: 44, alignItems: 'flex-end', paddingRight: 14 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  title: { fontFamily: 'Shark', fontSize: 46, color: '#ffcf3b', textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  sub: { fontFamily: 'Knockout', fontSize: 18, color: '#fff', textAlign: 'center', marginTop: 2 },
  benefits: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  benefit: { width: '47.8%', flexGrow: 1, alignItems: 'center', backgroundColor: '#0a4f96', borderRadius: 18,
    borderWidth: 3, borderColor: '#ffffff', paddingHorizontal: 8, paddingTop: 10, paddingBottom: 10, gap: 3,
    borderBottomWidth: 6, borderBottomColor: '#05346e' },
  benefitWide: { width: '100%' },
  benefitIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#ffcf3b' },
  benefitTitle: { fontFamily: 'Shark', fontSize: 16, color: '#fff', textAlign: 'center' },
  benefitBody: { fontFamily: 'Knockout', fontSize: 13, color: '#dbeafe', textAlign: 'center', lineHeight: 16 },
  radio: { position: 'absolute', top: 10, left: 10, width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: '#9db7d6', backgroundColor: '#fff' },
  radioOn: { borderColor: '#d99a00' },
  radioDot: { position: 'absolute', top: 2, left: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: '#d99a00' },
  planPer: { fontFamily: 'Knockout', fontSize: 14, color: '#3d5f8c', marginTop: 1 },
  memberNote: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, backgroundColor: 'rgba(5,40,90,0.55)',
    borderRadius: 16, padding: 12, borderWidth: 2, borderColor: '#ffcf3b' },
  memberNoteText: { flex: 1, fontFamily: 'Knockout', fontSize: 16, color: '#fff', lineHeight: 20 },
  giftBox: { width: '100%', marginTop: 16, backgroundColor: 'rgba(5,40,90,0.55)', borderRadius: 18, padding: 12, gap: 8, borderWidth: 2, borderColor: '#ffcf3b' },
  giftRow: { flexDirection: 'row', gap: 10 },
  giftBtn: { flex: 1, alignItems: 'center', gap: 2, backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 10, borderWidth: 3, borderColor: '#ffcf3b', borderBottomWidth: 6, borderBottomColor: '#d99a00' },
  giftName: { fontFamily: 'Shark', fontSize: 16, color: '#09268f' },
  giftPrice: { fontFamily: 'Shark', fontSize: 20, color: '#09268f' },
  giftNote: { fontFamily: 'Knockout', fontSize: 13, color: '#3d5f8c' },
  grownUps: { width: '100%', marginTop: 16, backgroundColor: 'rgba(5,40,90,0.55)', borderRadius: 18, padding: 12, gap: 6,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  grownUpsHead: { fontFamily: 'Shark', fontSize: 16, color: '#ffffff', letterSpacing: 0.6 },
  grownUpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grownUpText: { flex: 1, fontFamily: 'Knockout', fontSize: 15, color: '#e2f6ff', lineHeight: 19 },
  guest: { width: '100%', marginTop: 18, alignItems: 'center', gap: 12 },
  guestText: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.white, textAlign: 'center' },
  plans: { flexDirection: 'row', gap: 10, marginTop: 18 },
  planCard: { flex: 1, backgroundColor: '#fff', borderRadius: 20, paddingTop: 16, paddingBottom: 12, paddingHorizontal: 8,
    alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)' },
  planCardSelected: { backgroundColor: '#fffbea', borderColor: '#ffcf3b', borderWidth: 4, transform: [{ scale: 1.03 }] },
  planBadge: { position: 'absolute', top: -13, backgroundColor: '#e8322a', borderWidth: 2, borderColor: '#fff', color: '#fff', fontFamily: 'Shark', fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  planName: { fontFamily: 'Shark', fontSize: 16, color: '#09268f' },
  planNameSelected: { color: '#09268f' },
  planPrice: { fontFamily: 'Shark', fontSize: 18, color: '#09268f', marginTop: 2 },
  planTrial: { fontFamily: 'Knockout', fontSize: 13, color: BRAND.greenLip, marginTop: 2 },
  deal: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: REAL_MONEY_TINT, borderRadius: 16,
    borderWidth: 3, borderColor: REAL_MONEY_GREEN, paddingHorizontal: 12, paddingVertical: 8 },
  dealHead: { fontFamily: 'Shark', fontSize: 18, color: REAL_MONEY_INK },
  // The billed price as loud as the free part (App Store 3.1.2).
  ctaSub: { fontFamily: 'Shark', fontSize: 24, color: '#6a3b00', marginTop: 2 },
  dealBody: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy, lineHeight: 19 },
  cta: { marginTop: 12, backgroundColor: '#ffcf3b', borderRadius: 20, paddingVertical: 17, alignItems: 'center',
    borderBottomWidth: 5, borderBottomColor: '#d99a00' },
  ctaPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 2 },
  ctaText: { fontFamily: 'Shark', fontSize: 24, color: '#6a3b00' },
  links: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  link: { fontFamily: 'Knockout', fontSize: 15, color: '#fff', textDecorationLine: 'underline' },
  dot: { color: 'rgba(255,255,255,0.6)' },
  legal: { fontFamily: 'Knockout', fontSize: 13, color: 'rgba(255,255,255,0.92)', textAlign: 'center', marginTop: 12, lineHeight: 18,
    backgroundColor: 'rgba(5,52,110,0.6)', borderRadius: 12, padding: 10, overflow: 'hidden' },
  skip: { fontFamily: 'Knockout', fontSize: 16, color: '#fff', marginTop: 14 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,52,110,0.82)', alignItems: 'center', justifyContent: 'center', gap: 14 },
  overlayText: { fontFamily: 'Knockout', fontSize: 16, color: '#fff' },
});
