/**
 * VIP membership paywall. Only benefits the game actually delivers, the real
 * App Store price and trial from Adapty, a Restore button (Apple requires one),
 * and the full auto-renew terms. After buying or restoring, we wait for the
 * server (Adapty webhook) to mark the player as VIP before celebrating.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useContext, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeInDown, FadeInUp, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';
import getVipPerks, { type VipPerk } from '../api/endpoints/economy/vip-perks';
import { buyVip, legalText, loadVipProduct, priceText, restoreVip, trialText, type VipProduct } from '../services/purchases';
import { BRAND, GameButton, GameIcon, SharkLoader, gameAlert, type GameIconName } from '../ui';

// Every line here is backed by live server logic: ride wins pay VIP double
// (CompleteTaskAction), VIP home maps spawn two extra finds and double their
// rewards (PrepItemSpawner, PrepItemController). VIP gear is left
// out until member items are live in the Shark Shop.
// This list is the offline fallback; the live list comes from GET /api/economy
// (vip_perks, built from the server's economy.vip flags), so flipping a VIP
// multiplier on the server changes this copy too.
export const VIP_BENEFITS: { icon: GameIconName; title: string; body: string }[] = [
  { icon: 'xp', title: '2x XP and Shark Coins', body: 'On every ride coin you win at the park.' },
  { icon: 'gift', title: '+2 finds on every home hunt', body: 'More Energy and Ticket chances on your map.' },
  { icon: 'member', title: 'VIP badge on your profile', body: 'Show every shark you’re part of the crew.' },
];

export default function MembershipScreen({ route }: { route: { params?: { intro?: boolean } } }) {
  const { intro } = route.params ?? {};
  const { labels, urls } = useCrumbs();
  const { player, refreshPlayer } = useContext(AuthContext);
  const [product, setProduct] = useState<VipProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<null | 'buy' | 'restore'>(null);
  const [waiting, setWaiting] = useState(false);
  const [perks, setPerks] = useState<VipPerk[]>(VIP_BENEFITS);
  useEffect(() => {
    let live = true;
    getVipPerks().then(next => { if (live && next) setPerks(next); });
    return () => { live = false; };
  }, []);
  const waitStarted = useRef(0);

  useEffect(() => {
    if (!player) { setLoading(false); return; }
    let live = true;
    setLoading(true); setLoadFailed(false);
    loadVipProduct(player.id).then(p => { if (live) setProduct(p); })
      .catch((e) => { if (__DEV__) console.log('[vip] load failed', e?.adaptyCode ?? e?.code, e?.message ?? String(e)); if (live) { setProduct(null); setLoadFailed(true); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [player?.id, attempt]);

  // After a purchase/restore: poll until the server marks us VIP (webhook), max ~60 s.
  useEffect(() => {
    if (!waiting) return;
    waitStarted.current = Date.now();
    const id = setInterval(async () => {
      try {
        const me = await refreshPlayer();
        if (me.is_subscribed) {
          clearInterval(id);
          setWaiting(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          gameAlert('Welcome to VIP!', labels.payment_complete ?? 'Your VIP perks are live.');
          RootNavigation.navigate('Profile');
        } else if (Date.now() - waitStarted.current > 60000) {
          clearInterval(id);
          setWaiting(false);
          gameAlert('Almost there', 'Your purchase went through. VIP will switch on in a moment; you can keep playing.');
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  const buy = async () => {
    if (!product || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy('buy');
    const outcome = await buyVip(product);
    setBusy(null);
    if (outcome === 'success') setWaiting(true);
    else if (outcome === 'pending') gameAlert('Waiting for approval', 'Your purchase is pending. VIP switches on once it’s approved.');
    else if (outcome === 'failed') gameAlert('Purchase didn’t go through', 'You weren’t charged. Please try again.');
  };

  const restore = async () => {
    if (busy) return;
    setBusy('restore');
    try {
      const active = await restoreVip();
      if (active) setWaiting(true);
      else gameAlert('Nothing to restore', 'We couldn’t find an active VIP membership on this Apple ID.');
    } catch {
      gameAlert('Couldn’t restore', 'Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const close = () => (intro ? RootNavigation.navigate('Explore') : RootNavigation.goBack());
  const trial = product ? trialText(product) : null;
  const price = product ? priceText(product) : '';

  return (
    <View style={s.root}>
      <Image source={require('../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, s.tint]} />
      <SafeAreaView style={{ flex: 1 }}>
        <Pressable style={s.close} onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
          <GameIcon name="close" size={40} />
        </Pressable>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <Hero />
          <Animated.Text entering={FadeInDown.delay(150)} style={s.title}>GO VIP</Animated.Text>
          <Animated.Text entering={FadeInDown.delay(220)} style={s.sub}>Get more out of every park day and every hunt.</Animated.Text>

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
              <Text style={s.guestText}>Sign in to join VIP. Your perks follow your shark to every device.</Text>
              <GameButton label="Sign in to join VIP" onPress={() => RootNavigation.navigate('Login')} />
            </Animated.View>
          ) : loading ? (
            <SharkLoader compact tone="onBlue" style={{ marginTop: 20 }} />
          ) : !product ? (
            <SharkLoader compact tone="onBlue" state="error" style={{ marginTop: 20 }}
              title={loadFailed ? 'VIP couldn’t load' : 'VIP isn’t available right now'}
              message="Check your connection and try again." onRetry={() => setAttempt(a => a + 1)} />
          ) : (
            <Animated.View entering={FadeInUp.delay(620)} style={{ width: '100%' }}>
              <View style={s.priceCard}>
                {trial && <Text style={s.trial}>{trial.toUpperCase()}</Text>}
                <Text style={s.price}>{trial ? `then ${price}` : price}</Text>
                <Text style={s.cancel}>Cancel anytime in your Apple ID settings.</Text>
              </View>
              <Pressable style={({ pressed }) => [s.cta, pressed && s.ctaPressed]} onPress={() => void buy()}
                disabled={!!busy || waiting} accessibilityRole="button">
                <Text style={s.ctaText}>{busy === 'buy' ? 'ONE MOMENT…' : trial ? 'START FREE TRIAL' : 'BECOME VIP'}</Text>
              </Pressable>
            </Animated.View>
          )}

          <View style={s.links}>
            <Pressable onPress={() => void restore()} disabled={!!busy} hitSlop={8}>
              <Text style={s.link}>{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text>
            </Pressable>
            <Text style={s.dot}>·</Text>
            <Pressable onPress={() => urls?.terms && WebBrowser.openBrowserAsync(urls.terms)} hitSlop={8}>
              <Text style={s.link}>Terms</Text>
            </Pressable>
            <Text style={s.dot}>·</Text>
            <Pressable onPress={() => urls?.privacy_policy && WebBrowser.openBrowserAsync(urls.privacy_policy)} hitSlop={8}>
              <Text style={s.link}>Privacy</Text>
            </Pressable>
          </View>
          {product && <Text style={s.legal}>{legalText(product)}</Text>}
          {intro && (
            <Pressable onPress={close} hitSlop={8}><Text style={s.skip}>{labels?.skip_for_now ?? 'Skip for now'}</Text></Pressable>
          )}
        </ScrollView>
      </SafeAreaView>

      {waiting && (
        <View style={s.overlay}>
          <SharkLoader compact tone="onBlue" />
          <Text style={s.overlayText}>{labels?.processing_payment ?? 'Switching on your VIP perks…'}</Text>
        </View>
      )}
    </View>
  );
}

function Hero() {
  const bob = useSharedValue(0);
  const spin = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), -1, true);
    spin.value = withRepeat(withTiming(1, { duration: 20000, easing: Easing.linear }), -1, false);
    return () => { cancelAnimation(bob); cancelAnimation(spin); };
  }, [bob, spin]);
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
  close: { position: 'absolute', top: 50, right: 14, zIndex: 5, width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center' },
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  heroStage: { width: 260, height: 230, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  burst: { position: 'absolute', width: 340, height: 340, opacity: 0.18 },
  hero: { width: 230, height: 230 },
  title: { fontFamily: 'Shark', fontSize: 46, color: '#ffcf3b', textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  sub: { fontFamily: 'Knockout', fontSize: 18, color: '#fff', textAlign: 'center', marginTop: 2 },
  benefits: { width: '100%', gap: 8, marginTop: 16 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', padding: 10 },
  benefitTitle: { fontFamily: 'Shark', fontSize: 18, color: '#fff' },
  benefitBody: { fontFamily: 'Knockout', fontSize: 14, color: '#dbeafe' },
  guest: { width: '100%', marginTop: 18, alignItems: 'center', gap: 12 },
  guestText: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.white, textAlign: 'center' },
  priceCard: { marginTop: 18, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 12, alignItems: 'center',
    borderWidth: 3, borderColor: '#ffcf3b' },
  trial: { fontFamily: 'Shark', fontSize: 22, color: BRAND.greenLip },
  price: { fontFamily: 'Shark', fontSize: 20, color: '#09268f' },
  cancel: { fontFamily: 'Knockout', fontSize: 13, color: '#64748b', marginTop: 2 },
  cta: { marginTop: 12, backgroundColor: '#ffcf3b', borderRadius: 20, paddingVertical: 17, alignItems: 'center',
    borderBottomWidth: 5, borderBottomColor: '#d99a00' },
  ctaPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 2 },
  ctaText: { fontFamily: 'Shark', fontSize: 26, color: '#6a3b00' },
  links: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  link: { fontFamily: 'Knockout', fontSize: 15, color: '#fff', textDecorationLine: 'underline' },
  dot: { color: 'rgba(255,255,255,0.6)' },
  legal: { fontFamily: 'Knockout', fontSize: 11, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 12, lineHeight: 15 },
  skip: { fontFamily: 'Knockout', fontSize: 16, color: '#fff', marginTop: 14 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,52,110,0.82)', alignItems: 'center', justifyContent: 'center', gap: 14 },
  overlayText: { fontFamily: 'Knockout', fontSize: 16, color: '#fff' },
});
