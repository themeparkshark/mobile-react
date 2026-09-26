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
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeInDown, FadeInUp, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { vsprintf } from 'sprintf-js';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';
import { buyVip, loadVipProduct, priceText, restoreVip, trialText, type VipProduct } from '../services/purchases';

// Every line here is backed by server logic (TaskAttempt/Trivia 2x, spawner +2, member items).
const BENEFITS: { icon: string; title: string; body: string }[] = [
  { icon: '⚡', title: '2x XP & Shark Coins', body: 'On every ride coin you win and every trivia round.' },
  { icon: '🍩', title: '+2 treats every home hunt', body: 'More Energy and Ticket chances on your map.' },
  { icon: '👑', title: 'Members-only shark gear', body: 'Exclusive items to style your shark.' },
  { icon: '🦈', title: 'VIP badge on your profile', body: 'Show every shark you’re part of the crew.' },
];

export default function MembershipScreen({ route }: { route: { params?: { intro?: boolean } } }) {
  const { intro } = route.params ?? {};
  const { labels, urls } = useCrumbs();
  const { player, refreshPlayer } = useContext(AuthContext);
  const [product, setProduct] = useState<VipProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | 'buy' | 'restore'>(null);
  const [waiting, setWaiting] = useState(false);
  const waitStarted = useRef(0);

  useEffect(() => {
    if (!player) { setLoading(false); return; }
    let live = true;
    loadVipProduct(player.id).then(p => { if (live) setProduct(p); })
      .catch((e) => { if (__DEV__) console.log('[vip] load failed', e?.adaptyCode ?? e?.code, e?.message ?? String(e)); if (live) setProduct(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [player?.id]);

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
          Alert.alert('Welcome to VIP! 🦈👑', labels.payment_complete ?? 'Your VIP perks are live.');
          RootNavigation.navigate('Profile');
        } else if (Date.now() - waitStarted.current > 60000) {
          clearInterval(id);
          setWaiting(false);
          Alert.alert('Almost there', 'Your purchase went through. VIP will switch on in a moment; you can keep playing.');
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
    else if (outcome === 'pending') Alert.alert('Waiting for approval', 'Your purchase is pending. VIP switches on once it’s approved.');
    else if (outcome === 'failed') Alert.alert('Purchase didn’t go through', 'You weren’t charged. Please try again.');
  };

  const restore = async () => {
    if (busy) return;
    setBusy('restore');
    try {
      const active = await restoreVip();
      if (active) setWaiting(true);
      else Alert.alert('Nothing to restore', 'We couldn’t find an active VIP membership on this Apple ID.');
    } catch {
      Alert.alert('Couldn’t restore', 'Check your connection and try again.');
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
          <Text style={s.closeText}>✕</Text>
        </Pressable>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <Hero />
          <Animated.Text entering={FadeInDown.delay(150)} style={s.title}>GO VIP</Animated.Text>
          <Animated.Text entering={FadeInDown.delay(220)} style={s.sub}>Get more out of every park day and every hunt.</Animated.Text>

          <View style={s.benefits}>
            {BENEFITS.map((b, i) => (
              <Animated.View key={b.title} entering={FadeInUp.delay(280 + i * 80).springify().damping(15)} style={s.benefit}>
                <Text style={s.benefitIcon}>{b.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.benefitTitle}>{b.title}</Text>
                  <Text style={s.benefitBody}>{b.body}</Text>
                </View>
              </Animated.View>
            ))}
          </View>

          {loading ? (
            <ActivityIndicator color="#fff" size="large" style={{ marginTop: 24 }} />
          ) : !product ? (
            <View style={s.unavailable}>
              <Text style={s.unavailableText}>VIP isn’t available right now. Please try again in a bit.</Text>
            </View>
          ) : (
            <Animated.View entering={FadeInUp.delay(620)} style={{ width: '100%' }}>
              <View style={s.priceCard}>
                {trial && <Text style={s.trial}>{trial.toUpperCase()}</Text>}
                <Text style={s.price}>{trial ? `then ${price}` : price}</Text>
                <Text style={s.cancel}>Cancel anytime in your Apple ID settings.</Text>
              </View>
              <Pressable style={({ pressed }) => [s.cta, pressed && s.ctaPressed]} onPress={() => void buy()}
                disabled={!!busy || waiting} accessibilityRole="button">
                {busy === 'buy' ? <ActivityIndicator color="#6a3b00" />
                  : <Text style={s.ctaText}>{trial ? 'START FREE TRIAL' : 'BECOME VIP'}</Text>}
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
          {product && labels?.membership_terms && (
            <Text style={s.legal}>{vsprintf(labels.membership_terms, [product.price?.currencyCode ?? '', product.price?.localizedString ?? ''])}</Text>
          )}
          {intro && (
            <Pressable onPress={close} hitSlop={8}><Text style={s.skip}>{labels?.skip_for_now ?? 'Skip for now'}</Text></Pressable>
          )}
        </ScrollView>
      </SafeAreaView>

      {waiting && (
        <View style={s.overlay}>
          <ActivityIndicator size="large" color="#fff" />
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
  tint: { backgroundColor: 'rgba(40, 18, 80, 0.45)' },
  close: { position: 'absolute', top: 54, right: 18, zIndex: 5, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  heroStage: { width: 260, height: 230, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  burst: { position: 'absolute', width: 340, height: 340, opacity: 0.18 },
  hero: { width: 230, height: 230 },
  title: { fontFamily: 'Shark', fontSize: 46, color: '#ffcf3b', textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  sub: { fontFamily: 'Knockout', fontSize: 18, color: '#fff', textAlign: 'center', marginTop: 2 },
  benefits: { width: '100%', gap: 8, marginTop: 16 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', padding: 10 },
  benefitIcon: { fontSize: 26, width: 34, textAlign: 'center' },
  benefitTitle: { fontFamily: 'Shark', fontSize: 18, color: '#fff' },
  benefitBody: { fontFamily: 'Knockout', fontSize: 14, color: '#dbeafe' },
  unavailable: { marginTop: 20, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14, padding: 14 },
  unavailableText: { fontFamily: 'Knockout', fontSize: 16, color: '#fff', textAlign: 'center' },
  priceCard: { marginTop: 18, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 12, alignItems: 'center',
    borderWidth: 3, borderColor: '#ffcf3b' },
  trial: { fontFamily: 'Shark', fontSize: 22, color: '#16a34a' },
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
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', gap: 14 },
  overlayText: { fontFamily: 'Knockout', fontSize: 16, color: '#fff' },
});
