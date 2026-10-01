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
import { COIN_TIERS, coinTier } from '../constants/coinTiers';
import GameIcon from '../ui/GameIcon';
import { queueHaptic } from '../gamekit/Haptics';
import { playLimited, SFX_PRIORITY } from '../audio/sfxLimiter';
import { usePresentationSlot } from '../hooks/usePresentationQueue';
import type { LevelUpResult } from '../api/endpoints/me/ride-coins/level-up';
import CoinStand from './coin/CoinStand';
import Crowning from './coin/Crowning';
import LevelUpBurst from './coin/LevelUpBurst';
import PerkTrack from './coin/PerkTrack';
import { LEVEL_UP_ACTS, levelRibbon, levelUpFx, revealCard, type LevelUpFx, type LevelUpUnlocks } from './coin/progressionModel';
import type { CollectedRideCoin } from '../api/endpoints/me/ride-coins/show';

const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** "SEP 27" from an ISO time, read as a calendar day. */
function ridDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${SHORT_MONTHS[Number(match[2]) - 1] ?? ''} ${Number(match[3])}` : '';
}
import * as RootNavigation from '../RootNavigation';
import OneTimeTip from './help/OneTimeTip';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

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
  const [featureError, setFeatureError] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const upgradeBusy = useRef(false);
  const mounted = useRef(true);
  const reducedMotion = useReducedGameMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const upgradeAnimations = useRef<Animated.CompositeAnimation[]>([]);
  const upgradeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopUpgradeEffects = () => {
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
  const coinScale = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const successRotate = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  // Progression v2 level-up: three acts, the burst, the reveal and the Crowning.
  const [fx, setFx] = useState<LevelUpFx | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const [unlocks, setUnlocks] = useState<LevelUpUnlocks | null>(null);
  const [levelXp, setLevelXp] = useState(0);
  const [crowningId, setCrowningId] = useState<string | null>(null);
  const crowningSlot = usePresentationSlot(crowningId, 'crowning', 'coin_shelf');
  const pendingLinePlayRef = useRef(false);
  const pendingExploreRef = useRef(false);
  const [showPartsHelp, setShowPartsHelp] = useState(false);

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
      setFx(null); setUnlocks(null); setLevelXp(0);
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
      successScale.setValue(1); successRotate.setValue(1); coinScale.setValue(1);
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

  useEffect(() => {
    if (!reducedMotion) return;
    stopUpgradeEffects();
    shakeAnim.setValue(0); coinScale.setValue(1);
    successScale.setValue(1); successRotate.setValue(1);
  }, [reducedMotion]);

  if (!rideCoin) return null;

  const currentLevel = rideCoin.current_level;
  const nextLevel = Math.min(currentLevel + 1, rideCoin.max_level);
  const isMaxLevel = currentLevel >= rideCoin.max_level;
  const tierColor = TIER_COLORS[Math.min(currentLevel - 1, TOP_TIER)];
  const nextTierColor = TIER_COLORS[Math.min(nextLevel - 1, TOP_TIER)];
  const tierName = TIER_NAMES[Math.min(currentLevel - 1, TOP_TIER)];
  const nextTierName = TIER_NAMES[Math.min(nextLevel - 1, TOP_TIER)];
  const nextVisualReward = TIER_VISUAL_REWARDS[Math.min(nextLevel - 1, TOP_TIER)];

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
    setUnlocks(null);
    setLevelXp(0);
    const plan = levelUpFx(nextLevel, rideCoin.parts_to_next_level, { reducedMotion });
    setFx(plan);

    // Phase 1: Coin shakes and charges up
    const shake = Animated.loop(
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 4, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -4, duration: 40, useNativeDriver: true }),
      ]),
      { iterations: 20 }
    );

    const chargeUp = Animated.timing(progressAnim, {
      toValue: 1,
      duration: LEVEL_UP_ACTS.charge.end,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    });

    const scaleUp = Animated.timing(coinScale, {
      toValue: 1.12,
      duration: LEVEL_UP_ACTS.charge.end,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });

    // The charge always plays out in full so the pop lands at the peak, even
    // when the server answers instantly. Haptics climb with the charge.
    const charge = Animated.parallel([shake, chargeUp, scaleUp]);
    upgradeAnimations.current.push(charge);
    const charged = reducedMotion ? Promise.resolve() : new Promise<void>((resolve) => {
      charge.start(() => resolve());
    });
    // Light 300, Medium 600, Heavy 900 through the app-wide haptic gate.
    const chargeTicks = plan.haptics.filter(tick => tick.intent !== 'success')
      .map(tick => setTimeout(() => queueHaptic(tick.intent), tick.at));

    upgradeTimers.current = chargeTicks;
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

        // Stop shake, big pop
        shakeAnim.setValue(0);
        coinScale.setValue(0.5);

        setState('success');

        const celebration = Animated.parallel([
          Animated.spring(coinScale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
          Animated.spring(successScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
          Animated.timing(successRotate, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]);
        if (reducedMotionRef.current) {
          coinScale.setValue(1); successScale.setValue(1); successRotate.setValue(1);
        } else {
          upgradeAnimations.current.push(celebration); celebration.start();
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
      shakeAnim.setValue(0);
      coinScale.setValue(1);
      progressAnim.setValue(0);
      queueHaptic('failBuzz');
    } finally {
      upgradeBusy.current = false;
    }
  };

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
      coinScale.setValue(1);
      progressAnim.setValue(0);
      successScale.setValue(0);
      successRotate.setValue(0);
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
  const successSpin = successRotate.interpolate({
    inputRange: [0, 1], outputRange: ['-15deg', '0deg'],
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
      }}
      onBackdropPress={state !== 'leveling' ? handleClose : undefined}
      backdropColor="#05346e"
      backdropOpacity={0.6}
      statusBarTranslucent
      style={{ margin: 0, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={{
        opacity: fadeIn,
        transform: [{ translateY: slideUp }],
        width: SCREEN_W - 48,
        maxHeight: SCREEN_H * 0.82,
        alignItems: 'center',
      }}>
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
                <Animated.View style={{
                  transform: [
                    { scale: coinScale },
                    { translateX: shakeAnim },
                  ],
                  marginBottom: 0,
                }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => state !== 'leveling' && setHoloVisible(true)}
                  >
                    <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: (state === 'success' ? nextLevel : currentLevel) >= 10 ? 26 : 0,
                      marginBottom: (state === 'success' ? nextLevel : currentLevel) >= 6 ? 14 : 0 }}>
                      <CoinStand level={state === 'success' ? nextLevel : currentLevel} size={120} layer="stand" />
                      <CoinUpgradeDemo
                        level={state === 'success' ? nextLevel : currentLevel}
                        coinUrl={rideCoin.coin_url}
                        size={120}
                        showLabel={false}
                      />
                      <CoinStand level={state === 'success' ? nextLevel : currentLevel} size={120} layer="crown" />
                      <LevelUpBurst fx={fx} size={120} playKey={burstKey} />
                    </View>
                  </TouchableOpacity>
                </Animated.View>

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
                      if (featureBusy) return;
                      setFeatureBusy(true);
                      setFeatureError(false);
                      const success = await onFeature(featured ? null : rideCoin.id);
                      if (success) setFeatured(!featured);
                      else setFeatureError(true);
                      setFeatureBusy(false);
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
                        Upgrade Cost
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
                        Your Balance
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
                  </>
                )}

                {/* ══════════════════════════════════════ */}
                {/* ── LEVELING STATE ── */}
                {/* ══════════════════════════════════════ */}
                {state === 'leveling' && (
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                    {/* Charging bar */}
                    <View style={{
                      width: '80%', height: 12, borderRadius: 6,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      overflow: 'hidden', marginBottom: 16,
                    }}>
                      <Animated.View style={{
                        height: '100%',
                        width: progressWidth,
                        borderRadius: 6,
                        backgroundColor: nextTierColor,
                        ...(Platform.OS === 'ios' ? {
                          shadowColor: nextTierColor,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 1,
                          shadowRadius: 8,
                        } : {}),
                      }} />
                    </View>
                    <Text style={{
                      fontFamily: 'Shark', fontSize: 18,
                      color: nextTierColor,
                      textTransform: 'uppercase',
                    }}>
                      Powering up...
                    </Text>
                  </View>
                )}

                {/* ══════════════════════════════════════ */}
                {/* ── SUCCESS STATE ── */}
                {/* ══════════════════════════════════════ */}
                {state === 'success' && (
                  <Animated.View style={{
                    alignItems: 'center', paddingVertical: 10,
                    transform: [{ scale: successScale }, { rotate: successSpin }],
                  }}>
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
                      <Text style={{
                        fontFamily: 'Shark', fontSize: 28,
                        color: '#9D6300',
                        textTransform: 'uppercase',
                        textShadowColor: 'rgba(0,0,0,0.5)',
                        textShadowOffset: { width: 2, height: 2 },
                        textShadowRadius: 0,
                      }}>
                        {nextTierName}!
                      </Text>
                      <Text style={{
                        fontFamily: 'Knockout', fontSize: 14,
                        color: '#315D7B',
                        marginTop: 4,
                      }}>
                        Your coin evolved to Level {nextLevel}
                      </Text>
                      <Text style={{ fontFamily: 'Knockout', fontSize: 14,
                        color: '#19496B', marginTop: 5, textAlign: 'center' }}>
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

                      {/* New perks unlocked (legacy curve) */}
                      {!reveal && rideCoin.next_level_perks.length > 0 && (
                        <View style={{ marginTop: 12, width: '100%' }}>
                          <Text style={{
                            fontFamily: 'Knockout', fontSize: 11,
                            color: '#825414',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 6,
                          }}>
                            New Perks Unlocked
                          </Text>
                          {rideCoin.next_level_perks.map((perk) => (
                            <Text key={perk.id} style={{
                              fontFamily: 'Knockout', fontSize: 14,
                              color: '#19496B', marginBottom: 2,
                            }}>
                              {perk.description}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>

                    <OneTimeTip id="first_level_up" ready={visible && state === 'success'} compact
                      style={{ alignSelf: 'stretch', marginBottom: 8 }} />
                    <YellowButton text="Awesome!" onPress={handleClose} />
                  </Animated.View>
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
                        This coin has reached maximum power!
                      </Text>
                      {typeof rideCoin.parts_banked === 'number' && (
                        <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: '#19496B', textAlign: 'center', marginBottom: 8 }}>
                          Parts banked: {rideCoin.parts_banked}{rideCoin.polish?.next_cost ? `. Next Trophy Polish: ${rideCoin.polish.next_cost} Parts` : ''}
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
                        : `${rideCoin.current_level}/${rideCoin.max_level} levels mastered`}
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
    </Modal>
  );
}
