/**
 * VIP membership paywall. Only benefits the game actually delivers, the real
 * App Store plans, prices and trial (StoreKit 2), a Restore button (Apple
 * requires one), and the full auto-renew terms. A purchase or restore is sent
 * to the server, which verifies Apple's signature and switches VIP on before we
 * celebrate. A binary without the StoreKit module asks for an app update.
 */
import { clearGrownUpPass, grownUpForNextStep, type GateReason } from '../components/GrownUpGate';
import RealMoneyMark, { REAL_MONEY_GREEN, REAL_MONEY_INK, REAL_MONEY_TINT } from '../components/RealMoneyMark';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { useFocusEffect } from '@react-navigation/native';
import { openExternal, openLegal } from '../services/external';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeInDown, FadeInUp, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';
import getVipPerks, { type VipPerk } from '../api/endpoints/economy/vip-perks';
import {
  buyVip, legalText, loadVipPlans, priceText, restoreVip, savingsText, storeAvailable, type VipPlan,
} from '../services/purchases';
import { BRAND, GameButton, GameIcon, SharkLoader, gameAlert, type GameIconName } from '../ui';

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

/** "Free for 1 week. Then $4.99 a month." The deal, said once, right above the button. */
export function dealLine(plan: Pick<VipPlan, 'price' | 'period' | 'trial'>): string {
  const billing = priceText(plan);
  return plan.trial
    ? `${capitalize(plan.trial)}. Then ${billing}.`
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
  return { kind: 'money', price: plan.trial ? `${plan.trial}. Then ${priceText(plan)}` : priceText(plan), gets: 'VIP' };
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
  useEffect(() => {
    let live = true;
    getVipPerks().then(next => { if (live && next) setPerks(next); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!player || !canBuy) { setLoading(false); return; }
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
  }, [player?.id, attempt, canBuy]);

  const plan = plans.find(p => p.productId === selectedId) ?? plans[0] ?? null;

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
      const outcome = await buyVip(plan);
      setBusy(null);
      await reportBuy(outcome);
    } finally {
      buying.current = false;
    }
  };

  const reportBuy = async (outcome: Awaited<ReturnType<typeof buyVip>>) => {
    if (outcome === 'success') await celebrate();
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
      <View style={[StyleSheet.absoluteFill, s.tint]} />
      <SafeAreaView style={{ flex: 1 }}>
        {/* The X sits in its own row, so nothing ever scrolls under it. */}
        <View style={s.closeRow}>
          <Pressable style={s.close} onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
            <GameIcon name="close" size={40} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <Hero />
          <Animated.Text entering={FadeInDown.delay(150)} style={s.title}>GO VIP</Animated.Text>
          <Animated.Text entering={FadeInDown.delay(220)} style={s.sub}>Get more from every park day and every hunt.</Animated.Text>

          <View style={s.benefits}>
            {perks.map((b, i) => (
              <Animated.View key={b.title} entering={FadeInUp.delay(280 + i * 80).springify().damping(15)} style={s.benefit}>
                <GameIcon name={b.icon} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={s.benefitTitle}>{b.title}</Text>
                  <Text style={s.benefitBody}>{b.body}</Text>
                </View>
              </Animated.View>
            ))}
          </View>

          {!player ? (
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
                      {p.period === 'year' && savings && <Text style={s.planBadge}>COSTS LESS</Text>}
                      <Text style={[s.planName, selected && s.planNameSelected]}>{p.period === 'year' ? 'YEARLY' : 'MONTHLY'}</Text>
                      <Text style={[s.planPrice, selected && s.planNameSelected]}>{priceText(p)}</Text>
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

function Hero() {
  const still = useUiReducedMotion();
  const bob = useSharedValue(0);
  const spin = useSharedValue(0);
  useEffect(() => {
    // Reduce Motion: the hero holds still.
    if (still) return () => undefined;
    bob.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), -1, true);
    spin.value = withRepeat(withTiming(1, { duration: 20000, easing: Easing.linear }), -1, false);
    return () => { cancelAnimation(bob); cancelAnimation(spin); };
  }, [bob, spin, still]);
  const hero = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 8 }] }));
  const burst = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  return (
    <View style={s.heroStage}>
      <Animated.Image source={require('../../assets/images/screens/explore/starburst.png')} style={[s.burst, burst]} resizeMode="contain" />
      <Animated.View entering={ZoomIn.springify().damping(11)} style={hero}>
        <Image source={require('../../assets/images/vip-hero.png')} style={s.hero} contentFit="contain" />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0768b9' },
  tint: { backgroundColor: 'rgba(7, 104, 185, 0.35)' },
  closeRow: { height: 44, alignItems: 'flex-end', paddingRight: 14 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  heroStage: { width: 200, height: 120, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  burst: { position: 'absolute', width: 340, height: 340, opacity: 0.18 },
  hero: { width: 120, height: 120 },
  title: { fontFamily: 'Shark', fontSize: 46, color: '#ffcf3b', textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  sub: { fontFamily: 'Knockout', fontSize: 18, color: '#fff', textAlign: 'center', marginTop: 2 },
  benefits: { width: '100%', gap: 8, marginTop: 16 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', padding: 10 },
  benefitTitle: { fontFamily: 'Shark', fontSize: 18, color: '#fff' },
  benefitBody: { fontFamily: 'Knockout', fontSize: 14, color: '#dbeafe' },
  guest: { width: '100%', marginTop: 18, alignItems: 'center', gap: 12 },
  guestText: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.white, textAlign: 'center' },
  plans: { flexDirection: 'row', gap: 10, marginTop: 18 },
  planCard: { flex: 1, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 8,
    alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)' },
  planCardSelected: { backgroundColor: '#fff', borderColor: '#ffcf3b' },
  planBadge: { position: 'absolute', top: -12, backgroundColor: BRAND.greenLip, color: '#fff', fontFamily: 'Shark', fontSize: 12,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  planName: { fontFamily: 'Shark', fontSize: 16, color: '#09268f' },
  planNameSelected: { color: '#09268f' },
  planPrice: { fontFamily: 'Shark', fontSize: 18, color: '#09268f', marginTop: 2 },
  planTrial: { fontFamily: 'Knockout', fontSize: 13, color: BRAND.greenLip, marginTop: 2 },
  deal: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: REAL_MONEY_TINT, borderRadius: 16,
    borderWidth: 3, borderColor: REAL_MONEY_GREEN, paddingHorizontal: 12, paddingVertical: 8 },
  dealHead: { fontFamily: 'Shark', fontSize: 18, color: REAL_MONEY_INK },
  ctaSub: { fontFamily: 'Shark', fontSize: 18, color: '#6a3b00', marginTop: 2 },
  dealBody: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy, lineHeight: 19 },
  cta: { marginTop: 12, backgroundColor: '#ffcf3b', borderRadius: 20, paddingVertical: 17, alignItems: 'center',
    borderBottomWidth: 5, borderBottomColor: '#d99a00' },
  ctaPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 2 },
  ctaText: { fontFamily: 'Shark', fontSize: 26, color: '#6a3b00' },
  links: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  link: { fontFamily: 'Knockout', fontSize: 15, color: '#fff', textDecorationLine: 'underline' },
  dot: { color: 'rgba(255,255,255,0.6)' },
  legal: { fontFamily: 'Knockout', fontSize: 13, color: 'rgba(255,255,255,0.92)', textAlign: 'center', marginTop: 12, lineHeight: 18,
    backgroundColor: 'rgba(5,52,110,0.6)', borderRadius: 12, padding: 10, overflow: 'hidden' },
  skip: { fontFamily: 'Knockout', fontSize: 16, color: '#fff', marginTop: 14 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,52,110,0.82)', alignItems: 'center', justifyContent: 'center', gap: 14 },
  overlayText: { fontFamily: 'Knockout', fontSize: 16, color: '#fff' },
});
