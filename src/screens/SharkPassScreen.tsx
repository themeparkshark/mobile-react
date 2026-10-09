/**
 * The Shark Pass: one winter season, 50 steps climbed by playing.
 *
 * - Everyone climbs the same track and gets the free row. The Shark Pass row
 *   (one App Store buy per season, $4.99) has a reward on every step; every
 *   locked reward is always visible, so a kid knows exactly what it gives.
 * - Points come only from playing (the "How to climb" list is the server's
 *   own table). Nothing here sells points or skips steps.
 * - The real last day is shown. Season items are kept for good and never
 *   come back after the season: the screen says so plainly, once.
 * - The grown-up gate sits on the buy tap only, and restates the price.
 *   It is a one-time buy for this season and never renews; Restore brings it
 *   back on a new phone.
 *
 * Motion is on the UI thread: light snowfall (capped, paused off-screen and
 * in the background, none under Reduce Motion), a pulse on claimable cells,
 * and the GotIt payoff on every claim.
 */
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, FadeInDown, FadeInUp, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  claimAllSharkPass, claimSharkPassReward, getSharkPass, sharkPassErrorCode,
  type SharkPassReward, type SharkPassState, type SharkPassTier,
} from '../api/endpoints/me/shark-pass';
import { askGrownUp } from '../components/GrownUpGate';
import { GotIt, MAX_FONT, PackArt, artSource, type PackArtKey } from '../components/money/moneyUi';
import RealMoneyMark from '../components/RealMoneyMark';
import { AuthContext } from '../context/AuthProvider';
import { haptic } from '../gamekit/Haptics';
import * as RootNavigation from '../RootNavigation';
import { buySharkPass, loadSharkPassPrice, onSharkPassDelivered, restoreSharkPass, storeAvailable, type ShopPrice } from '../services/purchases';
import { BRAND, FONT, GameButton, GameIcon, SharkLoader, gameAlert, type GameIconName } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { EVENT_COPY, lastDayText, passSummary, rewardWords } from '../services/money/sharkPassModel';

const SEASON_ART: Record<string, number> = {
  'frosty-scarf': require('../../assets/images/sharkpass/frosty-scarf.webp'),
  'snowflake-beanie': require('../../assets/images/sharkpass/snowflake-beanie.webp'),
  'snow-globe-wand': require('../../assets/images/sharkpass/snow-globe-wand.webp'),
  'aurora-shades': require('../../assets/images/sharkpass/aurora-shades.webp'),
  'polar-puffer': require('../../assets/images/sharkpass/polar-puffer.webp'),
  'northern-lights': require('../../assets/images/sharkpass/northern-lights.webp'),
  'pom-hat': require('../../assets/images/sharkpass/pom-hat.webp'),
};
const EMBLEM = require('../../assets/images/sharkpass/pass-emblem.webp');

function rewardArt(reward: SharkPassReward): { kind: 'art'; key: PackArtKey } | { kind: 'image'; source: number | { uri: string } } | { kind: 'icon'; name: GameIconName } {
  switch (reward.type) {
    case 'item': {
      const bundled = SEASON_ART[reward.art];
      if (bundled) return { kind: 'image', source: bundled };
      return reward.icon_url ? { kind: 'image', source: { uri: reward.icon_url } } : { kind: 'icon', name: 'gift' };
    }
    case 'mystery_box': return { kind: 'art', key: 'gift' };
    case 'coins': return { kind: 'art', key: reward.amount >= 200 ? 'coins-2' : 'coins-1' };
    case 'tickets': return { kind: 'art', key: reward.amount >= 3 ? 'tickets-2' : 'tickets-1' };
    case 'rescue_passes': return { kind: 'art', key: 'rescue' };
    default: return { kind: 'icon', name: 'energy' };
  }
}

function RewardPicture({ reward, size }: { reward: SharkPassReward; size: number }) {
  const art = rewardArt(reward);
  if (art.kind === 'art') return <Image source={artSource(art.key)} style={{ width: size, height: size }} contentFit="contain" />;
  if (art.kind === 'image') return <Image source={art.source} style={{ width: size, height: size }} contentFit="contain" />;
  return <GameIcon name={art.name} size={size * 0.8} />;
}

/** Light snowfall: 14 flakes on the UI thread; none under Reduce Motion; paused when not on screen. */
const Snow = memo(function Snow({ width, height, running }: { width: number; height: number; running: boolean }) {
  const flakes = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    x: ((i * 97) % 100) / 100 * width, size: 4 + (i % 3) * 2, dur: 7000 + ((i * 1311) % 5000), delay: (i * 677) % 6000, drift: (i % 2 ? 1 : -1) * (8 + (i % 4) * 4),
  })), [width]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {flakes.map((f, i) => <Flake key={i} {...f} height={height} running={running} />)}
    </View>
  );
});

function Flake({ x, size, dur, delay, drift, height, running }: { x: number; size: number; dur: number; delay: number; drift: number; height: number; running: boolean }) {
  const t = useSharedValue(delay / dur);
  useEffect(() => {
    if (!running) { cancelAnimation(t); return undefined; }
    t.value = withRepeat(withTiming(t.value + 1, { duration: dur * (1 - (t.value % 1)), easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [running, dur, t]);
  const style = useAnimatedStyle(() => {
    const p = t.value % 1;
    return { transform: [{ translateY: -20 + p * (height + 40) }, { translateX: Math.sin(p * Math.PI * 2) * drift }], opacity: 0.75 };
  });
  return <Animated.View style={[{ position: 'absolute', left: x, top: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: '#ffffff' }, style]} />;
}

const CELL_W = 92;

export default function SharkPassScreen() {
  const { player, refreshPlayer } = useContext(AuthContext);
  const reduced = useUiReducedMotion();
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const { width, height } = useWindowDimensions();
  const [state, setState] = useState<SharkPassState | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [price, setPrice] = useState<ShopPrice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [landed, setLanded] = useState<{ reward: SharkPassReward; title: string } | null>(null);
  const buying = useRef(false);
  const list = useRef<FlatList<SharkPassTier>>(null);

  const load = useCallback(async () => {
    try {
      const next = await getSharkPass();
      setState(next);
      setStatus('ready');
      return next;
    } catch {
      setStatus(s => (s === 'ready' ? s : 'error'));
      return null;
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { const sub = AppState.addEventListener('change', s => setActive(s === 'active')); return () => sub.remove(); }, []);
  useEffect(() => onSharkPassDelivered(next => setState(next)), []);

  const season = state && state.enabled ? state.season : null;
  const progress = state && state.enabled ? state.progress : undefined;
  const tiers = (state && state.enabled ? state.tiers : undefined) ?? [];
  const premium = !!progress?.premium;

  useEffect(() => {
    if (!season || premium || !storeAvailable()) return;
    void loadSharkPassPrice(season.product_id).then(setPrice).catch(() => setPrice(null));
  }, [season?.product_id, premium]);

  // Open on the step the player is on.
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !progress || !tiers.length) return;
    scrolled.current = true;
    const index = Math.max(0, Math.min(tiers.length - 1, progress.tier - 1));
    setTimeout(() => list.current?.scrollToOffset({ offset: Math.max(0, index * CELL_W - CELL_W), animated: !reduced }), 350);
  }, [progress, tiers.length, reduced]);

  const claim = async (tier: SharkPassTier, track: 'free' | 'paid') => {
    const reward = track === 'free' ? tier.free : tier.paid;
    if (!reward || busy) return;
    haptic('tapLight');
    setBusy(`${tier.tier}:${track}`);
    try {
      const res = await claimSharkPassReward(tier.tier, track);
      setState(res.pass);
      setLanded({ reward, title: reward.type === 'item' ? 'New season item!' : 'You got it!' });
      void refreshPlayer?.().catch(() => undefined);
    } catch (error) {
      const code = sharkPassErrorCode(error);
      if (code === 'ITEM_NOT_READY' || code === 'BOXES_NOT_READY') gameAlert('Almost ready', 'This one is almost ready. Come back soon and it’s yours.');
      else if (code === 'SHARK_PASS_CLAIMED') void load();
      else gameAlert('That didn’t work', 'Check your internet and try again.');
    } finally {
      setBusy(null);
    }
  };

  const claimAll = async () => {
    if (busy) return;
    haptic('tapLight');
    setBusy('all');
    try {
      const res = await claimAllSharkPass();
      setState(res.pass);
      const first = res.claimed[0];
      if (first) setLanded({ reward: first.reward, title: res.claimed.length > 1 ? `${res.claimed.length} rewards!` : 'You got it!' });
      void refreshPlayer?.().catch(() => undefined);
    } catch {
      gameAlert('That didn’t work', 'Check your internet and try again.');
    } finally {
      setBusy(null);
    }
  };

  const buy = async () => {
    if (!season || !price || busy || buying.current) return;
    buying.current = true;
    try {
      // Real money: a grown-up answers first, and the gate says the price and what it is.
      if (!(await askGrownUp({ kind: 'money', price: price.price, gets: `the Shark Pass for ${season.title}. One time. It doesn’t renew` }))) return;
      haptic('hitMedium');
      setBusy('buy');
      const outcome = await buySharkPass(season.product_id, state && state.enabled ? state.account_token : null);
      if (outcome.status === 'success') {
        setState(outcome.state);
        haptic('success');
        setLanded({ reward: tiers.find(t => t.paid.type === 'item')?.paid ?? tiers[0].paid, title: 'Shark Pass on!' });
      } else if (outcome.status === 'pending') gameAlert('Waiting for a grown-up', 'A grown-up needs to say yes on their phone. Your Shark Pass turns on after that.');
      else if (outcome.status === 'unverified') gameAlert('Almost there', 'It worked! Your Shark Pass turns on in a minute. If not, it turns on next time you open the game.');
      else if (outcome.status === 'other_account') gameAlert('Bought on another account', 'This Shark Pass belongs to a different Theme Park Shark account. Sign in to that account to use it.');
      else if (outcome.status === 'unavailable') gameAlert('Update the game', 'Update Theme Park Shark in the App Store to get the Shark Pass.');
      else if (outcome.status === 'failed') gameAlert('That didn’t work', 'You weren’t charged. Check your internet, then try again.');
    } finally {
      setBusy(null);
      buying.current = false;
    }
  };

  const restore = async () => {
    if (!season || busy) return;
    setBusy('restore');
    const outcome = await restoreSharkPass(season.product_id);
    setBusy(null);
    if (outcome === 'restored') { await load(); gameAlert('Welcome back!', 'Your Shark Pass is on again.'); }
    else if (outcome === 'nothing') gameAlert('Nothing to bring back', 'We couldn’t find this season’s Shark Pass on this Apple ID.');
    else if (outcome === 'other_account') gameAlert('On another account', 'This Shark Pass belongs to a different Theme Park Shark account.');
    else gameAlert('That didn’t work', 'Check your internet and try again.');
  };

  const running = focused && active && !reduced;
  const summary = useMemo(() => passSummary(tiers), [tiers]);
  const nextPaid = tiers.filter(t => !t.unlocked || !premium).filter(t => t.paid.type === 'item' || t.paid.type === 'mystery_box').slice(0, 3);

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0d73c9', '#0a4f96', '#083d7a']} style={StyleSheet.absoluteFill} />
      <Snow width={width} height={height} running={running} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.top}>
          <Pressable onPress={() => RootNavigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={s.back}>
            <GameIcon name="back" size={40} />
          </Pressable>
          <Text maxFontSizeMultiplier={1.15} style={s.topTitle}>SHARK PASS</Text>
          <View style={{ width: 44 }} />
        </View>

        {status === 'loading' && !state ? (
          <View style={s.center}><SharkLoader tone="onBlue" compact /></View>
        ) : status === 'error' && !state ? (
          <View style={s.center}><SharkLoader tone="onBlue" compact state="error" title="The Shark Pass couldn’t open" onRetry={() => { setStatus('loading'); void load(); }} /></View>
        ) : !state || !state.enabled || !season || !progress ? (
          <View style={s.center}>
            <Image source={EMBLEM} style={{ width: 120, height: 120 }} contentFit="contain" />
            <Text maxFontSizeMultiplier={MAX_FONT} style={s.offTitle}>{state && state.enabled && state.next_season ? state.next_season.title : 'Shark Pass'}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT} style={s.offBody}>
              {state && state.enabled && state.next_season ? `Starts ${lastDayText(state.next_season.starts_at.slice(0, 10))}.` : 'The next season is on its way.'}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
            {/* Season hero: the emblem, the season, the real last day, the climb. */}
            <Animated.View entering={reduced ? undefined : FadeInDown.springify().damping(15)} style={s.heroLip}>
              <View style={s.hero}>
                <Image source={EMBLEM} style={s.emblem} contentFit="contain" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT} style={s.season}>{season.title.toUpperCase()}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT} style={s.ends}>{`Ends ${lastDayText(season.last_day)}`}</Text>
                  <View style={s.stepRow}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={s.step}>{`STEP ${progress.tier}`}</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={s.stepOf}>{`of ${season.tier_count}`}</Text>
                  </View>
                  <ProgressBar value={progress.points_into_tier / season.points_per_tier} reduced={reduced} />
                  <Text maxFontSizeMultiplier={MAX_FONT} style={s.points}>
                    {progress.tier >= season.tier_count ? 'You finished the season!' : `${progress.points_into_tier} / ${season.points_per_tier} points to step ${progress.tier + 1}`}
                  </Text>
                </View>
              </View>
              {progress.vip && <Text maxFontSizeMultiplier={MAX_FONT} style={s.vipLine}>{`VIP: +${progress.vip_bonus_percent}% points on everything`}</Text>}
              {progress.claimable > 0 && (
                <GameButton label={progress.claimable === 1 ? 'Claim 1 reward' : `Claim ${progress.claimable} rewards`} icon="gift"
                  loading={busy === 'all'} disabled={!!busy} onPress={() => void claimAll()} style={{ marginTop: 6 }} />
              )}
            </Animated.View>

            {/* The track: free row on top, Shark Pass row below, every reward visible. */}
            <View style={s.trackHead}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={s.rowLabelFree}>FREE</Text>
              <Text maxFontSizeMultiplier={MAX_FONT} style={s.rowLabelPass}>SHARK PASS</Text>
            </View>
            <FlatList ref={list} horizontal data={tiers as SharkPassTier[]} keyExtractor={t => String(t.tier)}
              showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10 }}
              getItemLayout={(_, i) => ({ length: CELL_W, offset: CELL_W * i + 10, index: i })}
              initialNumToRender={8} windowSize={5}
              renderItem={({ item }) => (
                <TierColumn tier={item} current={progress.tier} premium={premium} busy={busy} pulse={running}
                  onClaim={(track) => void claim(item, track)} onLocked={() => {
                    if (!item.unlocked) gameAlert(`Step ${item.tier}`, `Keep playing to reach step ${item.tier}.`);
                    else if (!premium) gameAlert('Shark Pass reward', `${rewardWords(item.paid)} comes with the Shark Pass.`);
                  }} />
              )} />

            {!premium && (
              <Animated.View entering={reduced ? undefined : FadeInUp.delay(200).springify().damping(15)} style={s.buyLip}>
                <View style={s.buy}>
                  <Text maxFontSizeMultiplier={MAX_FONT} style={s.buyTitle}>UNLOCK THE SHARK PASS ROW</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT} style={s.buyBody}>{`A reward on all ${season.tier_count} steps: ${summary}.`}</Text>
                  {progress.tier > 0 && (
                    <Text maxFontSizeMultiplier={MAX_FONT} style={s.buyBody}>{`You’re on step ${progress.tier}, so those Shark Pass rewards are ready right away.`}</Text>
                  )}
                  <View style={s.preview}>
                    {nextPaid.map(t => (
                      <View key={t.tier} style={s.previewCell}>
                        <RewardPicture reward={t.paid} size={54} />
                        <Text maxFontSizeMultiplier={MAX_FONT} style={s.previewText} numberOfLines={2}>{rewardWords(t.paid)}</Text>
                      </View>
                    ))}
                  </View>
                  {storeAvailable() ? (
                    <Pressable onPress={() => void buy()} disabled={!price || !!busy} accessibilityRole="button"
                      accessibilityLabel={price ? `Get the Shark Pass for ${price.price}. Real money, one time, a grown-up buys it.` : 'Loading the price'}
                      style={({ pressed }) => [s.cta, pressed && s.ctaPressed, (!price || !!busy) && { opacity: 0.6 }]}>
                      <View style={s.ctaRow}>
                        {price && busy !== 'buy' && <RealMoneyMark size={26} />}
                        <Text maxFontSizeMultiplier={1.15} style={s.ctaText}>{busy === 'buy' ? 'ONE MOMENT…' : price ? `GET IT · ${price.price}` : 'LOADING'}</Text>
                      </View>
                      <Text maxFontSizeMultiplier={1.15} style={s.ctaSub}>One time for this season. It doesn’t renew.</Text>
                    </Pressable>
                  ) : (
                    <Text maxFontSizeMultiplier={MAX_FONT} style={s.buyBody}>Update Theme Park Shark to get the Shark Pass.</Text>
                  )}
                  <Text maxFontSizeMultiplier={MAX_FONT} style={s.realMoney}>Real money. A grown-up buys it.</Text>
                  <Pressable onPress={() => void restore()} hitSlop={8} disabled={!!busy}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={s.restore}>{busy === 'restore' ? 'Checking…' : 'Restore purchases'}</Text>
                  </Pressable>
                </View>
              </Animated.View>
            )}

            {/* How to climb: the server's own point table, with today's count. */}
            <View style={s.earn}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={s.earnTitle}>HOW TO CLIMB</Text>
              {progress.today.filter(e => EVENT_COPY[e.event]).map(e => (
                <View key={e.event} style={s.earnRow}>
                  <GameIcon name={EVENT_COPY[e.event].icon} size={26} />
                  <Text maxFontSizeMultiplier={MAX_FONT} style={s.earnLabel}>{EVENT_COPY[e.event].label}</Text>
                  {e.cap !== null && <Text maxFontSizeMultiplier={MAX_FONT} style={s.earnCount}>{`${Math.min(e.count_today, e.cap)}/${e.cap} today`}</Text>}
                  <Text maxFontSizeMultiplier={MAX_FONT} style={s.earnPts}>{`+${e.points}`}</Text>
                </View>
              ))}
            </View>

            <Text maxFontSizeMultiplier={MAX_FONT} style={s.fine}>
              {`Everything you claim is yours to keep. Season items never come back after ${lastDayText(season.last_day)}.`}
            </Text>
          </ScrollView>
        )}
      </SafeAreaView>
      {landed && (
        <GotIt grants={{}} art="gift" title={landed.title} onDone={() => setLanded(null)} picture={<RewardPicture reward={landed.reward} size={180} />}
          caption={rewardWords(landed.reward)} />
      )}
    </View>
  );
}

function ProgressBar({ value, reduced }: { value: number; reduced: boolean }) {
  const w = useSharedValue(0);
  useEffect(() => { w.value = reduced ? value : withTiming(Math.max(0, Math.min(1, value)), { duration: 700, easing: Easing.out(Easing.cubic) }); }, [value, reduced, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={s.bar}><Animated.View style={[s.barFill, fill]} /></View>
  );
}

const TierColumn = memo(function TierColumn({ tier, current, premium, busy, pulse, onClaim, onLocked }: {
  tier: SharkPassTier; current: number; premium: boolean; busy: string | null; pulse: boolean;
  onClaim: (track: 'free' | 'paid') => void; onLocked: () => void;
}) {
  const freeReady = tier.unlocked && !!tier.free && !tier.free_claimed;
  const paidReady = tier.unlocked && premium && !tier.paid_claimed;
  return (
    <View style={s.col}>
      <Cell reward={tier.free} claimed={tier.free_claimed} ready={freeReady} locked={!tier.unlocked} pass={false}
        pulse={pulse} busy={busy === `${tier.tier}:free`} onPress={() => (freeReady ? onClaim('free') : onLocked())} />
      <View style={[s.node, tier.unlocked && s.nodeOn, tier.tier === current && s.nodeNow]}>
        <Text maxFontSizeMultiplier={1.1} style={[s.nodeText, tier.unlocked && s.nodeTextOn]}>{tier.tier}</Text>
      </View>
      <Cell reward={tier.paid} claimed={tier.paid_claimed} ready={paidReady} locked={!tier.unlocked || !premium} pass
        pulse={pulse} busy={busy === `${tier.tier}:paid`} onPress={() => (paidReady ? onClaim('paid') : onLocked())} />
    </View>
  );
});

function Cell({ reward, claimed, ready, locked, pass, pulse, busy, onPress }: {
  reward: SharkPassReward | null; claimed: boolean; ready: boolean; locked: boolean; pass: boolean; pulse: boolean; busy: boolean; onPress: () => void;
}) {
  const glow = useSharedValue(0);
  useEffect(() => {
    if (!ready || !pulse) { cancelAnimation(glow); glow.value = 0; return undefined; }
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0, { duration: 650 })), -1, false);
    return () => cancelAnimation(glow);
  }, [ready, pulse, glow]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: 1 + glow.value * 0.05 }] }));
  if (!reward) return <View style={[s.cell, s.cellEmpty]} />;
  return (
    <Animated.View style={ready ? ring : undefined}>
      <Pressable onPress={onPress} accessibilityRole="button"
        accessibilityLabel={`${rewardWords(reward)}. ${claimed ? 'Claimed.' : ready ? 'Tap to claim.' : locked ? (pass ? 'Shark Pass reward.' : 'Keep playing to reach it.') : ''}`}
        style={[s.cell, pass && s.cellPass, ready && s.cellReady, claimed && s.cellClaimed]}>
        <View style={{ opacity: claimed ? 0.45 : 1 }}><RewardPicture reward={reward} size={50} /></View>
        <Text maxFontSizeMultiplier={1.1} style={[s.cellText, pass && s.cellTextPass]} numberOfLines={2}>{rewardWords(reward)}</Text>
        {claimed && <View style={s.badge}><GameIcon name="check" size={22} /></View>}
        {!claimed && locked && <View style={s.badge}><GameIcon name="lock" size={20} /></View>}
        {ready && !busy && <View style={s.claimTag}><Text maxFontSizeMultiplier={1.1} style={s.claimTagText}>CLAIM</Text></View>}
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a4f96' },
  top: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontFamily: FONT.display, fontSize: 30, color: '#ffffff', textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  offTitle: { fontFamily: FONT.display, fontSize: 28, color: BRAND.gold },
  offBody: { fontFamily: FONT.body, fontSize: 17, color: '#ffffff', textAlign: 'center' },
  scroll: { paddingBottom: 48, gap: 14 },
  heroLip: { marginHorizontal: 14, borderRadius: 22, backgroundColor: BRAND.navy, paddingBottom: 6 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, borderWidth: 4, borderColor: '#ffffff', backgroundColor: '#1680d8', padding: 12 },
  emblem: { width: 96, height: 96 },
  season: { fontFamily: FONT.display, fontSize: 24, color: BRAND.gold, textShadowColor: '#5a3a00', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  ends: { fontFamily: FONT.body, fontSize: 15, color: '#e2f6ff' },
  stepRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  step: { fontFamily: FONT.display, fontSize: 22, color: '#ffffff' },
  stepOf: { fontFamily: FONT.body, fontSize: 15, color: '#e2f6ff' },
  bar: { height: 16, borderRadius: 8, backgroundColor: BRAND.navy, borderWidth: 2, borderColor: '#ffffff', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: BRAND.gold, borderRadius: 6 },
  points: { fontFamily: FONT.body, fontSize: 14, color: '#ffffff' },
  vipLine: { fontFamily: FONT.display, fontSize: 14, color: BRAND.gold, textAlign: 'center', marginTop: 6 },
  trackHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: -6 },
  rowLabelFree: { fontFamily: FONT.display, fontSize: 15, color: '#ffffff' },
  rowLabelPass: { fontFamily: FONT.display, fontSize: 15, color: BRAND.gold },
  col: { width: CELL_W, alignItems: 'center', gap: 6, paddingVertical: 6 },
  cell: { width: CELL_W - 10, height: 104, borderRadius: 16, borderWidth: 3, borderColor: '#ffffff', backgroundColor: '#2f9ae8',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, gap: 2, borderBottomWidth: 6, borderBottomColor: BRAND.navy },
  cellEmpty: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.18)', borderBottomColor: 'rgba(5,52,110,0.4)' },
  cellPass: { backgroundColor: '#123f80', borderColor: BRAND.gold, borderBottomColor: '#5a3a00' },
  cellReady: { borderColor: '#7dffb0' },
  cellClaimed: { backgroundColor: '#5b8fbf' },
  cellText: { fontFamily: FONT.display, fontSize: 11, color: '#ffffff', textAlign: 'center', lineHeight: 13 },
  cellTextPass: { color: '#ffe07a' },
  badge: { position: 'absolute', top: -8, right: -6 },
  claimTag: { position: 'absolute', bottom: -10, backgroundColor: '#2fb44a', borderRadius: 8, borderWidth: 2, borderColor: '#ffffff', paddingHorizontal: 6 },
  claimTagText: { fontFamily: FONT.display, fontSize: 11, color: '#ffffff' },
  node: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(5,52,110,0.7)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  nodeOn: { backgroundColor: BRAND.gold, borderColor: '#ffffff' },
  nodeNow: { transform: [{ scale: 1.18 }], borderColor: '#7dffb0' },
  nodeText: { fontFamily: FONT.display, fontSize: 14, color: '#cfe4fb' },
  nodeTextOn: { color: '#6a3b00' },
  buyLip: { marginHorizontal: 14, borderRadius: 22, backgroundColor: '#5a3a00', paddingBottom: 6 },
  buy: { borderRadius: 22, borderWidth: 4, borderColor: BRAND.gold, backgroundColor: '#123f80', padding: 14, gap: 8, alignItems: 'center' },
  buyTitle: { fontFamily: FONT.display, fontSize: 20, color: BRAND.gold, textAlign: 'center' },
  buyBody: { fontFamily: FONT.body, fontSize: 15, color: '#ffffff', textAlign: 'center', lineHeight: 19 },
  preview: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  previewCell: { width: 92, alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 4 },
  previewText: { fontFamily: FONT.display, fontSize: 11, color: '#ffe07a', textAlign: 'center' },
  cta: { alignSelf: 'stretch', backgroundColor: BRAND.gold, borderRadius: 18, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 5, borderBottomColor: BRAND.goldLip },
  ctaPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 2 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaText: { fontFamily: FONT.display, fontSize: 24, color: '#6a3b00' },
  ctaSub: { fontFamily: FONT.body, fontSize: 14, color: '#6a3b00' },
  realMoney: { fontFamily: FONT.body, fontSize: 14, color: '#e2f6ff' },
  restore: { fontFamily: FONT.body, fontSize: 15, color: '#ffffff', textDecorationLine: 'underline' },
  earn: { marginHorizontal: 14, backgroundColor: BRAND.cream, borderRadius: 20, padding: 12, gap: 6, borderWidth: 3, borderColor: BRAND.navy },
  earnTitle: { fontFamily: FONT.display, fontSize: 17, color: BRAND.navy },
  earnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  earnLabel: { flex: 1, fontFamily: FONT.body, fontSize: 16, color: BRAND.navy },
  earnCount: { fontFamily: FONT.body, fontSize: 13, color: BRAND.navySoft },
  earnPts: { fontFamily: FONT.display, fontSize: 16, color: '#1f8a3e', minWidth: 46, textAlign: 'right' },
  fine: { fontFamily: FONT.body, fontSize: 14, color: '#e2f6ff', textAlign: 'center', marginHorizontal: 24 },
});
