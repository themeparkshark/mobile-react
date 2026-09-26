import { useEffect, useRef, useMemo, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import Modal from 'react-native-modal';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Ribbon from './Ribbon';
import CoinCatchReveal from './CoinCatchReveal';
import YellowButton from './YellowButton';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import type { EarnedCoinEdition, RideControlReward, RushReward } from '../api/endpoints/me/task-attempts';
import { TEAMS } from '../constants/teams';
import * as RootNavigation from '../RootNavigation';
import type { StampData } from '../api/endpoints/me/stamps';

const { width: SW, height: SH } = Dimensions.get('window');

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
  playerId?: number | null;
  earnedStamp?: Pick<StampData, 'id' | 'name' | 'rewards'> | null;
  nextRideTicketEarned?: number;
  coinProgress?: RideCoinLevelType | null;
  playerEnergy?: number | null;
  onViewCoin?: () => void;
  onViewStampBook?: () => void;
  onHidden?: () => void;
  onClose: () => void;
}

/* ─── Ride Control: what this win did for your team at the ride ─── */
function RideControlBanner({ result, playerId, onPickTeam }: {
  result: RideControlReward; playerId: number | null; onPickTeam: () => void;
}) {
  if (result.needs_team) {
    return (
      <TouchableOpacity accessibilityRole="button" onPress={onPickTeam} style={[styles.rcBanner, { borderColor: '#ffcf3b' }]}>
        <Text style={styles.rcTitle}>CLAIM {(result.ride_name ?? 'THIS RIDE').toUpperCase()}!</Text>
        <Text style={styles.rcBody}>Pick a team and your wins take rides for it. Tap to choose.</Text>
      </TouchableOpacity>
    );
  }
  const team = TEAMS[result.team];
  const captain = result.captain !== null && result.captain === playerId;
  const title = result.flipped
    ? `${team.name.toUpperCase()} TOOK ${result.ride_name.toUpperCase()}!`
    : result.controller === result.team ? `${team.name.toUpperCase()} HOLDS IT` : `+${result.points} FOR ${team.name.toUpperCase()}`;
  const body = [
    result.flipped || result.controller === result.team ? `+${result.points} power` : 'Keep going to take this ride',
    result.underdog ? 'underdog 1.5x' : null,
    captain ? 'you’re the Captain!' : null,
  ].filter(Boolean).join(' · ');
  return (
    <View style={[styles.rcBanner, { borderColor: team.color, backgroundColor: `${team.color}33` }]}>
      <Image source={team.badge} style={styles.rcBadge} contentFit="contain" />
      <View style={{ flex: 1 }}>
        <Text style={styles.rcTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.rcBody}>{body}</Text>
      </View>
    </View>
  );
}

/* ─── Animated radial light rays behind the hero coin ─── */
function LightRays({ color, size }: { color: string; size: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, []);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate }],
      }}
    >
      {Array.from({ length: 14 }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: 3,
            height: size * 0.48,
            borderRadius: 2,
            backgroundColor: color,
            opacity: i % 2 === 0 ? 0.18 : 0.09,
            transform: [{ rotate: `${(i * 360) / 14}deg` }, { translateY: -size * 0.15 }],
          }}
        />
      ))}
    </Animated.View>
  );
}

/* ─── Floating sparkle particle ─── */
function Sparkle({ delay, x, color }: { delay: number; x: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  const size = 3 + Math.random() * 5;

  useEffect(() => {
    const run = () => {
      anim.setValue(0);
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 1400 + Math.random() * 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => run());
    };
    run();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        bottom: '45%',
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: color,
        opacity: anim.interpolate({
          inputRange: [0, 0.15, 0.7, 1],
          outputRange: [0, 1, 0.6, 0],
        }),
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -80 - Math.random() * 100],
            }),
          },
          {
            translateX: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, (Math.random() - 0.5) * 120],
            }),
          },
          {
            scale: anim.interpolate({
              inputRange: [0, 0.3, 1],
              outputRange: [0.2, 1.3, 0.4],
            }),
          },
        ],
      }}
    />
  );
}

/* ─── Animated counter that ticks up from 0 ─── */
function TickUpNumber({
  value,
  delay,
  style,
}: {
  value: number;
  delay: number;
  style: any;
}) {
  const display = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (value <= 0) return;
    display.setValue(0);
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(display, {
        toValue: value,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [value]);

  // We need to use a listener for non-native driven numeric interpolation
  const textRef = useRef<any>(null);
  useEffect(() => {
    const id = display.addListener(({ value: v }) => {
      if (textRef.current) {
        textRef.current.setNativeProps({ text: `+${Math.round(v)}` });
      }
    });
    return () => display.removeListener(id);
  }, []);

  // Fallback: use Animated.Text won't work with setNativeProps on RN Text,
  // so we use a simple state approach instead
  return <AnimatedTickText value={value} delay={delay} style={style} />;
}

function AnimatedTickText({ value, delay, style }: { value: number; delay: number; style: any }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = React.useState(0);

  useEffect(() => {
    if (value <= 0) return;
    anim.setValue(0);
    const listener = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, {
        toValue: value,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
    return () => anim.removeListener(listener);
  }, [value]);

  return <Text style={style}>+{display}</Text>;
}

import React from 'react';

/* ─── Main component ─── */
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
  playerId,
  earnedStamp,
  nextRideTicketEarned = 0,
  coinProgress,
  playerEnergy,
  onViewCoin,
  onViewStampBook,
  onHidden,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const hasCoin = typeof coinTimesCollected === 'number' && coinTimesCollected > 0;
  const [coinArtFailed, setCoinArtFailed] = useState(false);
  useEffect(() => { setCoinArtFailed(false); }, [taskCoinUrl, visible]);
  // The coin catch plays first; the rewards summary animates in after it.
  const [caught, setCaught] = useState(false);
  useEffect(() => { if (!visible) setCaught(false); }, [visible]);
  const missingParts = coinProgress
    ? Math.max(0, coinProgress.parts_to_next_level - (coinProgress.available_parts ?? 0)) : 0;
  const missingEnergy = coinProgress && playerEnergy !== null && playerEnergy !== undefined
    ? Math.max(0, coinProgress.energy_to_next_level - playerEnergy) : 0;
  const nextGoal = coinProgress && playerEnergy !== null && playerEnergy !== undefined
    ? coinProgress.current_level >= coinProgress.max_level
      ? 'Max level! Show this coin off on your profile.'
      : missingParts === 0 && missingEnergy === 0
        ? `Ready to power up to Level ${coinProgress.current_level + 1}!`
        : missingParts > 0 && missingEnergy > 0
          ? `Level ${coinProgress.current_level + 1} needs ${missingParts} more Ride Part${missingParts === 1 ? '' : 's'} and ${missingEnergy} Energy.`
          : missingParts > 0
            ? `${missingParts} more Ride Part${missingParts === 1 ? '' : 's'} for Level ${coinProgress.current_level + 1}. Earn them waiting in line here.`
            : `${missingEnergy} more Energy for Level ${coinProgress.current_level + 1}. Find it on your home map.`
    : hasCoin ? 'Open your shelf to see this coin’s next level.' : null;
  const upgradeReady = !!coinProgress && coinProgress.current_level < coinProgress.max_level &&
    coinProgress.is_unlocked && missingParts === 0 && missingEnergy === 0 &&
    playerEnergy !== null && playerEnergy !== undefined;
  const cardScale = useRef(new Animated.Value(0)).current;
  const heroAnim = useRef(new Animated.Value(0)).current;
  const coinSpin = useRef(new Animated.Value(0)).current;
  const coinGlow = useRef(new Animated.Value(0)).current;
  const shelfPulse = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;
  const rowAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  // Sparkle positions (memoized so they don't change on re-render)
  const sparkles = useMemo(
    () =>
      Array.from({ length: 20 }).map((_, i) => ({
        x: Math.random() * (SW * 0.7) + SW * 0.05,
        delay: 400 + i * 80,
        color: ['#FFD84A', '#4cdcff', '#f472b6', '#57E389', '#8A8CFF'][i % 5],
      })),
    [],
  );

  useEffect(() => {
    if (!visible || !caught) return;

    // Reset
    cardScale.setValue(0);
    heroAnim.setValue(0);
    coinSpin.setValue(0);
    coinGlow.setValue(0);
    shelfPulse.setValue(0);
    buttonAnim.setValue(0);
    rowAnims.forEach((a) => a.setValue(0));

    // Haptic sequence: heavy -> medium -> light (impact cascade)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 120);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 220);

    // Card entrance
    Animated.spring(cardScale, {
      toValue: 1,
      tension: 55,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // Hero coin entrance (delayed)
    Animated.sequence([
      Animated.delay(300),
      Animated.spring(heroAnim, {
        toValue: 1,
        tension: 60,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();

    // Coin 3D-ish spin on entrance
    Animated.sequence([
      Animated.delay(300),
      Animated.timing(coinSpin, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]).start();

    // Coin glow pulse (loops)
    Animated.sequence([
      Animated.delay(600),
      Animated.loop(
        Animated.sequence([
          Animated.timing(coinGlow, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(coinGlow, {
            toValue: 0.3,
            duration: 1200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ]),
      ),
    ]).start();

    // Stat rows stagger (with haptic per row)
    Animated.sequence([
      Animated.delay(700),
      Animated.stagger(
        100,
        rowAnims.map((anim, i) => {
          // Haptic tick per stat
          setTimeout(
            () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
            700 + i * 100,
          );
          return Animated.spring(anim, {
            toValue: 1,
            tension: 90,
            friction: 7,
            useNativeDriver: true,
          });
        }),
      ),
    ]).start();

    // Shelf progress pill
    Animated.sequence([
      Animated.delay(1200),
      Animated.spring(shelfPulse, {
        toValue: 1,
        tension: 70,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();

    // Button entrance
    Animated.sequence([
      Animated.delay(1400),
      Animated.spring(buttonAnim, {
        toValue: 1,
        tension: 65,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, caught]);

  const statRows = [
    {
      icon: require('../../assets/images/coingold.png'),
      amount: coinsEarned,
      label: 'Shark Coins',
      accent: '#FFD84A',
      glowColor: 'rgba(255, 216, 74, 0.25)',
      show: coinsEarned > 0,
    },
    {
      icon: require('../../assets/images/screens/explore/xp.png'),
      amount: xpEarned,
      label: 'XP',
      accent: '#57E389',
      glowColor: 'rgba(87, 227, 137, 0.25)',
      show: xpEarned > 0,
    },
    {
      icon: require('../../assets/images/ride-parts.png'),
      amount: ridePartsEarned,
      label: 'Ride Parts',
      accent: '#8A8CFF',
      glowColor: 'rgba(138, 140, 255, 0.25)',
      show: ridePartsEarned > 0,
    },
    {
      icon: require('../../assets/images/energy-reward.png'),
      amount: energyEarned,
      label: 'Energy',
      accent: '#FFBE55',
      glowColor: 'rgba(255, 190, 85, 0.25)',
      show: energyEarned > 0,
    },
  ].filter((r) => r.show);

  return (
    <Modal
      animationIn="fadeIn"
      animationOut="fadeOut"
      isVisible={visible}
      onModalHide={onHidden}
      onBackdropPress={caught ? onClose : undefined}
      backdropOpacity={0.92}
    >
      {/* The rewards summary mounts once the coin catch finishes. */}
      {caught && <View style={{ flex: 1 }}>
      <ScrollView style={styles.scroll}
        contentContainerStyle={[styles.container, {
          paddingTop: Math.max(insets.top, 20) + 16,
          paddingBottom: 16,
        }]}
        showsVerticalScrollIndicator={false}>
        {/* Sparkle particles floating behind everything */}
        {sparkles.map((s, i) => (
          <Sparkle key={i} delay={s.delay} x={s.x} color={s.color} />
        ))}


        <Animated.View style={[styles.card, { transform: [{ scale: cardScale }] }]}>
          <Ribbon text={hasCoin ? 'Coin Caught!' : 'Challenge Complete!'} />

          {/* Main content card with glass effect */}
          <View style={styles.content}>
            {/* Gradient background */}
            <LinearGradient
              colors={['#161E35', '#0E1428', '#0A0F1E']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            {/* Inner top-edge highlight */}
            <LinearGradient
              colors={['rgba(76,220,255,0.08)', 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.25 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
            />

            <Text style={styles.subtitle}>{rideName} cleared</Text>

            {/* ── Hero coin section ── */}
            <Animated.View
              style={[
                styles.heroCard,
                {
                  transform: [
                    { scale: heroAnim },
                    {
                      translateY: heroAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [24, 0],
                      }),
                    },
                  ],
                  opacity: heroAnim,
                },
              ]}
            >
              {/* Gradient BG for hero card */}
              <LinearGradient
                colors={['rgba(76,220,255,0.06)', 'rgba(10,15,30,0.4)']}
                style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
              />

              {/* Rotating light rays */}
              <View style={styles.raysWrap}>
                <LightRays color={earnedEdition?.color ?? '#4cdcff'} size={200} />
              </View>

              {/* Animated glow behind coin */}
              <Animated.View
                style={[
                  styles.heroGlow,
                  {
                    backgroundColor: earnedEdition?.color ?? '#4cdcff',
                    opacity: coinGlow.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.15, 0.4],
                    }),
                    transform: [
                      {
                        scale: coinGlow.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.9, 1.15],
                        }),
                      },
                    ],
                  },
                ]}
              />

              {/* Coin with spin entrance + ring */}
              <Animated.View
                style={[
                  styles.heroCoinRing,
                  {
                    transform: [
                      {
                        rotateY: coinSpin.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: ['90deg', '-15deg', '0deg'],
                        }),
                      },
                      {
                        scale: coinSpin.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0.5, 1.1, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {/* Ring glow border */}
                <LinearGradient
                  colors={earnedEdition
                    ? [earnedEdition.color, 'rgba(255,255,255,0.06)', earnedEdition.color]
                    : ['rgba(76,220,255,0.35)', 'rgba(76,220,255,0.05)', 'rgba(76,220,255,0.35)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.coinRingGradient}
                />

                <View style={styles.heroCoinInner}>
                  {taskCoinUrl && hasCoin && !coinArtFailed ? (
                    <Image
                      source={{ uri: taskCoinUrl }}
                      style={styles.heroCoin}
                      contentFit="contain"
                      onError={() => setCoinArtFailed(true)}
                    />
                  ) : hasCoin ? (
                    <Image source={require('../../assets/images/coingold.png')}
                      style={styles.heroCoin} contentFit="contain" />
                  ) : (
                    <View style={styles.heroCoinFallback}>
                      <Text style={styles.heroCoinFallbackText}>{hasCoin ? '?' : '✓'}</Text>
                    </View>
                  )}
                </View>
              </Animated.View>

              <Text style={styles.heroEyebrow}>{hasCoin
                ? coinTimesCollected === 1 ? 'NEW RIDE COIN' : 'RIDE COIN RECOLLECTED'
                : 'RIDE CHALLENGE COMPLETE'}</Text>
              <Text style={styles.heroTitle}>{rideName}{hasCoin ? ' Coin' : ''}</Text>
              <Text style={[styles.heroBody, earnedEdition && { color: earnedEdition.color }]}>{earnedEdition
                ? `✦ ${earnedEdition.name} Project Edition earned · ${earnedEdition.project_title}`
                : hasCoin
                  ? coinTimesCollected === 1 ? 'Added to your coin shelf.' : `Collected ${coinTimesCollected} times.`
                  : 'Your confirmed rewards are below.'}</Text>
              {nextRideTicketEarned > 0 && (
                <Text style={styles.nextRideTicket}>🎫 +{nextRideTicketEarned} Park Ticket · Next ride ready</Text>
              )}
            </Animated.View>

            {rush && (
              <View style={styles.rushBonus} accessibilityLabel={`Rush bonus: ${rush.bonus_parts} extra Ride Parts and ${rush.bonus_xp} extra XP`}>
                <Text style={styles.rushBonusTitle}>⚡ RUSH BONUS</Text>
                <Text style={styles.rushBonusBody}>
                  Caught at {rush.wait} min (usually {rush.typical}) · +{rush.bonus_parts} Parts{rush.bonus_xp ? ` · +${rush.bonus_xp} XP` : ''}
                </Text>
              </View>
            )}

            {rideControl && <RideControlBanner result={rideControl} playerId={playerId ?? null}
              onPickTeam={() => { onClose(); RootNavigation.navigate('TeamSelection', {}); }} />}

            {/* ── Stat grid with glowing cards ── */}
            <View style={styles.statsGrid}>
              {statRows.map((reward, index) => (
                <Animated.View
                  key={reward.label}
                  style={[
                    styles.statCard,
                    {
                      transform: [
                        {
                          translateX: rowAnims[index].interpolate({
                            inputRange: [0, 1],
                            outputRange: [index % 2 === 0 ? -30 : 30, 0],
                          }),
                        },
                        {
                          scale: rowAnims[index].interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.8, 1],
                          }),
                        },
                      ],
                      opacity: rowAnims[index],
                    },
                  ]}
                >
                  {/* Card gradient BG */}
                  <LinearGradient
                    colors={[`${reward.accent}14`, `${reward.accent}06`]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
                  />

                  {/* Glow dot behind icon */}
                  <View style={[styles.statGlow, { backgroundColor: reward.accent }]} />

                  <View style={[styles.statIconWrap, { backgroundColor: `${reward.accent}18` }]}>
                    <Image source={reward.icon} style={styles.statIcon} contentFit="contain" />
                  </View>

                  {/* Tick-up number */}
                  <AnimatedTickText
                    value={reward.amount}
                    delay={700 + index * 100}
                    style={[styles.statAmount, { color: reward.accent }]}
                  />
                  <Text style={styles.statLabel}>{reward.label}</Text>

                  {/* Bottom accent line */}
                  <LinearGradient
                    colors={['transparent', `${reward.accent}30`, 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.statAccentLine}
                  />
                </Animated.View>
              ))}
            </View>

            {/* ── Shelf progress pill ── */}
            {earnedStamp ? (
              <TouchableOpacity style={styles.stampUnlock} onPress={onViewStampBook}
                disabled={!onViewStampBook} accessibilityRole="button"
                accessibilityLabel={`${earnedStamp.name} stamp unlocked. Open Stamp Book to claim its rewards.`}>
                <Image source={require('../../assets/images/stamps/first-ride-coin-v1.png')}
                  style={styles.stampImage} contentFit="contain" />
                <View style={styles.stampCopy}>
                  <Text style={styles.stampEyebrow}>STAMP BOOK UNLOCK</Text>
                  <Text style={styles.stampName}>{earnedStamp.name}</Text>
                  <Text style={styles.stampReward}>
                    {`Claim +${earnedStamp.rewards.energy} Energy and +${earnedStamp.rewards.xp} XP`}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : hasCoin && (
              <Animated.View
                style={[
                  styles.progressPill,
                  {
                    transform: [
                      {
                        scale: shelfPulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.7, 1],
                        }),
                      },
                    ],
                    opacity: shelfPulse,
                  },
                ]}
              >
                <LinearGradient
                  colors={['rgba(244,114,182,0.18)', 'rgba(244,114,182,0.06)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: 999 }]}
                />
                <Text style={styles.progressEmoji}>🏆</Text>
                <Text style={styles.progressPillText}>{coinTimesCollected === 1
                  ? 'First Collection' : `${coinTimesCollected} Total Collections`}</Text>
              </Animated.View>
            )}

            {nextGoal && <Text style={styles.hint}>{nextGoal}</Text>}

          </View>
        </Animated.View>
      </ScrollView>
      {/* The earned coin's next action stays reachable on smaller phones while
          the artwork and reward ledger can scroll above it. */}
      <Animated.View style={[styles.footer, {
        paddingBottom: Math.max(insets.bottom, 12) + 4,
        transform: [{ translateY: buttonAnim.interpolate({
          inputRange: [0, 1], outputRange: [20, 0],
        }) }],
        opacity: buttonAnim,
      }]}>
        <YellowButton text={hasCoin && onViewCoin
          ? upgradeReady ? 'Upgrade Your Coin' : 'See Your Coin'
          : 'Continue Park'}
          onPress={hasCoin && onViewCoin ? onViewCoin : onClose} />
        {hasCoin && onViewCoin && (
          <TouchableOpacity onPress={onClose} accessibilityRole="button"
            accessibilityLabel="Continue exploring the park" style={styles.continuePark}>
            <Text style={styles.continueParkText}>Continue Park</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
      </View>}
      {!caught && <CoinCatchReveal coinUrl={coinArtFailed ? undefined : taskCoinUrl} rideName={rideName}
        isNewCoin={coinTimesCollected === 1}
        onDone={() => setCaught(true)} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  rushBonus: { marginTop: 8, backgroundColor: '#ffcf3b', borderRadius: 14, borderWidth: 3, borderColor: '#fff',
    paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center' },
  rushBonusTitle: { fontFamily: 'Shark', fontSize: 16, color: '#6a3b00' },
  rushBonusBody: { fontFamily: 'Knockout', fontSize: 13, color: '#7a4a00', textAlign: 'center' },
  rcBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', borderWidth: 3,
    borderRadius: 16, padding: 10, marginTop: 12, backgroundColor: 'rgba(255, 207, 59, 0.15)' },
  rcBadge: { width: 44, height: 44 },
  rcTitle: { fontFamily: 'Shark', fontSize: 18, color: '#fff' },
  rcBody: { fontFamily: 'Knockout', fontSize: 14, color: '#e4f7ff', marginTop: 2 },
  scroll: { flex: 1 },
  footer: {
    width: (SW - 34) * 0.88,
    alignSelf: 'center',
    paddingTop: 8,
  },
  continuePark: { paddingVertical: 9, alignItems: 'center' },
  continueParkText: {
    color: '#D9EBF4',
    textAlign: 'center',
    fontFamily: 'Knockout',
    fontSize: 14,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confetti: {
    position: 'absolute',
    width: 900,
    height: 400,
    top: 15,
    zIndex: 20,
    left: -80,
  },
  card: {
    width: SW - 34,
    alignItems: 'center',
    zIndex: 10,
  },
  content: {
    borderRadius: 22,
    marginTop: '-10%',
    width: '88%',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(76,220,255,0.12)',
    overflow: 'hidden',
    // Deep shadow for floating effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Knockout',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },

  /* ── Hero ── */
  heroCard: {
    borderRadius: 20,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 9,
    borderWidth: 1,
    borderColor: 'rgba(76,220,255,0.14)',
    overflow: 'hidden',
  },
  raysWrap: {
    position: 'absolute',
    top: -10,
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
  },
  heroGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#4cdcff',
    top: -20,
  },
  heroCoinRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  coinRingGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 42,
    padding: 3,
  },
  heroCoinInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(76,220,255,0.06)',
    borderWidth: 2,
    borderColor: 'rgba(76,220,255,0.2)',
  },
  heroCoin: {
    width: 64,
    height: 64,
  },
  heroCoinFallback: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroCoinFallbackText: {
    color: '#4cdcff',
    fontFamily: 'Shark',
    fontSize: 30,
  },
  heroEyebrow: {
    color: '#4cdcff',
    fontFamily: 'Knockout',
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#fff',
    fontFamily: 'Shark',
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 4,
    textShadowColor: 'rgba(76,220,255,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  heroBody: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'Knockout',
    fontSize: 13,
    textAlign: 'center',
  },
  nextRideTicket: {
    color: '#F4CD72',
    fontFamily: 'Knockout',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },

  /* ── Stats ── */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    gap: 4,
  },
  statCard: { width: '23.5%', borderRadius: 14, paddingVertical: 8, alignItems: 'center', overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)' },
  statGlow: {
    position: 'absolute',
    top: 8,
    width: 50,
    height: 50,
    borderRadius: 25,
    opacity: 0.08,
  },
  statIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statIcon: { width: 22, height: 22 },
  statAmount: {
    fontFamily: 'Shark',
    fontSize: 18,
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontFamily: 'Knockout', fontSize: 11 },
  statAccentLine: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 16,
    height: 1.5,
    borderRadius: 1,
  },

  /* ── Progress pill ── */
  progressPill: {
    marginTop: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.2)',
    overflow: 'hidden',
    gap: 6,
  },
  progressEmoji: {
    fontSize: 14,
  },
  progressPillText: {
    color: '#f472b6',
    fontFamily: 'Shark',
    fontSize: 14,
    textShadowColor: 'rgba(244,114,182,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },

  stampUnlock: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#f6c744',
    backgroundColor: '#e7f7ff',
  },
  stampImage: { width: 62, height: 62 },
  stampCopy: { flex: 1 },
  stampEyebrow: { color: '#0871ad', fontFamily: 'Knockout', fontSize: 11,
    letterSpacing: 0.7 },
  stampName: { color: '#103b72', fontFamily: 'Shark', fontSize: 16 },
  stampReward: { color: '#315e78', fontFamily: 'Knockout', fontSize: 12,
    marginTop: 2 },

  hint: {
    color: '#C9E9F7',
    fontFamily: 'Knockout',
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 6,
  },
});
