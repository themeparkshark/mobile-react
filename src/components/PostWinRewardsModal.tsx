import { useEffect, useRef, useMemo } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import Modal from 'react-native-modal';
import { LinearGradient } from 'expo-linear-gradient';
import Lottie from 'lottie-react-native';
import * as Haptics from 'expo-haptics';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  visible: boolean;
  rideName: string;
  taskCoinUrl?: string;
  coinsEarned: number;
  xpEarned: number;
  ridePartsEarned: number;
  energyEarned: number;
  parkCoinProgress?: boolean;
  onClose: () => void;
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
  parkCoinProgress = true,
  onClose,
}: Props) {
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
    if (!visible) return;

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
  }, [visible]);

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
      onBackdropPress={onClose}
      backdropOpacity={0.92}
    >
      <View style={styles.container}>
        {/* Sparkle particles floating behind everything */}
        {sparkles.map((s, i) => (
          <Sparkle key={i} delay={s.delay} x={s.x} color={s.color} />
        ))}

        {/* Confetti */}
        <Lottie
          source={require('../../assets/animations/confetti.json')}
          autoPlay
          loop
          style={styles.confetti}
        />

        <Animated.View style={[styles.card, { transform: [{ scale: cardScale }] }]}>
          <Ribbon text="Challenge Complete!" />

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
                <LightRays color="#4cdcff" size={200} />
              </View>

              {/* Animated glow behind coin */}
              <Animated.View
                style={[
                  styles.heroGlow,
                  {
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
                  colors={['rgba(76,220,255,0.35)', 'rgba(76,220,255,0.05)', 'rgba(76,220,255,0.35)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.coinRingGradient}
                />

                <View style={styles.heroCoinInner}>
                  {taskCoinUrl ? (
                    <Image
                      source={{ uri: taskCoinUrl }}
                      style={styles.heroCoin}
                      contentFit="contain"
                    />
                  ) : (
                    <View style={styles.heroCoinFallback}>
                      <Text style={styles.heroCoinFallbackText}>?</Text>
                    </View>
                  )}
                </View>
              </Animated.View>

              <Text style={styles.heroEyebrow}>COIN ADDED TO SHELF</Text>
              <Text style={styles.heroTitle}>{rideName} Coin</Text>
              <Text style={styles.heroBody}>Your park shelf just grew.</Text>
            </Animated.View>

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
            {parkCoinProgress && (
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
                <Text style={styles.progressPillText}>+1 Shelf Progress</Text>
              </Animated.View>
            )}

            <Text style={styles.hint}>Ride Parts + Energy level up your coins.</Text>

            {/* ── Button with delayed entrance ── */}
            <Animated.View
              style={{
                transform: [
                  {
                    translateY: buttonAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
                opacity: buttonAnim,
              }}
            >
              <YellowButton text="Awesome!" onPress={onClose} />
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    paddingTop: 22,
    paddingBottom: 18,
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
    marginBottom: 12,
    letterSpacing: 0.5,
  },

  /* ── Hero ── */
  heroCard: {
    borderRadius: 20,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 14,
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
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  coinRingGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 50,
    padding: 3,
  },
  heroCoinInner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(76,220,255,0.06)',
    borderWidth: 2,
    borderColor: 'rgba(76,220,255,0.2)',
  },
  heroCoin: {
    width: 72,
    height: 72,
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

  /* ── Stats ── */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  statCard: {
    width: '48%',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  statGlow: {
    position: 'absolute',
    top: 8,
    width: 50,
    height: 50,
    borderRadius: 25,
    opacity: 0.08,
  },
  statIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statIcon: {
    width: 30,
    height: 30,
  },
  statAmount: {
    fontFamily: 'Shark',
    fontSize: 22,
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'Knockout',
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
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
    marginTop: 14,
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

  hint: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 14,
    fontStyle: 'italic',
  },
});
