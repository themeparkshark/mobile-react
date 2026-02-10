import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
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
import {
  RideCoinLevelType,
  RIDE_COIN_LEVEL_CONFIG,
} from '../models/ride-coin-level-type';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface Props {
  visible: boolean;
  rideCoin: RideCoinLevelType | null;
  playerEnergy: number;
  playerParts: number;
  onClose: () => void;
  onLevelUp: (rideCoinId: number) => Promise<boolean>;
}

type ModalState = 'preview' | 'confirm' | 'leveling' | 'success' | 'maxed';

// ── Level tier names matching CoinUpgradeDemo ──
const TIER_NAMES = ['Basic', 'Silver', 'Gold', 'Prismatic', 'Legendary'];
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
}: Props) {
  const [state, setState] = useState<ModalState>('preview');
  const [holoVisible, setHoloVisible] = useState(false);
  const { refreshPlayer } = useContext(AuthContext);

  // ── Animations ──
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(50)).current;
  const coinScale = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const successRotate = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0.3)).current;
  const confettiRef = useRef<Lottie>(null);

  // Staggered resource bar animations
  const energyBarAnim = useRef(new Animated.Value(0)).current;
  const partsBarAnim = useRef(new Animated.Value(0)).current;
  const energyCountAnim = useRef(new Animated.Value(0)).current;
  const partsCountAnim = useRef(new Animated.Value(0)).current;

  // ── Reset on open ──
  useEffect(() => {
    if (visible && rideCoin) {
      const isMax = rideCoin.current_level >= rideCoin.max_level;
      setState(isMax ? 'maxed' : 'preview');
      fadeIn.setValue(0);
      slideUp.setValue(50);
      progressAnim.setValue(0);
      successScale.setValue(0);

      // Entry animation
      Animated.parallel([
        Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(slideUp, { toValue: 0, friction: 7, useNativeDriver: true }),
      ]).start();

      // Staggered resource bars fill
      energyBarAnim.setValue(0);
      partsBarAnim.setValue(0);
      const energyPct = rideCoin.energy_to_next_level > 0
        ? Math.min(playerEnergy / rideCoin.energy_to_next_level, 1) : 1;
      const partsPct = rideCoin.parts_to_next_level > 0
        ? Math.min(playerParts / rideCoin.parts_to_next_level, 1) : 1;

      Animated.stagger(200, [
        Animated.timing(energyBarAnim, { toValue: energyPct, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: false }),
        Animated.timing(partsBarAnim, { toValue: partsPct, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: false }),
      ]).start();

      // Max level glow
      if (isMax) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowPulse, { toValue: 0.8, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(glowPulse, { toValue: 0.3, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        ).start();
      }
    }
  }, [visible, rideCoin]);

  if (!rideCoin) return null;

  const currentLevel = rideCoin.current_level;
  const nextLevel = Math.min(currentLevel + 1, rideCoin.max_level);
  const isMaxLevel = currentLevel >= rideCoin.max_level;
  const tierColor = TIER_COLORS[Math.min(currentLevel - 1, 4)];
  const nextTierColor = TIER_COLORS[Math.min(nextLevel - 1, 4)];
  const tierName = TIER_NAMES[Math.min(currentLevel - 1, 4)];
  const nextTierName = TIER_NAMES[Math.min(nextLevel - 1, 4)];

  const hasEnergy = playerEnergy >= rideCoin.energy_to_next_level;
  const hasParts = playerParts >= rideCoin.parts_to_next_level;
  const canLevelUp = !isMaxLevel && rideCoin.is_unlocked && hasEnergy && hasParts;

  // ── Level up sequence ──
  const handleLevelUp = async () => {
    if (!canLevelUp) return;

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

    Animated.parallel([shake, chargeUp, scaleUp]).start();

    // Phase 2: Flash + success
    try {
      const success = await onLevelUp(rideCoin.id);

      if (success) {
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Stop shake, big pop
        shakeAnim.setValue(0);
        coinScale.setValue(0.5);

        setState('success');
        confettiRef.current?.play();

        Animated.parallel([
          Animated.spring(coinScale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
          Animated.spring(successScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
          Animated.timing(successRotate, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]).start();

        await refreshPlayer();
      } else {
        throw new Error('Level up failed');
      }
    } catch {
      setState('preview');
      shakeAnim.setValue(0);
      coinScale.setValue(1);
      progressAnim.setValue(0);
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  };

  const handleClose = () => {
    Animated.timing(fadeIn, {
      toValue: 0, duration: 200, useNativeDriver: true,
    }).start(() => {
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

  // ── Level config for costs ──
  const levelCfg = RIDE_COIN_LEVEL_CONFIG[nextLevel as keyof typeof RIDE_COIN_LEVEL_CONFIG];

  return (
    <Modal
      animationIn="fadeIn"
      animationOut="fadeOut"
      isVisible={visible}
      onBackdropPress={state !== 'leveling' ? handleClose : undefined}
      backdropOpacity={0.85}
      statusBarTranslucent
      style={{ margin: 0, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Confetti overlay — only render during success to avoid artifact */}
      {state === 'success' && (
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
        maxHeight: SCREEN_H * 0.55,
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
          backgroundColor: '#1a1a2e',
          marginTop: '-10%',
          width: '95%',
          zIndex: 10,
          borderRadius: 20,
          borderWidth: 2.5,
          borderColor: state === 'success' ? nextTierColor : `${tierColor}60`,
          shadowColor: state === 'success' ? nextTierColor : tierColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
          overflow: 'hidden',
        }}>
          <View>
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
                    />
                  </TouchableOpacity>
                </Animated.View>

                {/* ── Ride Name ── */}
                <Text style={{
                  fontFamily: 'Shark',
                  fontSize: 17,
                  color: '#f0f0f0',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  marginBottom: 2,
                }}>
                  Level Up Your Coin
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
                    color: tierColor,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>
                    Lv.{currentLevel} {tierName}
                  </Text>

                  {!isMaxLevel && state !== 'success' && (
                    <>
                      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>→</Text>
                      <Text style={{
                        fontFamily: 'Knockout',
                        fontSize: 12,
                        color: nextTierColor,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        opacity: 0.6,
                      }}>
                        Lv.{nextLevel} {nextTierName}
                      </Text>
                    </>
                  )}
                </View>

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
                        backgroundColor: filled ? dotColor : 'rgba(255,255,255,0.1)',
                        borderWidth: 2,
                        borderColor: filled ? dotColor : 'rgba(255,255,255,0.2)',
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

                {/* ══════════════════════════════════════ */}
                {/* ── PREVIEW / CONFIRM STATE ── */}
                {/* ══════════════════════════════════════ */}
                {(state === 'preview' || state === 'confirm') && !isMaxLevel && (
                  <>
                    {/* ── Upgrade Cost Section ── */}
                    <View style={{
                      width: '100%',
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 12,
                    }}>
                      {/* Section Header */}
                      <Text style={{
                        fontFamily: 'Knockout',
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.5)',
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
                          <Text style={{ fontSize: 24, marginBottom: 4 }}>⚡</Text>
                          <Text style={{
                            fontFamily: 'Shark',
                            fontSize: 22,
                            color: 'white',
                          }}>
                            {rideCoin.energy_to_next_level}
                          </Text>
                          <Text style={{
                            fontFamily: 'Knockout',
                            fontSize: 10,
                            color: 'rgba(255,255,255,0.5)',
                            textTransform: 'uppercase',
                          }}>
                            Energy
                          </Text>
                        </View>

                        {/* Divider */}
                        <View style={{
                          width: 1,
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          marginVertical: 4,
                        }} />

                        {/* Ride Parts Cost */}
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontSize: 24, marginBottom: 4 }}>🔧</Text>
                          <Text style={{
                            fontFamily: 'Shark',
                            fontSize: 22,
                            color: 'white',
                          }}>
                            {rideCoin.parts_to_next_level}
                          </Text>
                          <Text style={{
                            fontFamily: 'Knockout',
                            fontSize: 10,
                            color: 'rgba(255,255,255,0.5)',
                            textTransform: 'uppercase',
                          }}>
                            Ride Parts
                          </Text>
                        </View>
                      </View>

                      {/* Divider Line */}
                      <View style={{
                        height: 1,
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        marginBottom: 10,
                      }} />

                      {/* Your Balance Section */}
                      <Text style={{
                        fontFamily: 'Knockout',
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.5)',
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
                          <Text style={{ fontSize: 16 }}>⚡</Text>
                          <Text style={{
                            fontFamily: 'Shark',
                            fontSize: 18,
                            color: hasEnergy ? '#66bb6a' : '#ef5350',
                          }}>
                            {playerEnergy.toLocaleString()}
                          </Text>
                          {hasEnergy && (
                            <Text style={{ fontSize: 12, color: '#66bb6a' }}>✓</Text>
                          )}
                        </View>

                        {/* Ride Parts Balance */}
                        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
                          <Text style={{ fontSize: 16 }}>🔧</Text>
                          <Text style={{
                            fontFamily: 'Shark',
                            fontSize: 18,
                            color: hasParts ? '#66bb6a' : '#ef5350',
                          }}>
                            {playerParts.toLocaleString()}
                          </Text>
                          {hasParts && (
                            <Text style={{ fontSize: 12, color: '#66bb6a' }}>✓</Text>
                          )}
                        </View>
                      </View>
                    </View>

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
                        color: 'rgba(255,255,255,0.4)',
                        textAlign: 'center', marginTop: 8,
                      }}>
                        {!hasEnergy && !hasParts
                          ? 'Win mini-games to earn ⚡ and 🔧'
                          : !hasEnergy
                            ? `Need ${rideCoin.energy_to_next_level - playerEnergy} more ⚡`
                            : `Need ${rideCoin.parts_to_next_level - playerParts} more 🔧`}
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
                      backgroundColor: `${nextTierColor}15`,
                      borderWidth: 2,
                      borderColor: `${nextTierColor}50`,
                      borderRadius: 18,
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      alignItems: 'center',
                      marginBottom: 16,
                      width: '100%',
                    }}>
                      <Text style={{
                        fontFamily: 'Shark', fontSize: 28,
                        color: nextTierColor,
                        textTransform: 'uppercase',
                        textShadowColor: 'rgba(0,0,0,0.5)',
                        textShadowOffset: { width: 2, height: 2 },
                        textShadowRadius: 0,
                      }}>
                        {nextTierName}!
                      </Text>
                      <Text style={{
                        fontFamily: 'Knockout', fontSize: 14,
                        color: 'rgba(255,255,255,0.7)',
                        marginTop: 4,
                      }}>
                        Your coin evolved to Level {nextLevel}
                      </Text>

                      {/* New perks unlocked */}
                      {rideCoin.next_level_perks.length > 0 && (
                        <View style={{ marginTop: 12, width: '100%' }}>
                          <Text style={{
                            fontFamily: 'Knockout', fontSize: 11,
                            color: nextTierColor,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 6,
                          }}>
                            New Perks Unlocked
                          </Text>
                          {rideCoin.next_level_perks.map((perk) => (
                            <Text key={perk.id} style={{
                              fontFamily: 'Knockout', fontSize: 14,
                              color: 'white', marginBottom: 2,
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
                {state === 'maxed' && (
                  <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                    {/* Glow behind */}
                    <Animated.View style={{
                      position: 'absolute', top: -20,
                      width: 200, height: 200, borderRadius: 100,
                      backgroundColor: '#fb923c',
                      opacity: glowPulse,
                    }} />

                    <View style={{
                      backgroundColor: 'rgba(249,115,22,0.1)',
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
                        color: '#fbbf24',
                        marginBottom: 4,
                      }}>
                        ★ LEGENDARY ★
                      </Text>
                      <Text style={{
                        fontFamily: 'Knockout', fontSize: 14,
                        color: 'rgba(255,255,255,0.7)',
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
                                fontFamily: 'Knockout', fontSize: 14, color: '#fbbf24',
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
                      color: 'rgba(255,255,255,0.4)',
                      textAlign: 'center', marginBottom: 16,
                    }}>
                      Collected {rideCoin.times_collected} times
                    </Text>

                    <YellowButton text="Nice!" onPress={handleClose} />
                  </View>
                )}

              </View>
          </View>
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
