import { useContext, useEffect, useRef, useState } from 'react';
import { openMembership } from './GrownUpGate';
import StarterOfferCard from './money/StarterOfferCard';
import { vipWinLine } from '../services/money/offers';
import { vipRideMultiplierNow, warmVipPerks } from '../services/money/vipPerks';
import OneTimeTip from './help/OneTimeTip';
import PerkChipRow from './coin/PerkChip';
import type { PerkChipData } from './coin/progressionModel';
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
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  FadeInDown,
  type SharedValue,
} from 'react-native-reanimated';
import Ribbon from './Ribbon';
import CoinCatchReveal, { type CatchHandoff } from './CoinCatchReveal';
import YellowButton from './YellowButton';
import ShelfCoin from './collection/ShelfCoin';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import type { EarnedCoinEdition, RideControlReward, RushReward } from '../api/endpoints/me/task-attempts';
import type { CollectionMilestones } from '../api/endpoints/me/ride-coins/milestones';
import { TEAMS } from '../constants/teams';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import type { StampData } from '../api/endpoints/me/stamps';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { playSfx } from '../gamekit/SFX';
import GameIcon from '../ui/GameIcon';
import type { GameIconName } from '../ui/iconNames';
import { milestoneHeadline, nextUnlockLine, partsProgress, rewardChips } from './rewards/postWinModel';
import { adsAvailable, rewardText, watchForReward } from '../services/ads';
import { hasWinNote, holdWinNotes, takeWinNote } from '../screens/LeaderboardsScreen/standingsCache';

const { width: SW } = Dimensions.get('window');
const HERO = 150;
/** The goal note stays in the footer after its moment, dimmed to this opacity. */
const GOAL_NOTE_SETTLED_OPACITY = 0.5;

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
  /** Ride Control outcome of this win (team power, flip, captain), or a nudge to pick a team. */
  rideControl?: RideControlReward | null;
  rush?: RushReward | null;
  /** Coin perk procs on this win (progression v2), exactly as the server returned them. */
  perks?: readonly PerkChipData[];
  playerId?: number | null;
  earnedStamp?: Pick<StampData, 'id' | 'name' | 'rewards'> | null;
  nextRideTicketEarned?: number;
  coinProgress?: RideCoinLevelType | null;
  playerEnergy?: number | null;
  /** What this win did for the park shelf (first coin, 25/50/75%, complete). */
  milestones?: CollectionMilestones | null;
  /** Opens the coin on its shelf; `true` asks to open mastery as soon as it lands. */
  onViewCoin?: (openMastery?: boolean) => void;
  onViewStampBook?: () => void;
  onHidden?: () => void;
  onClose: () => void;
  /** The won attempt, for the opt-in "double coins" offer. */
  attemptId?: number | null;
}

/* ─── Ride Control: what this win did for your team at the ride ─── */
function RideControlBanner({ result, playerId, onPickTeam }: {
  result: RideControlReward; playerId: number | null; onPickTeam: () => void;
}) {
  if (result.needs_team) {
    return (
      <TouchableOpacity accessibilityRole="button" onPress={onPickTeam} style={[styles.rcBanner, { borderColor: '#ffcf3b' }]}>
        <GameIcon name="crown" size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rcTitle}>CLAIM {(result.ride_name ?? 'THIS RIDE').toUpperCase()}</Text>
          <Text style={styles.rcBody}>Pick a team and your wins take rides for it.</Text>
        </View>
        <GameIcon name="arrow" size={24} />
      </TouchableOpacity>
    );
  }
  const team = TEAMS[result.team];
  const captain = result.captain !== null && result.captain === playerId;
  const title = result.flipped
    ? `${team.name.toUpperCase()} TOOK ${result.ride_name.toUpperCase()}`
    : result.controller === result.team ? `${team.name.toUpperCase()} HOLDS IT` : `+${result.points} FOR ${team.name.toUpperCase()}`;
  const body = [
    result.flipped || result.controller === result.team ? `+${result.points} points` : 'Keep going to take this ride',
    result.underdog ? 'extra points because your team is behind' : null,
    captain ? 'you’re the Captain' : null,
  ].filter(Boolean).join(', ');
  return (
    <View style={[styles.rcBanner, { borderColor: team.color }]}>
      <Image source={team.badge} style={styles.rcBadge} contentFit="contain" />
      <View style={{ flex: 1 }}>
        <Text style={styles.rcTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.rcBody}>{body}</Text>
      </View>
    </View>
  );
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
    };
    timer = setTimeout(tick, 34);
    return () => clearTimeout(timer);
  }, [value, start, reduced]);
  return <Text style={style}>+{shown.toLocaleString()}</Text>;
}

/* ─── One reward chip; pops in on the shared entrance clock ─── */
function RewardChip({ icon, amount, label, index, enter, reduced, started }: {
  icon: GameIconName; amount: number; label: string; index: number; enter: SharedValue<number>; reduced: boolean; started: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (enter.value - 0.35 - index * 0.08) / 0.3));
    return { opacity: t, transform: [{ translateY: (1 - t) * 14 }, { scale: 0.85 + 0.15 * t }] };
  });
  return (
    <Animated.View style={[styles.chip, style]} accessible accessibilityLabel={`${amount} ${label}`}>
      <GameIcon name={icon} size={26} />
      <View>
        <CountUp value={amount} start={started} reduced={reduced} style={styles.chipAmount} />
        <Text style={styles.chipLabel} numberOfLines={1}>{label}</Text>
      </View>
    </Animated.View>
  );
}

/* ─── Main component ─── */
/**
 * Opt-in "double coins": one rewarded ad for the Shark Coins from this win
 * again (VIP: no ad). Coins only, never XP or Parts; the server caps it.
 */
function DoubleCoinsOffer({ attemptId, vip, coins, onGranted }: {
  attemptId: number; vip: boolean; coins: number; onGranted: () => void;
}) {
  const [state, setState] = useState<'offer' | 'busy' | 'done' | 'gone'>('offer');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { setState('offer'); setNote(null); }, [attemptId]);
  if (state === 'gone') return null;
  const press = async () => {
    if (state !== 'offer') return;
    setState('busy');
    const outcome = await watchForReward('double_coins', attemptId, vip);
    if (outcome.status === 'granted') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNote(`${rewardText(outcome.reward.reward)} added`);
      setState('done');
      onGranted();
    } else if (outcome.status === 'checking') {
      setNote('Thanks for watching. Your coins land in a moment.');
      setState('done');
    } else if (outcome.status === 'skipped') {
      setState('offer');
    } else if (outcome.status === 'capped') {
      setNote('Double coins is done for today.');
      setState('done');
    } else {
      setState('gone');
    }
  };
  return (
    <Pressable style={styles.doubleChip} onPress={() => void press()} disabled={state !== 'offer'}
      accessibilityRole="button"
      accessibilityLabel={note ?? (vip ? `VIP gift: tap to get ${coins} more coins` : `Watch a short ad to get ${coins} more coins. You don't have to.`)}>
      <GameIcon name={state === 'done' ? 'check' : 'coins'} size={26} />
      <Text style={styles.doubleChipText} numberOfLines={2}>
        {note ?? (state === 'busy' ? 'One moment...' : vip ? `VIP gift: tap for +${coins} coins` : `Watch an ad for +${coins} coins`)}
      </Text>
      {state === 'offer' && <GameIcon name={vip ? 'member' : 'play'} size={20} />}
    </Pressable>
  );
}

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
  playerId,
  earnedStamp,
  nextRideTicketEarned = 0,
  coinProgress,
  playerEnergy,
  milestones,
  onViewCoin,
  onViewStampBook,
  onHidden,
  onClose,
  attemptId = null,
}: Props) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const afterHide = useRef<(() => void) | null>(null);
  useEffect(() => () => { afterHide.current = null; }, []);
  const closeTo = (destination: () => void) => { afterHide.current = destination; onClose(); };
  const isVip = !!player?.is_subscribed;
  // The VIP line quotes the server's own multiplier; loaded once per run.
  useEffect(() => { if (!isVip) void warmVipPerks(); }, [isVip]);
  const reducedMotion = useReducedGameMotion();
  const insets = useSafeAreaInsets();
  const hasCoin = typeof coinTimesCollected === 'number' && coinTimesCollected > 0;
  const isNewCoin = coinTimesCollected === 1;
  const [coinArtFailed, setCoinArtFailed] = useState(false);
  useEffect(() => { setCoinArtFailed(false); }, [taskCoinUrl, visible]);
  // The coin catch plays first and hands its coin to the summary's hero slot.
  const [caught, setCaught] = useState(false);
  // Standings: the weekly goal note lands on this screen right as the coin reveal ends.
  // It is drawn inside the modal (an app toast would sit under the native modal window).
  const [goalNote, setGoalNote] = useState<{ text: string; big: boolean } | null>(null);
  // A waiting note reserves its footer slot from the start, so the reward list
  // never shrinks when it lands (and does not grow back when it fades).
  const [noteSlot, setNoteSlot] = useState(false);
  const [noteSettled, setNoteSettled] = useState(false);
  const goalNoteOpacity = useSharedValue(1);
  const goalNoteStyle = useAnimatedStyle(() => ({ opacity: goalNoteOpacity.value }));
  useEffect(() => {
    holdWinNotes(visible);
    setNoteSlot(visible && hasWinNote());
    return () => holdWinNotes(false);
  }, [visible]);
  useEffect(() => {
    if (!caught || !visible) return;
    const note = takeWinNote();
    if (!note) return;
    setGoalNote(note);
    setNoteSettled(false);
    goalNoteOpacity.value = 1;
    if (note.big) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    // After its moment the note settles to a dimmed copy in place, so the
    // footer never shows a blank gap where it was.
    const timer = setTimeout(() => {
      setNoteSettled(true);
      goalNoteOpacity.value = reducedMotion ? GOAL_NOTE_SETTLED_OPACITY : withTiming(GOAL_NOTE_SETTLED_OPACITY, { duration: 450 });
    }, note.big ? 4200 : 2600);
    return () => clearTimeout(timer);
  }, [caught, visible]);
  useEffect(() => { if (!visible) setGoalNote(null); }, [visible]);
  const [handoff, setHandoff] = useState<CatchHandoff | null>(null);
  const heroRef = useRef<View>(null);
  useEffect(() => {
    if (!visible) { setCaught(false); setHandoff(null); }
    else if (!hasCoin) setCaught(true);
  }, [visible, hasCoin]);

  const parts = partsProgress(coinProgress ?? null, playerEnergy, ridePartsEarned);
  const upgradeReady = parts?.ready === true;
  const chips = rewardChips({ coinsEarned, xpEarned, ridePartsEarned, energyEarned });
  const headline = milestoneHeadline(milestones ?? null);
  const nextUnlock = nextUnlockLine(milestones ?? null);

  // One entrance clock for the whole summary (UI thread): card settle, hero
  // squash, chips, then the parts meter. Reduced motion jumps to the end.
  const enter = useSharedValue(reducedMotion ? 1 : 0);
  const heroSquash = useSharedValue(1);
  const burst = useSharedValue(0);
  const spin = useSharedValue(0);
  const partsFill = useSharedValue(parts ? parts.before : 0);
  const readyPop = useSharedValue(0);
  useEffect(() => {
    const values = [enter, heroSquash, burst, spin, partsFill, readyPop];
    if (!visible || !caught) { values.forEach(value => cancelAnimation(value)); return undefined; }
    if (reducedMotion) {
      enter.value = 1; heroSquash.value = 1; burst.value = 0; spin.value = 0;
      partsFill.value = parts ? parts.after : 0; readyPop.value = upgradeReady ? 1 : 0;
      return undefined;
    }
    enter.value = 0;
    enter.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
    // The coin arrives from the catch: land with a squash and settle.
    heroSquash.value = withSequence(withTiming(0.88, { duration: 80 }), withSpring(1, { damping: 6, stiffness: 240 }));
    burst.value = 0;
    burst.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
    spin.value = 0;
    if (isNewCoin) spin.value = withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1, false);
    if (parts) {
      partsFill.value = parts.before;
      partsFill.value = withDelay(650, withTiming(parts.after, { duration: 700, easing: Easing.out(Easing.cubic) }));
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (upgradeReady) {
      readyPop.value = 0;
      readyPop.value = withDelay(1400, withSpring(1, { damping: 7, stiffness: 200 }));
      timers.push(setTimeout(() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        playSfx('star', 0.8);
      }, 1400));
    }
    return () => { timers.forEach(clearTimeout); values.forEach(value => cancelAnimation(value)); };
  }, [visible, caught, reducedMotion]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 4),
    transform: [{ scale: 0.94 + 0.06 * Math.min(1, enter.value * 2.2) }],
  }));
  const heroStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: heroSquash.value }, { scaleX: 2 - heroSquash.value }] }));
  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }, { scale: 0.85 + 0.15 * enter.value }] }));
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
  const partsStyle = useAnimatedStyle(() => ({ width: `${Math.round(partsFill.value * 100)}%` }));
  // Pop by rising and fading in (a scaled view can leave its lip border mis-drawn on iOS).
  const readyStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, readyPop.value), transform: [{ translateY: (1 - readyPop.value) * 16 }] }));
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

  const coinSource = taskCoinUrl && !coinArtFailed ? taskCoinUrl : null;
  const primaryLabel = hasCoin && onViewCoin
    ? upgradeReady && !isNewCoin ? 'Upgrade Your Coin' : 'See It On Your Shelf'
    : 'Continue Park';

  return (
    <Modal
      animationIn="fadeIn"
      animationOut="fadeOut"
      isVisible={visible}
      style={{ margin: 0 }}
      animationInTiming={reducedMotion ? 120 : 250}
      animationOutTiming={reducedMotion ? 120 : 200}
      onBackButtonPress={caught ? onClose : undefined}
      onModalHide={() => {
        const next = afterHide.current; afterHide.current = null;
        onHidden?.(); next?.();
      }}
      onBackdropPress={caught ? onClose : undefined}
      backdropColor="#05346e"
      backdropOpacity={0.6}
    >
      {/* The summary is laid out under the catch (hidden) so its hero slot can be measured. */}
      <View style={{ flex: 1, opacity: caught ? 1 : 0 }} pointerEvents={caught ? 'auto' : 'none'}>
      <ScrollView style={styles.scroll}
        contentContainerStyle={[styles.container, {
          paddingTop: Math.max(insets.top, 20) + 8,
          paddingBottom: 16,
        }]}
        showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Ribbon text={headline?.ribbon ?? (hasCoin ? isNewCoin ? 'Coin Caught!' : 'Coin Added!' : 'Challenge Complete!')} />

          <View style={styles.content}>
            <Image source={require('../../assets/images/water_background.png')} contentFit="cover"
              style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} />

            {/* ── Hero coin ── */}
            <View style={styles.heroStage}>
              <Animated.View style={[styles.rays, raysStyle]} pointerEvents="none">
                <Image source={require('../../assets/images/screens/explore/starburst.png')} contentFit="contain"
                  style={{ width: HERO * 2.1, height: HERO * 2.1, opacity: 0.3 }} tintColor="#ffe07a" />
              </Animated.View>
              <Animated.View style={[styles.burstRing, burstStyle]} pointerEvents="none" />
              <Animated.View style={heroStyle}>
                <View ref={heroRef} collapsable={false} onLayout={measureHero} style={{ width: HERO, height: HERO }}>
                  {hasCoin
                    ? coinSource
                      ? <ShelfCoin coinUrl={coinSource} level={coinProgress?.current_level ?? 1} size={HERO} />
                      : <Image source={require('../../assets/icons/game/coin.png')} style={{ width: HERO, height: HERO }} contentFit="contain" />
                    : <View style={styles.heroCheck}><GameIcon name="check" size={96} /></View>}
                </View>
              </Animated.View>
              {coinSource && <Image source={coinSource} style={{ width: 1, height: 1, opacity: 0 }} onError={() => setCoinArtFailed(true)} />}
            </View>

            <Animated.View style={[{ alignItems: 'center' }, textStyle]}>
              <Text style={styles.heroEyebrow}>{hasCoin
                ? isNewCoin ? 'NEW RIDE COIN' : `COLLECTED ${coinTimesCollected} TIMES`
                : 'RIDE CHALLENGE COMPLETE'}</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>{rideName}</Text>
              {earnedEdition && <View style={styles.edition}>
                <GameIcon name="sparkle" size={18} />
                <Text style={styles.editionText} numberOfLines={2}>{earnedEdition.name} Edition, {earnedEdition.project_title}</Text>
              </View>}
              {headline && <View style={[styles.milestone, headline.big && styles.milestoneBig]}
                accessibilityRole="text" accessibilityLabel={`${headline.title}. ${headline.body}`}>
                <GameIcon name={headline.icon} size={headline.big ? 40 : 30} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.milestoneTitle}>{headline.title}</Text>
                  <Text style={styles.milestoneBody}>{headline.body}</Text>
                </View>
              </View>}
              {nextRideTicketEarned > 0 && (
                <View style={styles.ticketReward}>
                  <GameIcon name="ticket" size={26} />
                  <Text style={styles.nextRideTicket}>+{nextRideTicketEarned} {nextRideTicketEarned === 1 ? 'ticket' : 'tickets'} for your next ride</Text>
                </View>
              )}
            </Animated.View>

            {/* ── Confirmed rewards, always visible, counting up ── */}
            {chips.length > 0 && <View style={styles.chips}>
              {chips.map((chip, index) => <RewardChip key={chip.label} {...chip} index={index} enter={enter}
                reduced={reducedMotion} started={caught} />)}
            </View>}

            {/* Coin perk procs stamp in after the Parts count-up (server chips only). */}
            <PerkChipRow perks={perks} start={caught} reduced={reducedMotion} />

            <Animated.View style={lowerStyle}>
              {rush && (
                <View style={styles.rushBonus} accessibilityLabel={`Rush bonus: ${rush.bonus_parts} extra Ride Parts and ${rush.bonus_xp} extra XP`}>
                  <GameIcon name="rush" size={28} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rushBonusTitle}>RUSH BONUS</Text>
                    <Text style={styles.rushBonusBody}>
                      Short line: {rush.wait} min, not the usual {rush.typical}. +{rush.bonus_parts} Parts{rush.bonus_xp ? `, +${rush.bonus_xp} XP` : ''}
                    </Text>
                  </View>
                </View>
              )}

              {/* Repeat wins fill the coin's Ride Parts meter toward its next level. */}
              {parts && !isNewCoin && <View style={styles.partsCard}
                accessible accessibilityLabel={parts.ready ? 'Ready to level up' : `${parts.have} of ${parts.need} Ride Parts for level ${parts.nextLevel}`}>
                <View style={styles.partsHead}>
                  <GameIcon name="parts" size={24} />
                  <Text style={styles.partsTitle}>{parts.maxed ? 'MAX LEVEL' : `LEVEL ${parts.nextLevel} PARTS`}</Text>
                  <Text style={styles.partsCount}>{parts.maxed ? '' : `${parts.have}/${parts.need}`}</Text>
                </View>
                {!parts.maxed && <View style={styles.partsTrack}><Animated.View style={[styles.partsFill, partsStyle]} /></View>}
                {parts.ready && <Animated.View style={[{ alignSelf: 'stretch', alignItems: 'center', marginTop: 8 }, readyStyle]}>
                  <View style={styles.readyLip}>
                    <View style={styles.readyBadge}>
                      <GameIcon name="sparkle" size={20} />
                      <Text style={styles.readyText} numberOfLines={1}>READY TO LEVEL UP</Text>
                    </View>
                  </View>
                </Animated.View>}
                {!parts.ready && !parts.maxed && <Text style={styles.partsHint}>{parts.hint}</Text>}
              </View>}

              {rideControl && <RideControlBanner result={rideControl} playerId={playerId ?? null}
                onPickTeam={() => closeTo(() => RootNavigation.navigate('TeamSelection', {}))} />}

              {earnedStamp && (
                <TouchableOpacity style={styles.stampUnlock} onPress={onViewStampBook}
                  disabled={!onViewStampBook} accessibilityRole="button"
                  accessibilityLabel={`You got the ${earnedStamp.name} stamp. Open your Stamp Book to collect its prize.`}>
                  <Image source={require('../../assets/images/stamps/first-ride-coin-v1.png')}
                    style={styles.stampImage} contentFit="contain" />
                  <View style={styles.stampCopy}>
                    <Text style={styles.stampEyebrow}>NEW STAMP</Text>
                    <Text style={styles.stampName}>{earnedStamp.name}</Text>
                    <Text style={styles.stampReward}>
                      {`Get +${earnedStamp.rewards.energy} Energy and +${earnedStamp.rewards.xp} XP in your Stamp Book`}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {attemptId != null && coinsEarned > 0 && (isVip || adsAvailable()) && (
                <>
                  {/* The first ad offer a player meets says plainly that it is optional. */}
                  {!isVip && <OneTimeTip id="bonus_ads" ready={visible} compact style={{ alignSelf: 'stretch', marginBottom: 6 }} />}
                  <DoubleCoinsOffer attemptId={attemptId} vip={isVip} coins={coinsEarned}
                    onGranted={() => { void refreshPlayer?.(); }} />
                </>
              )}

              {!isVip && (xpEarned > 0 || coinsEarned > 0) && (
                <Pressable style={styles.vipChip} accessibilityRole="button"
                  accessibilityLabel="VIP members get extra XP and coins when they win. Tap to learn about VIP."
                  onPress={() => closeTo(() => { void openMembership(); })}>
                  <GameIcon name="member" size={26} />
                  <Text style={styles.vipChipText} numberOfLines={1}>
                    {vipWinLine(coinsEarned, xpEarned, vipRideMultiplierNow()) ?? 'VIP members get extra XP and coins'}
                  </Text>
                  <GameIcon name="arrow" size={20} />
                </Pressable>
              )}

              {/* The Starter Pack, once ever, at the first win: an earned moment, never a pop-up. */}
              {!isVip && coinsEarned > 0 && <StarterOfferCard ready={visible} />}

              {nextUnlock && <Text style={styles.hint}>{nextUnlock}</Text>}
            </Animated.View>
          </View>
        </Animated.View>
      </ScrollView>
      {/* The next action stays reachable on small phones while the card scrolls.
          It sits on a solid plate: bare text over the dimmed tab bar read as
          covered by the center compass button. */}
      <Animated.View testID="post-win-footer" style={[styles.footerPlate, { paddingBottom: Math.max(insets.bottom, 12) + 4 }, footerStyle]}>
        <View style={styles.footer}>
          {/* Standings goal note: in the footer flow above the button, so it never covers a reward card. */}
          {(noteSlot || goalNote) && (
            <View style={{ height: 50, alignItems: 'center', justifyContent: 'flex-start' }}>
              {goalNote && (
                <Animated.View entering={reducedMotion ? undefined : FadeInDown.springify().damping(14)}
                  accessibilityLiveRegion={noteSettled ? 'none' : 'polite'} accessibilityLabel={goalNote.text}
                  style={[goalNoteStyle, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 42,
                    borderRadius: 21, backgroundColor: goalNote.big ? '#ffcf3b' : '#ffffff', borderWidth: 3,
                    borderBottomWidth: 5, borderColor: goalNote.big ? '#d99a00' : '#7cc6f5' }]}>
                  <GameIcon name={goalNote.big ? 'star' : 'ride'} size={24} />
                  <Text style={{ fontFamily: 'Shark', fontSize: 17, color: '#05346e' }}>{goalNote.text}</Text>
                </Animated.View>
              )}
            </View>
          )}
          <YellowButton text={primaryLabel}
            onPress={hasCoin && onViewCoin ? () => onViewCoin(upgradeReady && !isNewCoin) : onClose} />
          {hasCoin && onViewCoin && (
            <TouchableOpacity onPress={onClose} accessibilityRole="button"
              accessibilityLabel="Go back to the park map" style={styles.continuePark}>
              <Text style={styles.continueParkText}>Continue Park</Text>
            </TouchableOpacity>
          )}
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
    borderRadius: 24, marginTop: '-10%', width: '92%', paddingHorizontal: 16, paddingTop: 30, paddingBottom: 14,
    borderWidth: 4, borderColor: '#ffffff', overflow: 'hidden', backgroundColor: '#0879ca',
    shadowColor: '#05346e', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 12,
  },
  heroStage: { height: HERO + 24, alignItems: 'center', justifyContent: 'center' },
  rays: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  burstRing: { position: 'absolute', width: HERO, height: HERO, borderRadius: HERO, borderWidth: 6, borderColor: '#fff3b0' },
  heroCheck: { width: HERO, height: HERO, borderRadius: HERO, backgroundColor: '#dff4ff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#ffffff' },
  heroEyebrow: { color: '#ffe07a', fontFamily: 'Shark', fontSize: 15, letterSpacing: 1, marginTop: 4,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  heroTitle: { color: '#ffffff', fontFamily: 'Shark', fontSize: 28, lineHeight: 33, textAlign: 'center', marginTop: 2,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
  edition: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: '#fff8e4', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4 },
  editionText: { fontFamily: 'Knockout', fontSize: 14, color: '#05346e', flexShrink: 1 },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', marginTop: 10,
    backgroundColor: '#fff4cc', borderRadius: 16, borderWidth: 3, borderColor: '#ffcf3b', paddingVertical: 8, paddingHorizontal: 12 },
  milestoneBig: { backgroundColor: '#ffcf3b', borderColor: '#ffffff', paddingVertical: 12 },
  milestoneTitle: { fontFamily: 'Shark', fontSize: 19, color: '#05346e' },
  milestoneBody: { fontFamily: 'Knockout', fontSize: 15, color: '#3d5f8c' },
  ticketReward: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  nextRideTicket: { color: '#ffffff', fontFamily: 'Knockout', fontSize: 16, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff8e4', borderRadius: 14,
    borderWidth: 2, borderColor: '#ffffff', borderBottomWidth: 4, borderBottomColor: '#9ccbe9',
    paddingVertical: 6, paddingLeft: 8, paddingRight: 12, minWidth: 92 },
  chipAmount: { fontFamily: 'Shark', fontSize: 20, lineHeight: 22, color: '#05346e', fontVariant: ['tabular-nums'] },
  chipLabel: { fontFamily: 'Knockout', fontSize: 12, color: '#3d5f8c' },
  rushBonus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: '#ffcf3b', borderRadius: 14,
    borderWidth: 3, borderColor: '#ffffff', paddingVertical: 6, paddingHorizontal: 10 },
  rushBonusTitle: { fontFamily: 'Shark', fontSize: 16, color: '#05346e' },
  rushBonusBody: { fontFamily: 'Knockout', fontSize: 14, color: '#05346e' },
  partsCard: { marginTop: 12, backgroundColor: '#fff8e4', borderRadius: 16, borderWidth: 3, borderColor: '#ffffff', padding: 10 },
  partsHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partsTitle: { flex: 1, fontFamily: 'Shark', fontSize: 16, color: '#05346e' },
  partsCount: { fontFamily: 'Shark', fontSize: 16, color: '#0768b9' },
  partsTrack: { height: 14, borderRadius: 8, backgroundColor: '#bfe5ff', borderWidth: 2, borderColor: '#ffffff', overflow: 'hidden', marginTop: 6 },
  partsFill: { height: '100%', borderRadius: 8, backgroundColor: '#ffcf3b' },
  partsHint: { fontFamily: 'Knockout', fontSize: 14, color: '#3d5f8c', marginTop: 5 },
  readyLip: { backgroundColor: '#d99a00', borderRadius: 14, paddingBottom: 4 },
  readyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffcf3b',
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  readyText: { fontFamily: 'Shark', fontSize: 16, color: '#05346e' },
  rcBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', borderWidth: 3,
    borderRadius: 16, padding: 10, marginTop: 12, backgroundColor: '#fff8e4' },
  rcBadge: { width: 44, height: 44 },
  rcTitle: { fontFamily: 'Shark', fontSize: 17, color: '#05346e' },
  rcBody: { fontFamily: 'Knockout', fontSize: 14, color: '#3d5f8c', marginTop: 2 },
  stampUnlock: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingHorizontal: 10,
    paddingVertical: 8, borderRadius: 15, borderWidth: 3, borderColor: '#ffcf3b', backgroundColor: '#fff8e4' },
  stampImage: { width: 62, height: 62 },
  stampCopy: { flex: 1 },
  stampEyebrow: { color: '#8a5a00', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.7 },
  stampName: { color: '#05346e', fontFamily: 'Shark', fontSize: 17 },
  stampReward: { color: '#3d5f8c', fontFamily: 'Knockout', fontSize: 14, marginTop: 2 },
  vipChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'center',
    backgroundColor: '#fff4cc', borderRadius: 14, borderWidth: 2, borderColor: '#ffcf3b', paddingVertical: 6, paddingHorizontal: 12 },
  vipChipText: { fontFamily: 'Knockout', fontSize: 15, color: '#05346e', flexShrink: 1 },
  doubleChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'center',
    backgroundColor: '#e4f7ff', borderRadius: 14, borderWidth: 2, borderColor: '#4cdcff', paddingVertical: 6, paddingHorizontal: 12 },
  doubleChipText: { fontFamily: 'Knockout', fontSize: 15, color: '#05346e', flexShrink: 1 },
  hint: { color: '#ffffff', fontFamily: 'Knockout', fontSize: 16, lineHeight: 20, textAlign: 'center', marginTop: 10,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0.1 },
  footerPlate: { alignSelf: 'stretch', backgroundColor: '#05346e', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 3, borderLeftWidth: 3, borderRightWidth: 3, borderColor: '#0879ca', paddingTop: 6 },
  footer: { width: (SW - 28) * 0.9, alignSelf: 'center', paddingTop: 8 },
  continuePark: { paddingVertical: 9, alignItems: 'center' },
  continueParkText: { color: '#ffffff', textAlign: 'center', fontFamily: 'Shark', fontSize: 17 },
});
