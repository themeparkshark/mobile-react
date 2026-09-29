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
import Lottie from 'lottie-react-native';
import * as Haptics from '../helpers/haptics';
import config from '../config';
import HoloCoinPreview from './HoloCoinPreview';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';
import CoinUpgradeDemo from './CoinUpgradeDemo';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import useReducedGameMotion from '../hooks/useReducedGameMotion';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface Props {
  visible: boolean;
  rideCoin: RideCoinLevelType | null;
  playerEnergy: number;
  playerParts: number;
  onClose: () => void;
  onLevelUp: (rideCoinId: number) => Promise<boolean>;
  onFeature: (assetId: number | null) => Promise<boolean>;
  onPlayInLine?: () => void;
}

type ModalState = 'preview' | 'confirm' | 'leveling' | 'success' | 'maxed';

// ── Level tier names matching CoinUpgradeDemo ──
const TIER_NAMES = ['Basic', 'Silver', 'Gold', 'Prismatic', 'Legendary'];
const TIER_VISUAL_REWARDS = [
  'Basic coin', 'Silver rim and animated shimmer', 'Gold glow and orbiting sparks',
  'Prismatic light rays', 'Legendary plasma and sparks',
];
const TIER_COLORS = ['#a8a29e', '#cbd5e1', '#fbbf24', '#c4b5fd', '#fb923c'];
const TIER_BG = [
  'rgba(120,113,108,0.15)',
  'rgba(148,163,184,0.15)',
  'rgba(251,191,36,0.15)',
  'rgba(167,139,250,0.15)',
  'rgba(249,115,22,0.15)',
];

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
  const confettiRef = useRef<Lottie>(null);
  const pendingLinePlayRef = useRef(false);

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
  const tierColor = TIER_COLORS[Math.min(currentLevel - 1, 4)];
  const nextTierColor = TIER_COLORS[Math.min(nextLevel - 1, 4)];
  const tierName = TIER_NAMES[Math.min(currentLevel - 1, 4)];
  const nextTierName = TIER_NAMES[Math.min(nextLevel - 1, 4)];
  const nextVisualReward = TIER_VISUAL_REWARDS[Math.min(nextLevel - 1, 4)];

  const hasEnergy = playerEnergy >= rideCoin.energy_to_next_level;
  const hasParts = playerParts >= rideCoin.parts_to_next_level;
  const canLevelUp = !isMaxLevel && rideCoin.is_unlocked && hasEnergy && hasParts;

  // ── Level up sequence ──
  const handleLevelUp = async () => {
    if (!canLevelUp || upgradeBusy.current) return;
    upgradeBusy.current = true;
    setUpgradeError(null);

    setState('leveling');
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

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
      duration: 1600,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    });

    const scaleUp = Animated.timing(coinScale, {
      toValue: 1.15,
      duration: 1600,
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
    const chargeTicks = Platform.OS === 'ios' && !reducedMotion ? [
      [400, Haptics.ImpactFeedbackStyle.Light],
      [800, Haptics.ImpactFeedbackStyle.Medium],
      [1200, Haptics.ImpactFeedbackStyle.Heavy],
    ].map(([ms, style]) => setTimeout(() => Haptics.impactAsync(style as any), ms as number)) : [];

    upgradeTimers.current = chargeTicks;
    // Phase 2: Flash + success
    try {
      const [success] = await Promise.all([onLevelUp(rideCoin.id), charged]);
      stopUpgradeEffects();
      if (!mounted.current) return;

      if (success) {
        playSound(require('../../assets/sounds/reward.mp3'));
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Stop shake, big pop
        shakeAnim.setValue(0);
        coinScale.setValue(0.5);

        setState('success');
        if (!reducedMotionRef.current) confettiRef.current?.play();

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
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
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
      }}
      onBackdropPress={state !== 'leveling' ? handleClose : undefined}
      backdropOpacity={0.85}
      statusBarTranslucent
      style={{ margin: 0, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Confetti overlay — only render during success to avoid artifact */}
      {state === 'success' && !reducedMotion && (
        <Lottie
          ref={confettiRef}
          source={require('../../assets/animations/confetti.json')}
          autoPlay={false}
          loop={false}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 100, pointerEvents: 'none',
          }}
        />
      )}

      <Animated.View style={{
        opacity: fadeIn,
        transform: [{ translateY: slideUp }],
        width: SCREEN_W - 48,
        maxHeight: SCREEN_H * 0.82,
        alignItems: 'center',
      }}>
        {/* ── Ribbon Header ── */}
        <Ribbon text={
          state === 'success' ? 'Level Up!' :
          isMaxLevel ? '★ Legendary ★' :
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
                    <CoinUpgradeDemo
                      level={state === 'success' ? nextLevel : currentLevel}
                      coinUrl={rideCoin.coin_url}
                      size={120}
                      labelColor="#FFFFFF"
                    />
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
                  {state === 'success' ? 'YOUR COIN POWERED UP'
                    : state === 'maxed' ? 'COIN FULLY POWERED' : 'LEVEL UP YOUR COIN'}
                </Text>

                {/* ── Level Badge Row (compact) ── */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 6,
                  gap: 6,
                }}>
                  <Text style={{
                    fontFamily: 'Knockout',
                    fontSize: 12,
                    color: '#17476B',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>
                    Lv.{state === 'success' ? nextLevel : currentLevel} {state === 'success' ? nextTierName : tierName}
                  </Text>

                  {!isMaxLevel && state !== 'success' && (
                    <>
                      <Text style={{ color: '#316D90', fontSize: 12 }}>→</Text>
                      <Text style={{
                        fontFamily: 'Knockout',
                        fontSize: 12,
                        color: '#A36609',
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
                    <Text style={{ fontFamily: 'Knockout', fontSize: 12,
                      color: rideCoin.editions[0].color, textAlign: 'center' }}>
                      ✦ {showEditions ? 'Back to coin' : `${rideCoin.editions[0].name} · View ${rideCoin.editions.length}`}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* ── Level Progress Dots ── */}
                <View style={{
                  flexDirection: 'row',
                  gap: 5,
                  marginBottom: 8,
                }}>
                  {Array.from({ length: rideCoin.max_level }).map((_, i) => {
                    const filled = state === 'success' ? i < nextLevel : i < currentLevel;
                    const dotColor = TIER_COLORS[Math.min(i, 4)];
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
                        {filled && (
                          <Text style={{ fontSize: 10, color: 'white', fontWeight: '900' }}>✓</Text>
                        )}
                      </View>
                    );
                  })}
                </View>

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
                      {featureBusy ? 'Saving…' : featured ? '★ Featured on Profile · Remove' : '☆ Feature on Profile'}
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
                          {hasEnergy && (
                            <Text style={{ fontSize: 12, color: '#168052' }}>✓</Text>
                          )}
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
                          {hasParts && (
                            <Text style={{ fontSize: 12, color: '#168052' }}>✓</Text>
                          )}
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
                          <Text key={perk.id} style={{ fontFamily: 'Knockout', fontSize: 14,
                            color: '#19496B' }}>★ {perk.description}</Text>
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
                    {/* ── Level Up Button ── */}
                    <YellowButton
                      text={canLevelUp ? 'Power Up!' : 'Not Enough Resources'}
                      disabled={!canLevelUp}
                      onPress={handleLevelUp}
                    />

                    {/* Helper text for what you're missing */}
                    {!canLevelUp && (
                      <Text style={{
                        fontFamily: 'Knockout', fontSize: 11,
                        color: '#315D7B',
                        textAlign: 'center', marginTop: 8,
                      }}>
                        {!hasEnergy && !hasParts
                          ? 'Find home items for Energy; visit this ride for Parts.'
                          : !hasEnergy
                            ? `Find home items for ${rideCoin.energy_to_next_level - playerEnergy} more Energy.`
                            : `Need ${rideCoin.parts_to_next_level - playerParts} more Parts from this ride.`}
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

                      {/* New perks unlocked */}
                      {rideCoin.next_level_perks.length > 0 && (
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
                              ⭐ {perk.description}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>

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
                        ★ LEGENDARY ★
                      </Text>
                      <Text style={{
                        fontFamily: 'Knockout', fontSize: 14,
                        color: '#315D7B',
                        textAlign: 'center',
                        marginBottom: 12,
                      }}>
                        This coin has reached maximum power!
                      </Text>

                      {/* All perks */}
                      {rideCoin.current_perks.length > 0 && (
                        <View style={{ width: '100%' }}>
                          {rideCoin.current_perks.map((perk) => (
                            <View key={perk.id} style={{
                              flexDirection: 'row', alignItems: 'center', marginBottom: 4,
                            }}>
                              <Text style={{ fontSize: 12, marginRight: 8 }}>🏆</Text>
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
                      textDecorationLine: 'underline' }}>Waiting here? Play in Line ›</Text>
                  </TouchableOpacity>}

              </View>
          </ScrollView>
        </View>
      </Animated.View>

      <HoloCoinPreview
        visible={holoVisible}
        coinUrl={rideCoin.coin_url}
        name={rideCoin.ride_name}
        onClose={() => setHoloVisible(false)}
      />
    </Modal>
  );
}
