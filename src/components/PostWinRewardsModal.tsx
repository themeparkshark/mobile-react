import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import Modal from 'react-native-modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { GoldBurst } from '../ui/GoldBurst';
import { DURATION, EASE, SPRING } from '../ui/motionEasing';
import Ribbon from './Ribbon';
import RewardBurst from './RewardBurst';
import { haptic } from '../gamekit/Haptics';
import CoinCatchReveal, { type CatchHandoff } from './CoinCatchReveal';
import YellowButton from './YellowButton';
import ShelfCoin from './collection/ShelfCoin';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import type { EarnedCoinEdition, RideControlReward, RushReward } from '../api/endpoints/me/task-attempts';
import type { CollectionMilestones } from '../api/endpoints/me/ride-coins/milestones';
import { isTeam, teamName } from '../constants/teams';
import { AuthContext } from '../context/AuthProvider';
import { useCurrencyFly } from '../context/CurrencyFlyProvider';
import type { StampData } from '../api/endpoints/me/stamps';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { playSfx } from '../gamekit/SFX';
import GameIcon from '../ui/GameIcon';
import {
  milestoneHeadline, nextCoinButton, partsProgress, shelfLine, teamSentence, winRewardChips,
  type NextCoinButton, type WinChip,
} from './rewards/postWinModel';
import { watchForReward } from '../services/ads';
import { holdWinNotes, takeWinNote } from '../screens/LeaderboardsScreen/standingsCache';
import countText from '../helpers/countText';
import { useNativeModalLayer } from '../ui/modalLayers';
import { useRung } from '../services/reveal/revealLadder';
import type { PerkChipData } from './coin/progressionModel';
import PerkChipRow from './coin/PerkChip';

const { width: SW, height: SH } = Dimensions.get('window');
/** Below this height (iPhone SE is 667 pt) the hero coin shrinks so a first-coin card fits with no scroll. */
const SHORT_SCREEN = 740;
const HERO = SH < SHORT_SCREEN ? 112 : 140;

const FLY_ART = {
  coins: require('../../assets/icons/game/coins.png'),
  ticket: require('../../assets/images/ticket-icon.png'),
  energy: require('../../assets/images/energy.png'),
  parts: require('../../assets/images/ride-parts.png'),
  xp: require('../../assets/images/screens/explore/xp.png'),
  stamp: require('../../assets/images/stamps/first-ride-coin-v1.png'),
} as const;

interface Props {
  visible: boolean;
  rideName: string;
  taskCoinUrl?: string;
  coinsEarned: number;
  xpEarned: number;
  ridePartsEarned: number;
  energyEarned: number;
  coinTimesCollected?: number | null;
  earnedEdition?: EarnedCoinEdition | null;
  /** Ride Control outcome of this win: one team sentence after a team pick, nothing before it. */
  rideControl?: RideControlReward | null;
  rush?: RushReward | null;
  /** Coin perks (progression v2): hidden while perks are off (blueprint 5.13). */
  perks?: readonly PerkChipData[];
  playerId?: number | null;
  /** A new stamp: it flies to the Rewards button when the card closes (no button on the card). */
  earnedStamp?: Pick<StampData, 'id' | 'name' | 'rewards'> | null;
  nextRideTicketEarned?: number;
  coinProgress?: RideCoinLevelType | null;
  playerEnergy?: number | null;
  /** What this win did for the park shelf (first coin, 25/50/75%, complete). */
  milestones?: CollectionMilestones | null;
  /** "1 coin this week" (the Standings count), or null. */
  weekLine?: string | null;
  /** The guide's next target after this win (null until the map has picked one). */
  nextTarget?: { taskId: number; name: string; meters: number | null; reason: string } | null;
  /** The won ride's task id (the next target is never the coin just won, except its line story). */
  wonTaskId?: number | null;
  /** NEXT COIN (or "Play its line story"): the parent points the guide and closes. */
  onNextCoin?: (button: NextCoinButton) => void;
  /** See my shelf: the coin flies onto its shelf. */
  onViewCoin?: (openMastery?: boolean) => void;
  /** Kept for older callers; the stamp is claimed from the Rewards button now. */
  onViewStampBook?: () => void;
  onHidden?: () => void;
  onClose: () => void;
  /** The won attempt (a VIP member's double coins are granted on it). */
  attemptId?: number | null;
  /** Shark Events: the won ride was today's Star Ride (a small x2 badge). */
  starRide?: boolean;
}

/* ─── Count-up number (JS timer, lands exactly on the confirmed amount) ─── */
function CountUp({ value, start, reduced, style }: { value: number; start: boolean; reduced: boolean; style: object }) {
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced || !start) { setShown(reduced ? value : 0); return undefined; }
    let step = 0;
    const steps = 14;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      step += 1;
      const t = step / steps;
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (step < steps) timer = setTimeout(tick, 34);
      // The number lands with a tick, so each chip is felt, not just seen.
      else if (value > 0) { haptic('tickSelection'); playSfx('tick', 0.45); }
    };
    timer = setTimeout(tick, 34);
    return () => clearTimeout(timer);
  }, [value, start, reduced]);
  return <Text style={style}>+{countText(shown)}</Text>;
}

/* ─── One reward chip in the one reward row; pops in on the shared entrance clock ─── */
function RewardChip({ chip, index, enter, reduced, started }: {
  chip: WinChip; index: number; enter: SharedValue<number>; reduced: boolean; started: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (enter.value - 0.35 - index * 0.08) / 0.3));
    return { opacity: t, transform: [{ translateY: (1 - t) * 14 }, { scale: 0.85 + 0.15 * t }] };
  });
  return (
    <Animated.View style={[styles.chip, chip.quiet && styles.chipQuiet, style]} accessible accessibilityLabel={`${chip.amount} ${chip.label}`}>
      <GameIcon name={chip.icon} size={24} />
      <View style={{ flexShrink: 1 }}>
        <CountUp value={chip.amount} start={started} reduced={reduced} style={styles.chipAmount} />
        <Text style={[styles.chipLabel, chip.quiet && styles.chipLabelQuiet]} numberOfLines={2}>{chip.label}</Text>
      </View>
    </Animated.View>
  );
}

/**
 * The win card (core loop blueprint 5.3 and 5.13): one 375 pt screen for a
 * first coin. The coin and its shelf line ("1 of 35 coins. Bronze at 12")
 * lead, then one reward row, then one team sentence after a team pick. One
 * big button, NEXT COIN (or "Play its line story" on today's Adventure ride),
 * and one quiet See my shelf. No offers, no stamp button (the stamp flies to
 * the Rewards button), no pass banner, no Standings note. A VIP member's
 * double coins are granted for them and shown as one "+N VIP" chip.
 */
export default function PostWinRewardsModal({
  visible,
  rideName,
  taskCoinUrl,
  coinsEarned,
  xpEarned,
  ridePartsEarned,
  energyEarned,
  coinTimesCollected,
  earnedEdition,
  rideControl,
  rush,
  perks = [],
  earnedStamp,
  nextRideTicketEarned = 0,
  coinProgress,
  playerEnergy,
  milestones,
  weekLine = null,
  nextTarget = null,
  wonTaskId = null,
  onNextCoin,
  onViewCoin,
  onHidden,
  onClose,
  attemptId = null,
  starRide = false,
}: Props) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { triggerFly } = useCurrencyFly();
  const isVip = !!player?.is_subscribed;
  const coinLevels = useRung('coin_levels').open;
  const daily = useRung('daily').open;
  const afterHide = useRef<(() => void) | null>(null);
  useEffect(() => () => { afterHide.current = null; }, []);
  const reducedMotion = useReducedGameMotion();
  const insets = useSafeAreaInsets();
  const hasCoin = typeof coinTimesCollected === 'number' && coinTimesCollected > 0;
  const isNewCoin = coinTimesCollected === 1;
  const [coinArtFailed, setCoinArtFailed] = useState(false);
  useEffect(() => { setCoinArtFailed(false); }, [taskCoinUrl, visible]);
  // Warm the coin art while the game is still being played (this modal is mounted, hidden, the whole time),
  // so the catch reveal of a brand-new coin shows its real art on time instead of waiting on the download.
  useEffect(() => {
    if (taskCoinUrl && typeof Image.prefetch === 'function') void Image.prefetch([taskCoinUrl], 'memory-disk').catch(() => undefined);
  }, [taskCoinUrl]);

  // VIP members keep their double coins (blueprint 1.2): granted for them through the existing
  // grant right after the win, shown as one "+N VIP" chip. No button, and nobody else sees a VIP line.
  const [vipCoins, setVipCoins] = useState(0);
  const vipAsked = useRef<number | null>(null);
  useEffect(() => {
    if (!visible || !isVip || attemptId == null || coinsEarned <= 0 || vipAsked.current === attemptId) return;
    vipAsked.current = attemptId;
    setVipCoins(0);
    let alive = true;
    void watchForReward('double_coins', attemptId, true).then(outcome => {
      if (!alive || outcome.status !== 'granted') return;
      setVipCoins(Math.max(0, Number(outcome.reward.reward.coins) || 0));
      void refreshPlayer?.();
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [visible, isVip, attemptId, coinsEarned, refreshPlayer]);

  // The Standings goal note moves to Standings (blueprint 5.13): while this card is up, its note is
  // taken here so no toast lands within the win card's moment.
  useEffect(() => {
    holdWinNotes(visible);
    if (visible) takeWinNote();
    return () => holdWinNotes(false);
  }, [visible]);

  // The coin catch plays first and hands its coin to the summary's hero slot.
  const [caught, setCaught] = useState(false);
  const [handoff, setHandoff] = useState<CatchHandoff | null>(null);
  const heroRef = useRef<View>(null);
  useEffect(() => {
    if (!visible) { setCaught(false); setHandoff(null); }
    else if (!hasCoin) setCaught(true);
  }, [visible, hasCoin]);

  const parts = coinLevels && !isNewCoin ? partsProgress(coinProgress ?? null, playerEnergy, ridePartsEarned) : null;
  const chips = useMemo(() => winRewardChips({
    coins: coinsEarned, tickets: nextRideTicketEarned, parts: ridePartsEarned, energy: energyEarned, xp: xpEarned,
    vipCoins, coinLevelsOpen: coinLevels, dailyOpen: daily,
  }), [coinsEarned, nextRideTicketEarned, ridePartsEarned, energyEarned, xpEarned, vipCoins, coinLevels, daily]);
  const headline = milestoneHeadline(milestones ?? null);
  const shelf = shelfLine(milestones ?? null);
  const team = teamSentence(rideControl as Parameters<typeof teamSentence>[0], name => (isTeam(name) ? teamName(name) : name));
  const next = nextCoinButton(nextTarget, wonTaskId);

  // One entrance clock for the whole summary (UI thread): card settle, hero
  // squash, chips. Reduced motion jumps to the end.
  const enter = useSharedValue(reducedMotion ? 1 : 0);
  const heroSquash = useSharedValue(1);
  const burst = useSharedValue(0);
  const spin = useSharedValue(0);
  useEffect(() => {
    const values = [enter, heroSquash, burst, spin];
    if (!visible || !caught) { values.forEach(value => cancelAnimation(value)); return undefined; }
    if (reducedMotion) {
      enter.value = 1; heroSquash.value = 1; burst.value = 0; spin.value = isNewCoin ? 0.6 : 0.35;
      return undefined;
    }
    enter.value = 0;
    enter.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
    // The coin arrives from the catch: land with a squash and settle.
    heroSquash.value = withSequence(withTiming(0.88, { duration: 80 }), withSpring(1, SPRING.pop));
    burst.value = 0;
    burst.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
    // The same gold as the catch that handed the coin over (GoldBurst turns only while it shows and power allows).
    spin.value = 0;
    spin.value = withTiming(isNewCoin ? 0.6 : 0.35, { duration: DURATION.enter, easing: EASE.out });
    return () => { values.forEach(value => cancelAnimation(value)); };
  }, [visible, caught, reducedMotion]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 4),
    transform: [{ scale: 0.94 + 0.06 * Math.min(1, enter.value * 2.2) }],
  }));
  const heroStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: heroSquash.value }, { scaleX: 2 - heroSquash.value }] }));
  const burstStyle = useAnimatedStyle(() => ({
    opacity: burst.value === 0 ? 0 : 1 - burst.value,
    transform: [{ scale: 0.7 + burst.value * 0.9 }],
  }));
  const textStyle = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (enter.value - 0.15) / 0.35));
    return { opacity: t, transform: [{ translateY: (1 - t) * 10 }] };
  });
  const lowerStyle = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (enter.value - 0.55) / 0.4));
    return { opacity: t, transform: [{ translateY: (1 - t) * 12 }] };
  });
  const footerStyle = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (enter.value - 0.2) / 0.4));
    return { opacity: t, transform: [{ translateY: (1 - t) * 20 }] };
  });

  // Measure the hero slot while the catch plays so the caught coin flies into it.
  const measureHero = () => {
    heroRef.current?.measureInWindow((x, y, width, height) => {
      if ([x, y, width, height].every(Number.isFinite) && width > 0) setHandoff({ x, y, size: width });
    });
  };

  // Every reward flies to where it lives as the card closes (blueprint 4.2): Shark Coins and
  // Tickets to their header pills, Energy and Parts to the Shelf button, XP to the Profile tab,
  // the stamp to the Rewards button. A target the map has not drawn is simply skipped.
  const flyRewards = () => {
    const x = SW / 2;
    const y = SH * 0.42;
    const art: Record<string, number> = { coins: FLY_ART.coins, ticket: FLY_ART.ticket, energy: FLY_ART.energy, parts: FLY_ART.parts, xp: FLY_ART.xp };
    for (const chip of chips) {
      triggerFly({ imageSource: art[chip.icon === 'member' ? 'coins' : chip.icon] ?? FLY_ART.coins,
        amount: Math.min(chip.amount, chip.flyTo === 'coins' ? 10 : 3), startX: x, startY: y, targetPosition: chip.flyTo });
    }
    if (!daily && xpEarned > 0) triggerFly({ imageSource: FLY_ART.xp, amount: 2, startX: x, startY: y, targetPosition: 'profile' });
    if (earnedStamp) triggerFly({ imageSource: FLY_ART.stamp, amount: 1, startX: x, startY: y, targetPosition: 'rewards' });
  };

  // The win card waits its turn among the native modal layers (blueprint 4.3 rule 10): it presents
  // only once the challenge card is really gone, and holds its layer until UIKit says it is dismissed.
  const layer = useNativeModalLayer(visible, 'wait');

  const coinSource = taskCoinUrl && !coinArtFailed ? taskCoinUrl : null;
  const primary = hasCoin ? next : { kind: 'map' as const, label: 'Back to the Park', detail: null };
  const pressPrimary = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (hasCoin && onNextCoin) onNextCoin(primary);
    else onClose();
  };

  return (
    <Modal
      animationIn="fadeIn"
      animationOut="fadeOut"
      isVisible={layer.present}
      style={{ margin: 0 }}
      animationInTiming={reducedMotion ? 120 : 250}
      animationOutTiming={reducedMotion ? 120 : 200}
      onBackButtonPress={caught ? onClose : undefined}
      onModalHide={() => {
        layer.onDismissed();
        flyRewards();
        const nextStep = afterHide.current; afterHide.current = null;
        onHidden?.(); nextStep?.();
      }}
      onBackdropPress={caught ? onClose : undefined}
      backdropColor="#05346e"
      backdropOpacity={0.6}
    >
      {/* The summary is laid out under the catch (hidden) so its hero slot can be measured. */}
      <View style={{ flex: 1, opacity: caught ? 1 : 0 }} pointerEvents={caught ? 'auto' : 'none'}>
      <ScrollView style={styles.scroll}
        contentContainerStyle={[styles.container, { paddingTop: Math.max(insets.top, 20) + 4, paddingBottom: 12 }]}
        showsVerticalScrollIndicator={false} testID="post-win-scroll">
        <Animated.View style={[styles.card, cardStyle]}>
          <Ribbon text={headline?.ribbon ?? (hasCoin ? isNewCoin ? 'Coin Caught!' : 'Coin Added!' : 'You won!')} />

          <View style={styles.content}>
            <Image source={require('../../assets/images/water_background.png')} contentFit="cover"
              style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} />

            {/* ── Hero coin ── */}
            <View style={styles.heroStage}>
              <View style={styles.rays} pointerEvents="none">
                <GoldBurst size={HERO * 2.4} amount={spin} reduced={reducedMotion} />
              </View>
              <Animated.View style={[styles.burstRing, burstStyle]} pointerEvents="none" />
              {!reducedMotion && <View pointerEvents="none" style={{ position: 'absolute', width: HERO, height: HERO }}>
                <RewardBurst progress={burst} x={HERO / 2} y={HERO / 2} />
              </View>}
              <Animated.View style={heroStyle}>
                <View ref={heroRef} collapsable={false} onLayout={measureHero} style={{ width: HERO, height: HERO }}>
                  {hasCoin
                    ? coinSource
                      ? <ShelfCoin coinUrl={coinSource} level={coinProgress?.current_level ?? 1} size={HERO} />
                      : <Image source={require('../../assets/icons/game/coin.png')} style={{ width: HERO, height: HERO }} contentFit="contain" />
                    : <View style={styles.heroCheck}><GameIcon name="check" size={80} /></View>}
                </View>
              </Animated.View>
              {coinSource && <Image source={coinSource} style={{ width: 1, height: 1, opacity: 0 }} onError={() => setCoinArtFailed(true)} />}
            </View>

            <Animated.View style={[{ alignItems: 'center', alignSelf: 'stretch' }, textStyle]}>
              <Text style={styles.heroEyebrow}>{hasCoin
                ? isNewCoin ? 'NEW RIDE COIN' : `WON ${coinTimesCollected} TIMES`
                : 'YOU WON'}</Text>
              <Text style={styles.heroTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{rideName}</Text>
              {earnedEdition && <View style={styles.edition}>
                <GameIcon name="sparkle" size={18} />
                <Text style={styles.editionText} numberOfLines={1}>{earnedEdition.name} Edition</Text>
              </View>}
              {/* The shelf % and the next trophy in one line: "1 of 35 coins. Bronze at 12". */}
              {shelf && <View style={styles.shelfLine} accessibilityRole="text">
                <GameIcon name="trophyBronze" size={22} />
                <Text style={styles.shelfText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{shelf}</Text>
              </View>}
            </Animated.View>

            {/* ── The one reward row, counting up ── */}
            {(chips.length > 0 || (rush && coinLevels) || starRide) && <View style={styles.chips}>
              {chips.map((chip, index) => <RewardChip key={chip.label} chip={chip} index={index} enter={enter}
                reduced={reducedMotion} started={caught} />)}
              {rush && coinLevels && <View style={styles.badge} accessible
                accessibilityLabel={`Rush: ${rush.bonus_parts} extra Ride Parts for a short wait`}>
                <GameIcon name="rush" size={20} />
                <Text style={styles.badgeText}>+{rush.bonus_parts}</Text>
              </View>}
              {starRide && <View style={styles.badge} accessible accessibilityLabel="Star Ride: double">
                <GameIcon name="star" size={20} />
                <Text style={styles.badgeText}>x2</Text>
              </View>}
            </View>}

            {/* Coin perk procs (progression v2): server chips only, so nothing shows while perks are off (5.13). */}
            <PerkChipRow perks={perks} start={caught} reduced={reducedMotion} />

            <Animated.View style={[{ alignSelf: 'stretch' }, lowerStyle]}>
              {/* After rung 3, a repeat win shows the coin's Parts as one line. */}
              {parts && !parts.maxed && <View style={styles.partsLine}
                accessible accessibilityLabel={parts.ready ? 'Ready to level up' : `${parts.have} of ${parts.need} Ride Parts for level ${parts.nextLevel}`}>
                <GameIcon name="parts" size={22} />
                <View style={styles.partsTrack}><View style={[styles.partsFill, { width: `${Math.round(parts.after * 100)}%` }]} /></View>
                <Text style={styles.partsText}>{parts.ready ? 'Ready to level up' : `${parts.have}/${parts.need}`}</Text>
              </View>}
              {team && <View style={styles.teamLine} accessibilityRole="text">
                <GameIcon name="crown" size={22} />
                <Text style={styles.teamText} numberOfLines={2}>{team}</Text>
              </View>}
            </Animated.View>
          </View>
        </Animated.View>
      </ScrollView>
      {/* One big button and one quiet one, on a solid plate so they never sit on the dimmed tab bar. */}
      <Animated.View testID="post-win-footer" style={[styles.footerPlate, { paddingBottom: Math.max(insets.bottom, 10) + 2 }, footerStyle]}>
        <View style={styles.footer}>
          {primary.detail && <Text style={styles.nextDetail} numberOfLines={1}>{primary.detail}</Text>}
          <YellowButton text={primary.label} onPress={pressPrimary} />
          {hasCoin && onViewCoin && (
            <TouchableOpacity onPress={() => onViewCoin(false)} accessibilityRole="button"
              accessibilityLabel="See my shelf" style={styles.secondary}>
              <Text style={styles.secondaryText}>See my shelf</Text>
            </TouchableOpacity>
          )}
          {weekLine && <View style={styles.week} accessible accessibilityLabel={weekLine}>
            <GameIcon name="coin" size={16} />
            <GameIcon name="check" size={14} />
            <Text style={styles.weekText}>{weekLine}</Text>
          </View>}
        </View>
      </Animated.View>
      </View>
      {visible && hasCoin && !caught && <CoinCatchReveal coinUrl={coinArtFailed ? undefined : taskCoinUrl} rideName={rideName}
        isNewCoin={isNewCoin} handoff={handoff}
        onDone={() => setCaught(true)} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: SW - 28, alignItems: 'center', zIndex: 10 },
  content: {
    borderRadius: 24, marginTop: '-10%', width: '92%', paddingHorizontal: 14, paddingTop: 26, paddingBottom: 12,
    borderWidth: 4, borderColor: '#ffffff', overflow: 'hidden', backgroundColor: '#0879ca',
    shadowColor: '#05346e', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 12,
  },
  heroStage: { height: HERO + 16, alignItems: 'center', justifyContent: 'center' },
  rays: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  burstRing: { position: 'absolute', width: HERO, height: HERO, borderRadius: HERO, borderWidth: 6, borderColor: '#fff3b0' },
  heroCheck: { width: HERO, height: HERO, borderRadius: HERO, backgroundColor: '#dff4ff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#ffffff' },
  heroEyebrow: { color: '#ffe07a', fontFamily: 'Shark', fontSize: 14, letterSpacing: 1, marginTop: 2,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  heroTitle: { color: '#ffffff', fontFamily: 'Shark', fontSize: 26, lineHeight: 30, textAlign: 'center', marginTop: 1,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
  edition: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, backgroundColor: '#fff8e4', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 3 },
  editionText: { fontFamily: 'Knockout', fontSize: 14, color: '#05346e', flexShrink: 1 },
  shelfLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: '#fff4cc', borderRadius: 14,
    borderWidth: 2, borderColor: '#ffcf3b', paddingVertical: 4, paddingHorizontal: 10, maxWidth: '100%' },
  shelfText: { fontFamily: 'Shark', fontSize: 16, color: '#05346e', flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff8e4', borderRadius: 14,
    borderWidth: 2, borderColor: '#ffffff', borderBottomWidth: 4, borderBottomColor: '#9ccbe9',
    paddingVertical: 5, paddingLeft: 7, paddingRight: 10, maxWidth: '48%' },
  chipQuiet: { backgroundColor: '#e8f6ff' },
  chipAmount: { fontFamily: 'Shark', fontSize: 18, lineHeight: 20, color: '#05346e', fontVariant: ['tabular-nums'] },
  chipLabel: { fontFamily: 'Knockout', fontSize: 12, color: '#3d5f8c' },
  chipLabelQuiet: { fontSize: 11, lineHeight: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#ffcf3b', borderRadius: 12,
    borderWidth: 2, borderColor: '#ffffff', paddingVertical: 4, paddingHorizontal: 7, alignSelf: 'center' },
  badgeText: { fontFamily: 'Shark', fontSize: 15, color: '#05346e' },
  partsLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, backgroundColor: '#fff8e4', borderRadius: 14,
    borderWidth: 2, borderColor: '#ffffff', paddingVertical: 5, paddingHorizontal: 10 },
  partsTrack: { flex: 1, height: 12, borderRadius: 7, backgroundColor: '#bfe5ff', borderWidth: 2, borderColor: '#ffffff', overflow: 'hidden' },
  partsFill: { height: '100%', borderRadius: 7, backgroundColor: '#ffcf3b' },
  partsText: { fontFamily: 'Shark', fontSize: 14, color: '#05346e' },
  teamLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  teamText: { fontFamily: 'Knockout', fontSize: 16, color: '#ffffff', textAlign: 'center', flexShrink: 1,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0.1 },
  footerPlate: { alignSelf: 'stretch', backgroundColor: '#05346e', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 3, borderLeftWidth: 3, borderRightWidth: 3, borderColor: '#0879ca', paddingTop: 4 },
  footer: { width: (SW - 28) * 0.9, alignSelf: 'center', paddingTop: 6 },
  nextDetail: { fontFamily: 'Knockout', fontSize: 15, color: '#ffe07a', textAlign: 'center', marginBottom: 2 },
  secondary: { paddingVertical: 8, alignItems: 'center' },
  secondaryText: { color: '#ffffff', textAlign: 'center', fontFamily: 'Shark', fontSize: 17 },
  week: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: -2 },
  weekText: { fontFamily: 'Knockout', fontSize: 14, color: '#cdeaff' },
});
