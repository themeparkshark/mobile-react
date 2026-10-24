import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import config from '../config';
import HoloCoinPreview from './HoloCoinPreview';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';
import CoinUpgradeDemo from './CoinUpgradeDemo';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { COIN_TIERS, coinTier, coinTierName } from '../constants/coinTiers';
import GameIcon from '../ui/GameIcon';
import { queueHaptic } from '../gamekit/Haptics';
import { playLimited, SFX_PRIORITY } from '../audio/sfxLimiter';
import { usePresentationSlot } from '../hooks/usePresentationQueue';
import type { LevelUpResult } from '../api/endpoints/me/ride-coins/level-up';
import CoinStand from './coin/CoinStand';
import Crowning from './coin/Crowning';
import LevelUpBurst from './coin/LevelUpBurst';
import PerkTrack from './coin/PerkTrack';
import Reanimated, { cancelAnimation as cancelUi, useAnimatedStyle, useSharedValue, withDelay as uiDelay,
  withRepeat as uiRepeat, withSequence as uiSequence, withSpring as uiSpring, withTiming as uiTiming } from 'react-native-reanimated';
import { GoldBurst, ShineSweep, SparkleBurst } from '../ui/GoldBurst';
import { DURATION, EASE, SLOW_SERVER_LABEL_MS, SPRING, levelUpPayoff, momentParticles } from '../ui/motionEasing';
import { usePowerBudget } from '../power';
import { LEVEL_UP_ACTS, levelRibbon, levelUpFx, perkChip, revealCard, type LevelUpFx, type LevelUpUnlocks } from './coin/progressionModel';
import type { CollectedRideCoin } from '../api/endpoints/me/ride-coins/show';

const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** "SEP 27" from an ISO time, read as a calendar day. */
function ridDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${SHORT_MONTHS[Number(match[2]) - 1] ?? ''} ${Number(match[3])}` : '';
}
import * as RootNavigation from '../RootNavigation';
import OneTimeTip from './help/OneTimeTip';
import CoinTopUpOffer from './money/CoinTopUpOffer';
import { storeAvailable } from '../services/purchases';
import { isDimFlashingLightsEnabled } from '../../modules/flash-safety';
import { FlexShareButton, SHARE_IN_MODALS, ShareStudioHost } from '../share';
import { useDevAutoPress } from '../share/devDrive';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
/** The success CTA's width: the card is 95% of (screen - 48), with 14 pt padding each side. */
const SUCCESS_CTA_WIDTH = (SCREEN_W - 48) * 0.95 - 28;

interface Props {
  visible: boolean;
  rideCoin: RideCoinLevelType | null;
  playerEnergy: number;
  playerParts: number;
  onClose: () => void;
  /** true / the server's level-up reply on success, false on failure. */
  onLevelUp: (rideCoinId: number) => Promise<boolean | LevelUpResult>;
  onFeature: (assetId: number | null) => Promise<boolean>;
  onPlayInLine?: () => void;
}

type ModalState = 'preview' | 'confirm' | 'leveling' | 'success' | 'maxed';

// Tier names, colours and looks come from the one tier token file.
const TIER_NAMES = COIN_TIERS.map(tier => tier.name);
const TIER_VISUAL_REWARDS = COIN_TIERS.map(tier => tier.look);
const TIER_COLORS = COIN_TIERS.map(tier => tier.ringDeep);
const TOP_TIER = COIN_TIERS.length - 1;

/** The one next step when a coin cannot power up yet (never a dead end). */
export function missingResourceAction(missingParts: number, missingEnergy: number): { label: string; kind: 'parts' | 'energy' } | null {
  if (missingParts > 0) return { label: `Get ${missingParts} Ride Part${missingParts === 1 ? '' : 's'}`, kind: 'parts' };
  if (missingEnergy > 0) return { label: `Find ${missingEnergy} Energy`, kind: 'energy' };
  return null;
}

export default function CoinLevelingModal({
  visible,
  rideCoin,
  playerEnergy,
  playerParts,
  onClose,
  onLevelUp,
  onFeature,
  onPlayInLine,
}: Props) {
  const [state, setState] = useState<ModalState>('preview');
  const [featured, setFeatured] = useState(false);
  const [featureBusy, setFeatureBusy] = useState(false);
  const featureBusyRef = useRef(false);
  const [featureError, setFeatureError] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const upgradeBusy = useRef(false);
  const mounted = useRef(true);
  const reducedMotion = useReducedGameMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const upgradeAnimations = useRef<Animated.CompositeAnimation[]>([]);
  const upgradeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopUiShowRef = useRef<() => void>(() => undefined);
  const stopUpgradeEffects = () => {
    stopUiShowRef.current();
    upgradeTimers.current.forEach(clearTimeout); upgradeTimers.current = [];
    upgradeAnimations.current.forEach(animation => animation.stop()); upgradeAnimations.current = [];
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopUpgradeEffects(); };
  }, []);
  const [holoVisible, setHoloVisible] = useState(false);
  const [showEditions, setShowEditions] = useState(false);
  const { refreshPlayer } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);

  // ── Animations ──
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(50)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  // The whole level-up runs on the UI thread on one engine (Reanimated, ui/motion.ts springs):
  // the coin's charge shake and punch, and the success card springing in.
  const coinPop = useSharedValue(1);
  const coinShake = useSharedValue(0);
  const successIn = useSharedValue(0);
  const coinStyle = useAnimatedStyle(() => ({ transform: [{ scale: coinPop.value }, { translateX: coinShake.value }] }));
  const successStyle = useAnimatedStyle(() => ({
    transform: [{ scale: Math.max(0, successIn.value) }, { rotate: `${-15 * (1 - Math.min(1, successIn.value))}deg` }],
  }));
  // Progression v2 level-up: three acts, the burst, the reveal and the Crowning.
  const [fx, setFx] = useState<LevelUpFx | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const [unlocks, setUnlocks] = useState<LevelUpUnlocks | null>(null);
  const [levelXp, setLevelXp] = useState(0);
  const [crowningId, setCrowningId] = useState<string | null>(null);
  const crowningSlot = usePresentationSlot(crowningId, 'crowning', 'coin_shelf');
  const pendingLinePlayRef = useRef(false);
  const pendingExploreRef = useRef(false);
  // Short on Tickets or Energy: the Supplies tab, opened after the sheet hides.
  const pendingSuppliesRef = useRef<null | 'tickets' | 'featured'>(null);
  const [showPartsHelp, setShowPartsHelp] = useState(false);

  // The level-up show, on the UI thread: the charge bar, the gold gathering behind the coin,
  // the burst bloom, sparkles and one shine across the new coin (ui/motion.ts language).
  const charge = useSharedValue(0);
  const gold = useSharedValue(0);
  const bloom = useSharedValue(0);
  const sparkle = useSharedValue(0);
  // Legendary and up: a second, wider sparkle wave a beat after the first.
  const sparkle2 = useSharedValue(0);
  const shine = useSharedValue(0);
  const bloomOut = useSharedValue(0);
  const budget = usePowerBudget();
  const [slowServer, setSlowServer] = useState(false);
  const stopUiShow = () => { [charge, gold, bloom, sparkle, sparkle2, shine, ringPulse, bloomOut, slow, coinShake].forEach(value => cancelUi(value)); };
  const chargeStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, charge.value) }] }));
  // 0 while charging, 1 once the server is slow (scheduled on the UI thread with the charge).
  const slow = useSharedValue(0);
  const poweringStyle = useAnimatedStyle(() => ({ opacity: 1 - slow.value }));
  const almostStyle = useAnimatedStyle(() => ({ opacity: slow.value, transform: [{ scale: 0.9 + 0.1 * slow.value }] }));
  // The payoff is bigger than the card: the gold and sparkles burst out past its edges and a
  // ring in the new tier's colour pulses outward. Anchored on the coin (measured, plain Views only).
  const rootRef = useRef<View>(null);
  const coinRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const ringPulse = useSharedValue(0);
  // How far the tier ring reaches grows with the tier (levelUpPayoff), so Legendary's ring is clearly the biggest.
  const ringReach = useSharedValue(0.9);
  const ringPulseStyle = useAnimatedStyle(() => ({
    opacity: ringPulse.value <= 0 || ringPulse.value >= 1 ? 0 : 1 - ringPulse.value,
    transform: [{ scale: 1 + ringPulse.value * ringReach.value }],
  }));
  const measureAnchor = () => {
    const root = rootRef.current; const coin = coinRef.current;
    if (!root || !coin) return;
    root.measureInWindow((rx, ry) => coin.measureInWindow((cx, cy, cw, ch) => {
      if ([rx, ry, cx, cy, cw, ch].every(Number.isFinite) && cw > 0) setAnchor({ x: cx - rx + cw / 2, y: cy - ry + ch / 2 });
    }));
  };
  stopUiShowRef.current = stopUiShow;

  // Staggered resource bar animations
  const energyBarAnim = useRef(new Animated.Value(0)).current;
  const partsBarAnim = useRef(new Animated.Value(0)).current;

  // ── Reset on open ──
  useEffect(() => {
    if (visible && rideCoin) {
      setFeatured(!!rideCoin.is_featured);
      setShowEditions(false);
      setFeatureError(false);
      setUpgradeError(null);
      setFx(null); setUnlocks(null); setLevelXp(0); setSlowServer(false);
      stopUiShow(); charge.value = 0; gold.value = 0; bloom.value = 0; sparkle.value = 0; sparkle2.value = 0; shine.value = 0; bloomOut.value = 0; ringPulse.value = 0; setAnchor(null);
      const isMax = rideCoin.current_level >= rideCoin.max_level;
      setState(isMax ? 'maxed' : 'preview');
    }
  }, [visible, rideCoin?.id]);

  useEffect(() => {
    if (!visible || !rideCoin) return;
    const energyPct = rideCoin.energy_to_next_level > 0
      ? Math.min(playerEnergy / rideCoin.energy_to_next_level, 1) : 1;
    const partsPct = rideCoin.parts_to_next_level > 0
      ? Math.min(playerParts / rideCoin.parts_to_next_level, 1) : 1;
    if (reducedMotion) {
      fadeIn.setValue(1); slideUp.setValue(0);
      energyBarAnim.setValue(energyPct); partsBarAnim.setValue(partsPct);
      successIn.value = 1; coinPop.value = 1;
      return;
    }
    fadeIn.setValue(0); slideUp.setValue(50);
    energyBarAnim.setValue(0); partsBarAnim.setValue(0);
    const entrance = Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]);
    const bars = Animated.stagger(100, [
      Animated.timing(energyBarAnim, { toValue: energyPct, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: false }),
      Animated.timing(partsBarAnim, { toValue: partsPct, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: false }),
    ]);
    entrance.start(); bars.start();
    return () => { entrance.stop(); bars.stop(); };
  }, [visible, rideCoin?.id, reducedMotion]);

  // The success card is mounted by setState('success'). Its spring starts only after that commit: a spring
  // started earlier can finish on the UI thread before a busy JS thread mounts the card, which then mounts
  // with the stale small scale and sits there (seen for over a second in release JS under load).
  useEffect(() => {
    if (state !== 'success') return;
    cancelUi(successIn);
    if (reducedMotionRef.current) { successIn.value = 1; return; }
    successIn.value = 0;
    successIn.value = uiSpring(1, SPRING.stamp);
  }, [state]);

  useEffect(() => {
    if (!reducedMotion) return;
    stopUpgradeEffects();
    cancelUi(coinPop); cancelUi(successIn);
    coinShake.value = 0; coinPop.value = 1; successIn.value = 1;
  }, [reducedMotion]);

  // Dev-only evidence driver (no-op in release builds). Every hook runs before the
  // `!rideCoin` return: TaskCoinModal mounts this sheet with no coin, so a hook after the
  // return ran only once a coin loaded ("Rendered more hooks", a fatal crash on coin tap).
  const levelUpPress = useRef<() => void>(() => undefined);
  useDevAutoPress(visible ? 'level_up' : 'level_up_off', () => levelUpPress.current(), 2500);

  if (!rideCoin) return null;

  const currentLevel = rideCoin.current_level;
  const nextLevel = Math.min(currentLevel + 1, rideCoin.max_level);
  const isMaxLevel = currentLevel >= rideCoin.max_level;
  const tierColor = TIER_COLORS[Math.min(currentLevel - 1, TOP_TIER)];
  const nextTierColor = TIER_COLORS[Math.min(nextLevel - 1, TOP_TIER)];
  const tierName = TIER_NAMES[Math.min(currentLevel - 1, TOP_TIER)];
  const nextTierName = TIER_NAMES[Math.min(nextLevel - 1, TOP_TIER)];
  const nextVisualReward = TIER_VISUAL_REWARDS[Math.min(nextLevel - 1, TOP_TIER)];
  const nextPayoff = levelUpPayoff(nextLevel);

  const reveal = state === 'success' ? revealCard(unlocks, levelXp) : null;
  const hasEnergy = playerEnergy >= rideCoin.energy_to_next_level;
  const hasParts = playerParts >= rideCoin.parts_to_next_level;
  const canLevelUp = !isMaxLevel && rideCoin.is_unlocked && hasEnergy && hasParts;
  const yourRides = (rideCoin as CollectedRideCoin).your_rides ?? null;
  const missingAction = rideCoin.is_unlocked && !isMaxLevel
    ? missingResourceAction(Math.max(0, rideCoin.parts_to_next_level - playerParts), Math.max(0, rideCoin.energy_to_next_level - playerEnergy))
    : null;

  // ── Level up sequence ──
  const handleLevelUp = async () => {
    if (!canLevelUp || upgradeBusy.current) return;
    upgradeBusy.current = true;
    setUpgradeError(null);

    setState('leveling');
    measureAnchor();
    setUnlocks(null);
    setLevelXp(0);
    const plan = levelUpFx(nextLevel, rideCoin.parts_to_next_level, { reducedMotion, dimFlashingLights: isDimFlashingLightsEnabled() });
    const payoff = levelUpPayoff(nextLevel);
    setFx(plan);

    // Phase 1: Coin shakes and charges up. The shake lasts exactly as long as the charge
    // (it used to run 20 loops, 1.6 s, and held the burst back behind it).
    const shakeLoops = Math.ceil(LEVEL_UP_ACTS.charge.end / 80);
    // The bar and the gold glow fill on the UI thread: a dark track with a bright gold fill that
    // eases to 85 percent over the charge, then creeps (never stuck) while a slow server answers.
    setSlowServer(false);
    stopUiShow(); bloom.value = 0; sparkle.value = 0; sparkle2.value = 0; shine.value = 0;
    charge.value = 0;
    gold.value = 0;
    if (!reducedMotion) {
      charge.value = uiSequence(uiTiming(0.85, { duration: LEVEL_UP_ACTS.charge.end, easing: EASE.out }),
        uiTiming(0.97, { duration: 5000, easing: EASE.out }));
      gold.value = uiTiming(0.45, { duration: LEVEL_UP_ACTS.charge.end, easing: EASE.charge });
    } else {
      charge.value = 0.85;
    }
    cancelUi(slow); slow.value = 0;
    slow.value = uiDelay(SLOW_SERVER_LABEL_MS, uiTiming(1, { duration: DURATION.quick }));
    upgradeTimers.current.push(setTimeout(() => { if (mounted.current) setSlowServer(true); }, SLOW_SERVER_LABEL_MS));

    // The charge always plays out in full so the pop lands at the peak, even
    // when the server answers instantly. Haptics climb with the charge.
    cancelUi(coinPop); cancelUi(successIn); successIn.value = 0;
    if (!reducedMotion) {
      coinShake.value = uiSequence(uiRepeat(uiSequence(uiTiming(4, { duration: 40 }), uiTiming(-4, { duration: 40 })), shakeLoops, false),
        uiTiming(0, { duration: 40 }));
      coinPop.value = uiTiming(1.12, { duration: LEVEL_UP_ACTS.charge.end, easing: EASE.inOut });
    }
    // The burst lands on the clock, not on the JS-driven shake finishing (a busy JS thread used
    // to stretch a 0.9 s charge to about 2 s). Not in upgradeTimers: it must always resolve.
    const charged = reducedMotion ? Promise.resolve() : new Promise<void>((resolve) => {
      setTimeout(resolve, LEVEL_UP_ACTS.charge.end);
    });
    // Light 300, Medium 600, Heavy 900 through the app-wide haptic gate.
    const chargeTicks = plan.haptics.filter(tick => tick.intent !== 'success')
      .map(tick => setTimeout(() => queueHaptic(tick.intent), tick.at));

    upgradeTimers.current.push(...chargeTicks);
    // Phase 2: Flash + success
    try {
      const [outcome] = await Promise.all([onLevelUp(rideCoin.id), charged]);
      stopUpgradeEffects();
      if (!mounted.current) return;
      const result = typeof outcome === 'object' && outcome ? outcome : null;
      const success = outcome === true || !!result?.success;

      if (success) {
        playLimited('coin-level-up', { priority: SFX_PRIORITY.land, durationMs: 900 },
          () => { playSound(require('../../assets/sounds/reward.mp3')); });
        queueHaptic('success');
        setUnlocks(result?.unlocks ?? null);
        setLevelXp(result?.xp ?? 0);
        setBurstKey(key => key + 1);
        // Level 10: the Crowning takes the screen when the PresentationQueue allows it.
        if (plan.crowning) setCrowningId(`crowning:${rideCoin.id}:${Date.now()}`);

        // Stop shake, big pop: the new coin punches to 1.35x, then springs home.
        cancelUi(coinShake); coinShake.value = 0;
        // The punch starts from wherever the charge left the coin (about 1.12x), never from a shrunken coin:
        // if a busy device holds a frame here, the kid still sees a big coin, not a half-size one.
        cancelUi(coinPop);
        setSlowServer(false);
        // Burst: the bar snaps full, the gold blooms and settles to a warm glow behind the new
        // coin, sparkles fly, and one shine sweeps the coin.
        charge.value = uiTiming(1, { duration: 120 });
        if (reducedMotionRef.current) {
          gold.value = 0.8;
          bloomOut.value = 0.5;
        } else {
          gold.value = uiTiming(1, { duration: 180, easing: EASE.out });
          bloom.value = uiSequence(uiTiming(1, { duration: 140, easing: EASE.out }), uiTiming(0, { duration: DURATION.bloom, easing: EASE.out }));
          sparkle.value = uiTiming(1, { duration: DURATION.sparkle });
          if (payoff.sparkleWaves === 2) sparkle2.value = uiDelay(240, uiTiming(1, { duration: DURATION.sparkle }));
          shine.value = uiDelay(380, uiTiming(1, { duration: 620, easing: EASE.inOut }));
          // The big fan peaks and then stays lit behind the card by tier: Legendary keeps most of it.
          bloomOut.value = uiSequence(uiTiming(payoff.fanPeak, { duration: 160, easing: EASE.out }),
            uiDelay(500, uiTiming(payoff.fanHold, { duration: 700, easing: EASE.out })));
          ringReach.value = payoff.ringReach;
          ringPulse.value = 0;
          ringPulse.value = uiSequence(uiTiming(0.001, { duration: 60 }), uiTiming(1, { duration: 700, easing: EASE.out }));
        }

        setState('success');

        if (reducedMotionRef.current) {
          coinPop.value = 1; successIn.value = 1;
        } else {
          coinPop.value = uiSequence(uiTiming(1.35, { duration: 140, easing: EASE.out }), uiSpring(1, SPRING.pop));
          // The success card springs in from an effect once it is mounted (see the state effect), never before.
        }

        // The server upgrade is already confirmed. A profile refresh failure must not
        // turn the successful purchase back into an apparent failed attempt.
        void refreshPlayer().catch(() => undefined);
      } else {
        throw new Error('Level up failed');
      }
    } catch (error) {
      stopUpgradeEffects();
      if (!mounted.current) return;
      const status = (error as { response?: { status?: number } })?.response?.status;
      setUpgradeError(status === 409
        ? 'This coin changed. Close its detail and reopen it to refresh your level.'
        : 'Your upgrade could not be confirmed. Check your connection and try again.');
      setState('preview');
      cancelUi(coinPop); coinShake.value = 0; coinPop.value = 1;
      progressAnim.setValue(0);
      charge.value = 0; gold.value = 0; bloomOut.value = 0; setSlowServer(false);
      queueHaptic('failBuzz');
    } finally {
      upgradeBusy.current = false;
    }
  };
  levelUpPress.current = () => { void handleLevelUp(); };


  const handleClose = () => {
    if (upgradeBusy.current) return;
    stopUpgradeEffects();
    if (reducedMotion) { onClose(); return; }
    const closing = Animated.timing(fadeIn, {
      toValue: 0, duration: 200, useNativeDriver: true,
    });
    upgradeAnimations.current.push(closing);
    closing.start(({ finished }) => {
      if (!finished || !mounted.current) return;
      setState('preview');
      cancelUi(coinPop); cancelUi(successIn); coinPop.value = 1; successIn.value = 0;
      progressAnim.setValue(0);
      charge.value = 0; gold.value = 0; bloomOut.value = 0;
      onClose();
    });
  };

  // ── Interpolations ──
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });
  const energyBarWidth = energyBarAnim.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });
  const partsBarWidth = partsBarAnim.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });

  return (
    <Modal
      animationIn="fadeIn"
      animationOut="fadeOut"
      isVisible={visible}
      animationInTiming={reducedMotion ? 120 : 250}
      animationOutTiming={reducedMotion ? 120 : 200}
      onBackButtonPress={state !== 'leveling' ? handleClose : undefined}
      onModalHide={() => {
        if (pendingLinePlayRef.current) {
          pendingLinePlayRef.current = false;
          onPlayInLine?.();
        }
        if (pendingExploreRef.current) {
          pendingExploreRef.current = false;
          RootNavigation.navigate('Explore');
        }
        if (pendingSuppliesRef.current) {
          const focus = pendingSuppliesRef.current;
          pendingSuppliesRef.current = null;
          RootNavigation.navigate('Store', { store: 'shark-shop', tab: 'supplies', focus });
        }
      }}
      onBackdropPress={state !== 'leveling' ? handleClose : undefined}
      backdropColor="#05346e"
      backdropOpacity={0.6}
      statusBarTranslucent
      style={{ margin: 0, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View ref={rootRef} collapsable={false} style={{
        opacity: fadeIn,
        transform: [{ translateY: slideUp }],
        width: SCREEN_W - 48,
        maxHeight: SCREEN_H * 0.82,
        alignItems: 'center',
      }}>
        {/* Behind the card: the big gold fan reaches past its edges on the success beat. */}
        {anchor && (state === 'leveling' || state === 'success') && (
          <View pointerEvents="none" style={{ position: 'absolute', left: anchor.x - SCREEN_W * 0.75, top: anchor.y - SCREEN_W * 0.75,
            width: SCREEN_W * 1.5, height: SCREEN_W * 1.5, alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
            {/* Never turns: a card left open must not spin a 1.5x screen layer (the small fan on the coin does). */}
            <GoldBurst size={SCREEN_W * 1.5} amount={bloomOut} bloom={bloom} spin={false} reduced={reducedMotion} />
          </View>
        )}
        {/* Above the card: sparkles fly out over its edges and the new tier's ring pulses outward. */}
        {/* Mounted from the start of the charge (hidden until the burst), so the success frame mounts nothing heavy. */}
        {anchor && (state === 'leveling' || state === 'success') && !reducedMotion && (
          <View pointerEvents="none" style={{ position: 'absolute', left: anchor.x, top: anchor.y, width: 0, height: 0,
            alignItems: 'center', justifyContent: 'center', zIndex: 30 }}>
            <Reanimated.View style={[{ position: 'absolute', width: 132, height: 132, borderRadius: 66, borderWidth: nextPayoff.ringWidth,
              borderColor: coinTier(nextLevel).ring }, ringPulseStyle]} />
            <SparkleBurst progress={sparkle} radius={SCREEN_W * 0.46} count={momentParticles(nextPayoff.sparkles, budget, reducedMotion)} />
            {nextPayoff.sparkleWaves === 2 && (
              <SparkleBurst progress={sparkle2} radius={SCREEN_W * 0.62} count={momentParticles(nextPayoff.sparkles, budget, reducedMotion)} />
            )}
          </View>
        )}
        {/* Always a visible way out (the backdrop is a thin strip on small phones). */}
        {state !== 'leveling' && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={handleClose} hitSlop={12}
            style={{ position: 'absolute', top: 58, right: 0, zIndex: 40 }}>
            <GameIcon name="close" size={34} />
          </TouchableOpacity>
        )}
        {/* ── Ribbon Header ── */}
        <Ribbon text={
          state === 'success' ? levelRibbon(nextLevel) :
          isMaxLevel ? tierName :
          rideCoin.ride_name
        } />

        {/* ── Main Card ── */}
        <View style={{
          backgroundColor: '#D9F5FF',
          marginTop: '-10%',
          width: '95%',
          zIndex: 10,
          borderRadius: 20,
          borderWidth: 2.5,
          borderColor: state === 'success' ? '#FFD363' : '#FFFFFF',
          shadowColor: state === 'success' ? nextTierColor : tierColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
          overflow: 'hidden',
        }}>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 14 }}
          >
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 185,
              backgroundColor: '#168AD7', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }} />
            <View style={{ position: 'absolute', top: 16, left: 20, width: 15, height: 15,
              borderRadius: 8, borderWidth: 2, borderColor: '#FFFFFF88' }} />
            <View style={{ position: 'absolute', top: 71, right: 25, width: 21, height: 21,
              borderRadius: 11, borderWidth: 2, borderColor: '#FFFFFF88' }} />
            <View style={{ position: 'absolute', top: 132, left: 40, width: 8, height: 8,
              borderRadius: 4, backgroundColor: '#FFFFFF88' }} />
              <View style={{ paddingTop: 6, paddingHorizontal: 14, paddingBottom: 4, alignItems: 'center' }}>

                {/* ── Coin Display with CoinUpgradeDemo ── */}
                <Reanimated.View style={[{ marginBottom: 0 }, coinStyle]}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => state !== 'leveling' && setHoloVisible(true)}
                  >
                    <View ref={coinRef} collapsable={false} style={{ alignItems: 'center', justifyContent: 'center', marginTop: (state === 'success' ? nextLevel : currentLevel) >= 10 ? 26 : 0,
                      marginBottom: (state === 'success' ? nextLevel : currentLevel) >= 6 ? 14 : 0 }}>
                      {(state === 'leveling' || state === 'success') && (
                        <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
                          <GoldBurst size={250} amount={gold} bloom={bloom} reduced={reducedMotion} />
                        </View>
                      )}
                      <CoinStand level={state === 'success' ? nextLevel : currentLevel} size={120} layer="stand" />
                      <CoinUpgradeDemo
                        level={state === 'success' ? nextLevel : currentLevel}
                        coinUrl={rideCoin.coin_url}
                        size={120}
                        showLabel={false}
                      />
                      {/* The tier is unmistakable: a thick two-tone rim in the tier's own colour (silver, gold, water blue). */}
                      <TierRim level={state === 'success' ? nextLevel : currentLevel} size={120} />
                      <CoinStand level={state === 'success' ? nextLevel : currentLevel} size={120} layer="crown" />
                      <LevelUpBurst fx={fx} size={120} playKey={burstKey} />
                      {(state === 'leveling' || state === 'success') && !reducedMotion && (
                        <>
                          <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
                            <ShineSweep progress={shine} size={104} />
                          </View>
                          <SparkleBurst progress={sparkle} radius={110} count={momentParticles(nextPayoff.sparkles, budget, reducedMotion)} />
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                </Reanimated.View>

                {/* ── Ride Name ── */}
                <Text style={{
                  fontFamily: 'Shark',
                  fontSize: 17,
                  color: '#17476B',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  marginBottom: 2,
                }}>
                  {state === 'success' ? 'YOUR COIN LEVELED UP'
                    : state === 'maxed' ? 'MAX LEVEL REACHED' : 'LEVEL UP YOUR COIN'}
                </Text>

                {/* Share Studio: a fresh Lv5-9 level-up (the Crowning has its own). A round button pinned
                    over the coin art's top-left corner, so it adds no height (the CTA stays on an SE screen). */}
                {SHARE_IN_MODALS && state === 'success' && nextLevel >= 5 && nextLevel < 10 && (
                  <FlexShareButton kind="coin_level" surface="coin_sheet" size="sm" caption style={{ position: 'absolute', left: 14, top: 30, zIndex: 5 }}
                    payload={{ coinUrl: rideCoin.coin_url, level: nextLevel, tierName: coinTierName(nextLevel), tierIndex: nextLevel, timesCollected: rideCoin.times_collected }} />
                )}

                {/* ── Level Badge Row (compact) ── */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 6,
                  gap: 6,
                }}>
                  <Text style={{
                    fontFamily: 'Shark',
                    fontSize: 15,
                    color: '#05346e',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>
                    Lv.{state === 'success' ? nextLevel : currentLevel} {state === 'success' ? nextTierName : tierName}
                  </Text>

                  {!isMaxLevel && state !== 'success' && (
                    <>
                      <GameIcon name="arrow" size={16} />
                      <Text style={{
                        fontFamily: 'Shark',
                        fontSize: 15,
                        color: '#a36609',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        opacity: 1,
                      }}>
                        Lv.{nextLevel} {nextTierName}
                      </Text>
                    </>
                  )}
                </View>

                {!!rideCoin.editions?.length && (state === 'preview' || state === 'maxed') && (
                  <TouchableOpacity accessibilityRole="button"
                    accessibilityLabel={`View ${rideCoin.editions.length} ride coin editions`}
                    onPress={() => setShowEditions(!showEditions)}
                    style={{ paddingVertical: 5, marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <GameIcon name="sparkle" size={16} />
                      <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: '#0768b9', textAlign: 'center' }}>
                        {showEditions ? 'Back to coin' : `${rideCoin.editions[0].name}, view ${rideCoin.editions.length}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {!!rideCoin.perk_track?.length && !showEditions && (state === 'preview' || state === 'maxed') && (
                  <PerkTrack track={rideCoin.perk_track} currentLevel={currentLevel} reduced={reducedMotion} />
                )}

                {/* ── Level Progress Dots ── */}
                {!rideCoin.perk_track?.length && <View style={{
                  flexDirection: 'row',
                  gap: 5,
                  marginBottom: 8,
                }}>
                  {Array.from({ length: rideCoin.max_level }).map((_, i) => {
                    const filled = state === 'success' ? i < nextLevel : i < currentLevel;
                    const dotColor = TIER_COLORS[Math.min(i, TOP_TIER)];
                    return (
                      <View key={i} style={{
                        width: 14, height: 14, borderRadius: 7,
                        backgroundColor: filled ? dotColor : '#FFFFFF',
                        borderWidth: 2,
                        borderColor: filled ? '#FFFFFF' : '#83B9D2',
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...(filled && Platform.OS === 'ios' ? {
                          shadowColor: dotColor,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.6,
                          shadowRadius: 4,
                        } : {}),
                      }}>
                        {filled && <GameIcon name="check" size={12} />}
                      </View>
                    );
                  })}
                </View>}

                {/* ── Your rides: the ride journal behind this coin ── */}
                {yourRides && yourRides.count > 0 && (state === 'preview' || state === 'maxed') && !showEditions && (
                  <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff',
                    borderWidth: 2, borderColor: '#bfe5ff', borderRadius: 12, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 8 }}
                    accessible accessibilityLabel={`You rode this ${yourRides.count} times.`}>
                    <GameIcon name="ride" size={28} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Shark', fontSize: 15, color: '#05346e' }}>
                        YOUR RIDES: {yourRides.count}{yourRides.last_rode_at ? `, LAST ${ridDay(yourRides.last_rode_at)}` : ''}
                      </Text>
                      {!!yourRides.last_memory && <Text numberOfLines={1} style={{ fontFamily: 'Knockout', fontSize: 14, color: '#3d5f8c' }}>
                        “{yourRides.last_memory}”
                      </Text>}
                    </View>
                    {yourRides.average_rating !== null && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <GameIcon name="star" size={18} />
                      <Text style={{ fontFamily: 'Shark', fontSize: 15, color: '#05346e' }}>{yourRides.average_rating.toFixed(1)}</Text>
                    </View>}
                  </View>
                )}

                {showEditions && (state === 'preview' || state === 'maxed') && (
                  <ScrollView style={{ maxHeight: 180, width: '100%', marginBottom: 10 }}
                    contentContainerStyle={{ gap: 7 }}>
                    {rideCoin.editions?.map(edition => <View key={edition.id} style={{
                      borderLeftWidth: 3, borderLeftColor: edition.color,
                      backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8,
                      paddingHorizontal: 10, paddingVertical: 6,
                    }}>
                      <Text style={{ color: edition.color, fontFamily: 'Knockout', fontSize: 14 }}>
                        {edition.name}
                      </Text>
                      <Text style={{ color: '#D5DFE8', fontFamily: 'Knockout', fontSize: 11 }}>
                        {edition.project_title} · {edition.source} · {new Date(edition.earned_at).toLocaleDateString()}
                      </Text>
                    </View>)}
                  </ScrollView>
                )}

                {!showEditions && (state === 'preview' || state === 'maxed') && (
                  <TouchableOpacity
                    disabled={featureBusy}
                    accessibilityRole="button"
                    accessibilityLabel={featured ? 'Remove featured ride coin from profile' : 'Feature ride coin on profile'}
                    onPress={async () => {
                      if (featureBusy || featureBusyRef.current) return;
                      featureBusyRef.current = true;
                      setFeatureBusy(true);
                      setFeatureError(false);
                      try {
                        const success = await onFeature(featured ? null : rideCoin.id);
                        if (success) setFeatured(!featured);
                        else setFeatureError(true);
                      } catch {
                        setFeatureError(true); // never leave the button stuck on Saving
                      } finally {
                        featureBusyRef.current = false;
                        setFeatureBusy(false);
                      }
                    }}
                    style={{ borderWidth: 2, borderColor: '#D99D24', backgroundColor: '#FFF5D6', borderRadius: 9,
                      paddingVertical: 7, paddingHorizontal: 13, marginBottom: 8 }}>
                    <Text style={{ color: '#795015', fontFamily: 'Knockout', fontSize: 13,
                      textAlign: 'center' }}>
                      {featureBusy ? 'Saving…' : featured ? 'Featured on your Profile. Remove' : 'Feature on your Profile'}
                    </Text>
                  </TouchableOpacity>
                )}
                {featureError && <Text style={{ color: '#FF9B9B', fontSize: 12, marginBottom: 6 }}>
                  Could not save your featured coin. Try again.
                </Text>}

                {/* ══════════════════════════════════════ */}
                {/* ── PREVIEW / CONFIRM STATE ── */}
                {/* ══════════════════════════════════════ */}
                {!showEditions && (state === 'preview' || state === 'confirm') && !isMaxLevel && (
                  <>
                    {/* ── Upgrade Cost Section ── */}
                    <View style={{
                      width: '100%',
                      backgroundColor: '#FFFFFF',
                      borderWidth: 2,
                      borderColor: '#79C7EB',
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 12,
                    }}>
                      {/* Section Header */}
                      <Text style={{
                        fontFamily: 'Knockout',
                        fontSize: 11,
                        color: '#14517E',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 10,
                        textAlign: 'center',
                      }}>
                        Level-Up Cost
                      </Text>

                      {/* Cost Row */}
                      <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-around',
                        marginBottom: 14,
                      }}>
                        {/* Energy Cost */}
                        <View style={{ alignItems: 'center' }}>
                          <Image source={require('../../assets/images/energy.png')} style={{ width: 29, height: 29, marginBottom: 4 }} contentFit="contain" />
                          <Text style={{
                            fontFamily: 'Shark',
                            fontSize: 22,
                            color: '#173F65',
                          }}>
                            {rideCoin.energy_to_next_level}
                          </Text>
                          <Text style={{
                            fontFamily: 'Knockout',
                            fontSize: 10,
                            color: '#3B7197',
                            textTransform: 'uppercase',
                          }}>
                            Energy
                          </Text>
                        </View>

                        {/* Divider */}
                        <View style={{
                          width: 1,
                          backgroundColor: '#B9DDEC',
                          marginVertical: 4,
                        }} />

                        {/* Ride Parts Cost */}
                        <View style={{ alignItems: 'center' }}>
                          <Image source={require('../../assets/images/ride-parts.png')} style={{ width: 29, height: 29, marginBottom: 4 }} contentFit="contain" />
                          <Text style={{
                            fontFamily: 'Shark',
                            fontSize: 22,
                            color: '#173F65',
                          }}>
                            {rideCoin.parts_to_next_level}
                          </Text>
                          <Text style={{
                            fontFamily: 'Knockout',
                            fontSize: 10,
                            color: '#3B7197',
                            textTransform: 'uppercase',
                          }}>
                            Ride Parts
                          </Text>
                        </View>
                      </View>

                      {/* Divider Line */}
                      <View style={{
                        height: 1,
                        backgroundColor: '#B9DDEC',
                        marginBottom: 10,
                      }} />

                      {/* Your Balance Section */}
                      <Text style={{
                        fontFamily: 'Knockout',
                        fontSize: 11,
                        color: '#14517E',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 8,
                        textAlign: 'center',
                      }}>
                        You Have
                      </Text>

                      {/* Balance Row */}
                      <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-around',
                      }}>
                        {/* Energy Balance */}
                        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
                          <Image source={require('../../assets/images/energy.png')} style={{ width: 20, height: 20 }} contentFit="contain" />
                          <Text style={{
                            fontFamily: 'Shark',
                            fontSize: 18,
                            color: hasEnergy ? '#168052' : '#B43D42',
                          }}>
                            {playerEnergy.toLocaleString()}
                          </Text>
                          {hasEnergy && <GameIcon name="check" size={16} />}
                        </View>

                        {/* Ride Parts Balance */}
                        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
                          <Image source={require('../../assets/images/ride-parts.png')} style={{ width: 20, height: 20 }} contentFit="contain" />
                          <Text style={{
                            fontFamily: 'Shark',
                            fontSize: 18,
                            color: hasParts ? '#168052' : '#B43D42',
                          }}>
                            {playerParts.toLocaleString()}
                          </Text>
                          {hasParts && <GameIcon name="check" size={16} />}
                        </View>
                      </View>
                    </View>

                    <View style={{ width: '100%', backgroundColor: '#FFF4CE', borderWidth: 2,
                      borderColor: '#F3C657', borderRadius: 12, padding: 11, marginBottom: 12 }}>
                      <Text style={{ fontFamily: 'Shark', color: '#825414', fontSize: 15,
                        textAlign: 'center', marginBottom: 6 }}>NEXT LEVEL UNLOCKS</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Image source={require('../../assets/images/coingold.png')}
                          style={{ width: 31, height: 31 }} contentFit="contain" />
                        <Text style={{ flex: 1, fontFamily: 'Knockout', fontSize: 14,
                          color: '#19496B' }}>{nextVisualReward}</Text>
                      </View>
                      {rideCoin.next_level_perks.length > 0 && (
                        <View style={{ marginTop: 7, borderTopWidth: 1, borderTopColor: '#EBC970',
                          paddingTop: 7 }}>
                        {rideCoin.next_level_perks.map(perk => (
                          <View key={perk.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <GameIcon name="star" size={16} />
                            <Text style={{ flex: 1, fontFamily: 'Knockout', fontSize: 14, color: '#19496B' }}>{perk.description}</Text>
                          </View>
                        ))}
                        </View>
                      )}
                    </View>

                    {upgradeError && <View accessibilityRole="alert" style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
                      backgroundColor: '#FFF1C5', borderColor: '#F4C453', borderWidth: 2,
                      borderRadius: 12, padding: 10,
                    }}>
                      <Image source={require('../../assets/images/ride-parts.png')}
                        style={{ width: 28, height: 28 }} contentFit="contain" />
                      <Text style={{ flex: 1, fontFamily: 'Knockout', fontSize: 13, color: '#17476B' }}>
                        {upgradeError}
                      </Text>
                    </View>}
                    {/* First look at a coin card: what leveling costs and does, once. */}
                    <OneTimeTip id="coin_card" ready={visible && state === 'preview'} compact
                      style={{ alignSelf: 'stretch', marginBottom: 8 }} />
                    {/* ── Level Up Button ── */}
                    {canLevelUp || !missingAction ? <YellowButton
                      text="Level Up!"
                      disabled={!canLevelUp}
                      onPress={handleLevelUp}
                    /> : <YellowButton
                      text={missingAction.label}
                      onPress={() => {
                        if (missingAction.kind === 'parts' && onPlayInLine) {
                          pendingLinePlayRef.current = true; handleClose();
                        } else if (missingAction.kind === 'energy') {
                          pendingExploreRef.current = true; handleClose();
                        } else {
                          setShowPartsHelp(true);
                        }
                      }}
                    />}

                    {/* Helper text for what you're missing */}
                    {!canLevelUp && (
                      <Text style={{
                        fontFamily: 'Knockout', fontSize: 11,
                        color: '#315D7B',
                        textAlign: 'center', marginTop: 8,
                      }}>
                        {!hasParts
                          ? showPartsHelp || !onPlayInLine
                            ? 'Win this ride again or play LinePlay in its line to earn Ride Parts.'
                            : 'Play LinePlay in this line to earn Ride Parts.'
                          : 'Energy comes from finds on your home map.'}
                      </Text>
                    )}
                    {/* Ride Parts are earned at the ride and never sold. The shop
                        only helps with what is sold: Tickets for more ride
                        challenges, or Energy. */}
                    {/* Short only on energy: the one pack that covers it, right here (grown-up gated). */}
                    {!canLevelUp && !isMaxLevel && rideCoin.is_unlocked && storeAvailable() && hasParts && !hasEnergy && (
                      <CoinTopUpOffer currency="energy" reason="level-up" need={Math.max(1, rideCoin.energy_to_next_level - playerEnergy)}
                        style={{ marginTop: 8 }} />
                    )}
                    {!canLevelUp && !isMaxLevel && rideCoin.is_unlocked && storeAvailable() && !hasParts && (
                      <TouchableOpacity onPress={() => { pendingSuppliesRef.current = !hasParts ? 'tickets' : 'featured'; handleClose(); }}
                        accessibilityRole="button" hitSlop={8}
                        accessibilityLabel={!hasParts ? 'Get tickets in Supplies. A grown-up buys these with real money.' : 'See Supplies packs with energy. A grown-up buys these with real money.'}>
                        <Text style={{ fontFamily: 'Knockout', fontSize: 13, color: '#0B5FA8', textAlign: 'center',
                          marginTop: 6, textDecorationLine: 'underline' }}>
                          {!hasParts ? 'Out of tickets? Get more in Supplies (real money)' : 'Need energy? Supplies packs have it (real money)'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {/* ══════════════════════════════════════ */}
                {/* ── LEVELING STATE ── */}
                {/* ══════════════════════════════════════ */}
                {state === 'leveling' && (
                  <View style={{ alignSelf: 'stretch', alignItems: 'center', paddingVertical: 18 }}
                    accessible accessibilityLiveRegion="polite"
                    accessibilityLabel={slowServer ? 'Almost there' : 'Powering up your coin'}>
                    {/* A dark track with a bright gold fill: easy to see on the pale card. */}
                    <View style={{
                      width: '82%', height: 22, borderRadius: 11,
                      backgroundColor: '#0b3a66', borderWidth: 3, borderColor: '#ffffff',
                      overflow: 'hidden', marginBottom: 12,
                    }}>
                      <Reanimated.View style={[{
                        position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%',
                        backgroundColor: '#ffcf3b', transformOrigin: 'left',
                      }, chargeStyle]}>
                        <View style={{ position: 'absolute', left: 0, right: 0, top: 2, height: 5, borderRadius: 3,
                          backgroundColor: '#fff2b0' }} />
                      </Reanimated.View>
                    </View>
                    {/* The label swaps on the UI thread (a starved JS thread can't hold it on Powering up!). */}
                    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                      <Reanimated.Text style={[LABEL_STYLE, poweringStyle]}>Powering up!</Reanimated.Text>
                      <Reanimated.Text style={[LABEL_STYLE, { position: 'absolute' }, almostStyle]}>Almost there!</Reanimated.Text>
                    </View>
                  </View>
                )}

                {/* ══════════════════════════════════════ */}
                {/* ── SUCCESS STATE ── */}
                {/* ══════════════════════════════════════ */}
                {state === 'success' && (
                  <Reanimated.View style={[{ alignItems: 'center', paddingVertical: 10 }, successStyle]}>
                    {/* New tier announcement */}
                    <View style={{
                      backgroundColor: '#FFF5D6',
                      borderWidth: 2,
                      borderColor: '#F3C657',
                      borderRadius: 18,
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      alignItems: 'center',
                      marginBottom: 16,
                      width: '100%',
                    }}>
                      {/* The tier first, as a big chip in the tier's own metal (silver, gold, water blue, orange):
                          a kid who cannot read yet still sees which coin they made. */}
                      <View accessibilityRole="header" accessibilityLabel={`${nextTierName}, Level ${nextLevel}`}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: coinTier(nextLevel).ring,
                          borderColor: coinTier(nextLevel).ringDeep, borderWidth: 4, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 6 }}>
                        <Text style={{ fontFamily: 'Shark', fontSize: 30, color: '#05346e', textTransform: 'uppercase', paddingTop: 3 }}>
                          {nextTierName}
                        </Text>
                        <View style={{ backgroundColor: '#05346e', borderRadius: 14, minWidth: 34, height: 34, alignItems: 'center',
                          justifyContent: 'center', paddingHorizontal: 6 }}>
                          <Text style={{ fontFamily: 'Shark', fontSize: 20, color: '#ffffff', paddingTop: 2 }}>{nextLevel}</Text>
                        </View>
                      </View>
                      <Text style={{ fontFamily: 'Knockout', fontSize: 14,
                        color: '#19496B', marginTop: 8, textAlign: 'center' }}>
                        {nextVisualReward}
                      </Text>

                      {/* Progression v2 reveal: the perk or milestone card and its chips (server data). */}
                      {reveal && (
                        <View style={{ marginTop: 10, width: '100%', backgroundColor: '#ffffff', borderRadius: 12,
                          borderWidth: 2, borderColor: '#ffcf3b', padding: 10, alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Shark', fontSize: 16, color: '#05346e', textAlign: 'center' }}>{reveal.title}</Text>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: '#19496B', textAlign: 'center', marginTop: 2 }}>{reveal.line}</Text>
                          {reveal.chips.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 6 }}>
                            {reveal.chips.map(chip => <Text key={chip} style={{ fontFamily: 'Shark', fontSize: 13, color: '#05346e',
                              backgroundColor: '#fff5d6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' }}>{chip}</Text>)}
                          </View>}
                        </View>
                      )}

                      {/* New bonuses (legacy curve): a picture and a big number each ("+500" with a trophy),
                          the full sentence is read out by VoiceOver. */}
                      {!reveal && rideCoin.next_level_perks.length > 0 && (
                        <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                          {rideCoin.next_level_perks.map((perk) => {
                            const chip = perkChip(perk);
                            return (
                              <View key={perk.id} accessible accessibilityLabel={`New bonus: ${perk.description}`}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffffff', borderRadius: 16,
                                  borderWidth: 2, borderColor: '#ffcf3b', paddingHorizontal: 12, paddingVertical: 5 }}>
                                <GameIcon name={chip.icon} size={26} />
                                <Text style={{ fontFamily: 'Shark', fontSize: 20, color: '#05346e', paddingTop: 2 }}>{chip.label}</Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>

                    <OneTimeTip id="first_level_up" ready={visible && state === 'success'} compact
                      style={{ alignSelf: 'stretch', marginBottom: 8 }} />
                    {/* The label shows on the first success frame (its size is known up front, no wait on a layout pass). */}
                    <YellowButton text="Awesome!" onPress={handleClose} estimatedWidth={SUCCESS_CTA_WIDTH} />
                  </Reanimated.View>
                )}

                {/* ══════════════════════════════════════ */}
                {/* ── MAX LEVEL STATE ── */}
                {/* ══════════════════════════════════════ */}
                {state === 'maxed' && !showEditions && (
                  <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                    <View style={{
                      backgroundColor: '#FFF5D6',
                      borderWidth: 2,
                      borderColor: 'rgba(249,115,22,0.4)',
                      borderRadius: 18,
                      paddingHorizontal: 20,
                      paddingVertical: 16,
                      alignItems: 'center',
                      width: '100%',
                      marginBottom: 16,
                    }}>
                      <Text style={{
                        fontFamily: 'Shark', fontSize: 24,
                        color: '#9D6300',
                        marginBottom: 4,
                      }}>
                        {tierName.toUpperCase()}
                      </Text>
                      <Text style={{
                        fontFamily: 'Knockout', fontSize: 14,
                        color: '#315D7B',
                        textAlign: 'center',
                        marginBottom: 12,
                      }}>
                        This coin is at its top level!
                      </Text>
                      {typeof rideCoin.parts_banked === 'number' && (
                        <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: '#19496B', textAlign: 'center', marginBottom: 8 }}>
                          Parts saved: {rideCoin.parts_banked}{rideCoin.polish?.next_cost ? `. Next Trophy Polish: ${rideCoin.polish.next_cost} Parts` : ''}
                        </Text>
                      )}

                      {/* All perks */}
                      {rideCoin.current_perks.length > 0 && (
                        <View style={{ width: '100%' }}>
                          {rideCoin.current_perks.map((perk) => (
                            <View key={perk.id} style={{
                              flexDirection: 'row', alignItems: 'center', marginBottom: 4,
                            }}>
                              <View style={{ marginRight: 8 }}><GameIcon name="trophy" size={18} /></View>
                              <Text style={{
                                fontFamily: 'Knockout', fontSize: 14, color: '#19496B',
                              }}>
                                {perk.description}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

                    <Text style={{
                      fontFamily: 'Knockout', fontSize: 12,
                      color: '#315D7B',
                      textAlign: 'center', marginBottom: 16,
                    }}>
                      {rideCoin.editions?.length
                        ? `${rideCoin.editions.length} project editions earned`
                        : `Level ${rideCoin.current_level} of ${rideCoin.max_level}`}
                    </Text>

                    <YellowButton text="Nice!" onPress={handleClose} />
                  </View>
                )}

                {onPlayInLine && !showEditions && (state === 'preview' || state === 'maxed') &&
                  <TouchableOpacity accessibilityRole="button"
                    accessibilityLabel={`Play LinePlay for ${rideCoin.ride_name}`}
                    onPress={() => { pendingLinePlayRef.current = true; handleClose(); }}
                    style={{ alignSelf: 'center', paddingVertical: 10, marginTop: 5 }}>
                    <Text style={{ color: '#075b9b', fontFamily: 'Shark', fontSize: 15,
                      textDecorationLine: 'underline' }}>Waiting here? Play in Line</Text>
                  </TouchableOpacity>}

              </View>
          </ScrollView>
        </View>
      </Animated.View>

      {crowningSlot.visible && (
        <Crowning rideName={rideCoin.ride_name} coinUrl={rideCoin.coin_url} boss={rideCoin.boss ?? null}
          reduced={reducedMotion} playSound={playSound}
          onDone={() => { crowningSlot.done(); setCrowningId(null); }} />
      )}

      <HoloCoinPreview
        visible={holoVisible}
        coinUrl={rideCoin.coin_url}
        name={rideCoin.ride_name}
        onClose={() => setHoloVisible(false)}
      />
      {/* Share Studio presents from inside this modal (a root sheet can't present over it on iOS). */}
      {SHARE_IN_MODALS && visible && <ShareStudioHost portal />}
    </Modal>
  );
}

/** A bold two-tone rim over the coin in its tier's colours, so Level 2 reads silver and Level 3 gold at a glance. */
function TierRim({ level, size }: { readonly level: number; readonly size: number }) {
  const tier = coinTier(level);
  if (tier.level < 2) return null;
  // A metal band: a dark outer edge, a thick band in the tier colour and a bright inner lip.
  const d = size + 16;
  const band = d - 6;
  const lip = band - 16;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: d, height: d, borderRadius: d / 2, borderWidth: 3,
      borderColor: tier.ringDeep, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: band, height: band, borderRadius: band / 2, borderWidth: 8, borderColor: tier.ring,
        alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: lip, height: lip, borderRadius: lip / 2, borderWidth: 2, borderColor: tier.ringDeep }} />
      </View>
    </View>
  );
}

const LABEL_STYLE = { fontFamily: 'Shark', fontSize: 22, color: '#05346e', textTransform: 'uppercase' } as const;
