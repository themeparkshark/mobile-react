import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { Image } from 'expo-image';
import { COIN_TIERS } from '../constants/coinTiers';

interface Props {
  level: number;
  coinUrl?: string;
  size?: number;
  labelColor?: string;
  animate?: boolean;
  /** Hide the "Lv.N Tier" caption where the screen already names the level. */
  showLabel?: boolean;
}

// Blue, white and gold tier tokens only (constants/coinTiers): no neon, pink or purple.
const LEVEL_CONFIG = COIN_TIERS.map(tier => ({
  label: tier.name, labelColor: tier.ringDeep, borderColor: tier.ringDeep, bgTint: tier.halo,
}));

// Prismatic sparkle cycle: water blues, white and gold.
const PRISMATIC_COLORS = ['#5fd0ff', '#ffffff', '#0879ca', '#ffcf3b', '#bfe5ff', '#5fd0ff'];
const EARNED_RIM_COLORS = COIN_TIERS.map(tier => tier.ring);

export default function CoinUpgradeDemo({ level, coinUrl, size = 70, labelColor, animate = true, showLabel = true }: Props) {
  const cfg = LEVEL_CONFIG[Math.min(level - 1, 4)];
  const effectArea = size * 1.5; // total effect zone
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    if (!animate) return;
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted) setReducedMotion(value);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      if (mounted) setReducedMotion(value);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [animate]);

  // ── Shared animations ──
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowPulse = useRef(new Animated.Value(0.2)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  // ── Lv2: Mercury shimmer - 3 blobs that orbit the edge ──
  const mercuryAnims = useRef(
    Array.from({ length: 3 }, () => new Animated.Value(0))
  ).current;

  // ── Lv3: Orbiting motes ──
  const moteAnims = useRef(
    Array.from({ length: 6 }, () => ({
      orbit: new Animated.Value(0),
      twinkle: new Animated.Value(0.4),
    }))
  ).current;

  // ── Lv4: Prismatic light rays ──
  const rayAnims = useRef(
    Array.from({ length: 8 }, () => ({
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.3),
    }))
  ).current;

  // ── Lv5: Electric crackle + plasma ring + constellation ──
  const plasmaAnim = useRef(new Animated.Value(0)).current;
  const crackleAnims = useRef(
    Array.from({ length: 12 }, () => ({
      opacity: new Animated.Value(0),
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      scale: new Animated.Value(0),
    }))
  ).current;
  const constellationAnims = useRef(
    Array.from({ length: 8 }, () => ({
      orbit: new Animated.Value(0),
      pulse: new Animated.Value(0.5),
    }))
  ).current;

  useEffect(() => {
    if (!animate || reducedMotion) {
      rayAnims.forEach(ray => ray.opacity.setValue(0));
      crackleAnims.forEach(bolt => bolt.opacity.setValue(0));
      shimmerAnim.setValue(0);
      pulseAnim.setValue(1);
      floatAnim.setValue(0);
      return;
    }
    const anims: Animated.CompositeAnimation[] = [];

    // ── ALL LEVELS: Shimmer sweep (Lv2+) ──
    if (level >= 2) {
      anims.push(Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true,
        })
      ));
    }

    // ── Lv2+: Breathing glow ──
    if (level >= 2) {
      anims.push(Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulse, { toValue: 0.7, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glowPulse, { toValue: 0.15, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ));
    }

    // ── Lv2: Mercury blobs orbiting ──
    if (level >= 2 && level < 4) {
      mercuryAnims.forEach((anim, i) => {
        anims.push(Animated.loop(
          Animated.timing(anim, {
            toValue: 1,
            duration: 3000 + i * 800,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        ));
      });
    }

    // ── Lv3+: Float/bob ──
    if (level >= 3) {
      anims.push(Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(floatAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ));

      // Orbiting motes
      moteAnims.forEach((mote, i) => {
        anims.push(Animated.loop(
          Animated.timing(mote.orbit, {
            toValue: 1,
            duration: 4000 + i * 600,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        ));
        anims.push(Animated.loop(
          Animated.sequence([
            Animated.timing(mote.twinkle, { toValue: 1, duration: 400 + i * 100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(mote.twinkle, { toValue: 0.2, duration: 400 + i * 100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        ));
      });
    }

    // ── Lv4: Prismatic cycle + rays ──
    if (level >= 4) {
      anims.push(Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ));

      // Staggered light rays
      rayAnims.forEach((ray, i) => {
        ray.opacity.setValue(0);
        ray.scale.setValue(0.3);
        anims.push(Animated.loop(Animated.sequence([
          Animated.delay(i * 180),
          Animated.parallel([
            Animated.sequence([
              Animated.timing(ray.opacity, { toValue: 0.6, duration: 200, useNativeDriver: true }),
              Animated.timing(ray.opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
            ]),
            Animated.timing(ray.scale, { toValue: 1.5, duration: 800,
              easing: Easing.out(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.delay(1200),
        ])));
      });
    }

    // ── Lv5: Plasma + crackle + constellation ──
    if (level >= 5) {
      anims.push(Animated.loop(
        Animated.timing(plasmaAnim, {
          toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true,
        })
      ));

      // Electric crackle bolts
      crackleAnims.forEach((bolt, i) => {
        const angle = (i / crackleAnims.length) * Math.PI * 2;
        const dist = size * (0.35 + (i % 4) * 0.08);
        bolt.opacity.setValue(0);
        bolt.scale.setValue(0.2);
        bolt.x.setValue(Math.cos(angle) * size * 0.3);
        bolt.y.setValue(Math.sin(angle) * size * 0.3);
        anims.push(Animated.loop(Animated.sequence([
          Animated.delay(i * 120),
          Animated.parallel([
            Animated.sequence([
              Animated.timing(bolt.opacity, { toValue: 1, duration: 50, useNativeDriver: true }),
              Animated.timing(bolt.opacity, { toValue: 0.8, duration: 30, useNativeDriver: true }),
              Animated.timing(bolt.opacity, { toValue: 1, duration: 30, useNativeDriver: true }),
              Animated.timing(bolt.opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]),
            Animated.timing(bolt.x, { toValue: Math.cos(angle) * dist,
              duration: 310, useNativeDriver: true }),
            Animated.timing(bolt.y, { toValue: Math.sin(angle) * dist,
              duration: 310, useNativeDriver: true }),
            Animated.timing(bolt.scale, { toValue: 1, duration: 310, useNativeDriver: true }),
          ]),
          Animated.delay(1800),
        ])));
      });

      // Constellation orbits (slower, wider, varied sizes)
      constellationAnims.forEach((star, i) => {
        anims.push(Animated.loop(
          Animated.timing(star.orbit, {
            toValue: 1,
            duration: 6000 + i * 1000,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        ));
        anims.push(Animated.loop(
          Animated.sequence([
            Animated.timing(star.pulse, { toValue: 1, duration: 600 + i * 150, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(star.pulse, { toValue: 0.3, duration: 600 + i * 150, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        ));
      });
    }

    anims.forEach(a => a.start());
    return () => {
      anims.forEach(a => a.stop());
    };
  }, [animate, reducedMotion, level, size]);

  // ── Interpolations ──
  const shimmerX = shimmerAnim.interpolate({
    inputRange: [0, 1], outputRange: [-size, size],
  });
  const floatY = floatAnim.interpolate({
    inputRange: [0, 1], outputRange: [0, -4],
  });
  const plasmaRotation = plasmaAnim.interpolate({
    inputRange: [0, 1], outputRange: ['0deg', '360deg'],
  });
  // Ring size
  const ringSize = size + 8;

  return (
    <View style={[s.container, { width: effectArea, height: effectArea }]}>
      {/* ── Lv5: Electric crackle bolts ── */}
      {level >= 5 && crackleAnims.map((bolt, i) => (
        <Animated.View
          key={'bolt' + i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: effectArea / 2 - 1,
            top: effectArea / 2 - 1,
            width: 2, height: i % 3 === 0 ? 12 : 8,
            borderRadius: 1,
            backgroundColor: i % 2 === 0 ? '#ffffff' : '#ffcf3b',
            opacity: bolt.opacity,
            transform: [
              { translateX: bolt.x },
              { translateY: bolt.y },
              { scale: bolt.scale },
              { rotate: `${(i * 47) % 360}deg` },
            ],
          }}
        />
      ))}

      {/* ── Lv4+: Light rays ── */}
      {level >= 4 && rayAnims.map((ray, i) => {
        return (
          <Animated.View
            key={'ray' + i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: effectArea / 2 - 1.5,
              top: effectArea / 2 - size * 0.4,
              width: 3, height: size * 0.8,
              borderRadius: 1.5,
              backgroundColor: level >= 5 ? '#ffcf3b' : '#bfe5ff',
              opacity: ray.opacity,
              transform: [
                { rotate: `${(i * 45)}deg` },
                { scaleY: ray.scale },
              ],
              // ray emanates from center
            }}
          />
        );
      })}

      {/* ── Main coin group (floats on Lv3+) ── */}
      <Animated.View style={{
        alignItems: 'center',
        justifyContent: 'center',
        transform: level >= 3 ? [{ translateY: floatY }] : [],
      }}>

        {/* ── Lv5: Plasma ring ── */}
        {level >= 5 && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: ringSize + 8,
              height: ringSize + 8,
              borderRadius: (ringSize + 8) / 2,
              borderWidth: 2.5,
              borderColor: '#ffb400',
              opacity: 0.7,
              transform: [{ rotate: plasmaRotation }, { scale: pulseAnim }],
              ...Platform.select({
                ios: { shadowColor: '#ffb400', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 12 },
                android: { elevation: 8 },
              }),
            }}
          />
        )}

        {/* ── Lv4: Prismatic animated border ring ── */}
        {level >= 4 && level < 5 && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderWidth: 2.5,
              borderColor: cfg.borderColor,
              transform: [{ scale: pulseAnim }],
              ...Platform.select({
                ios: { shadowColor: '#5fd0ff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 10 },
                android: { elevation: 6 },
              }),
            }}
          />
        )}

        {/* ── Lv2-3: Glow aura ── */}
        {level >= 2 && level < 4 && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: size + 16,
              height: size + 16,
              borderRadius: (size + 16) / 2,
              backgroundColor: level === 3 ? 'rgba(251,191,36,0.15)' : 'rgba(148,163,184,0.1)',
              opacity: glowPulse,
              transform: [{ scale: pulseAnim }],
            }}
          />
        )}

        {/* ── Lv2+: Breathing inner ring ── */}
        {level >= 2 && level < 4 && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: size + 4,
              height: size + 4,
              borderRadius: (size + 4) / 2,
              borderWidth: 1.5,
              borderColor: cfg.borderColor,
              opacity: glowPulse,
            }}
          />
        )}

        {/* ── Lv2: Mercury blobs orbiting edge ── */}
        {level >= 2 && level < 4 && mercuryAnims.map((anim, i) => {
          const orbitRadius = size / 2 + 2;
          const rotation = anim.interpolate({
            inputRange: [0, 1], outputRange: [`${i * 120}deg`, `${i * 120 + 360}deg`],
          });
          return (
            <Animated.View
              key={'merc' + i}
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: level === 3 ? 6 : 5,
                height: level === 3 ? 6 : 5,
                borderRadius: 3,
                backgroundColor: level === 3 ? '#fbbf24' : '#e2e8f0',
                transform: [
                  { rotate: rotation },
                  { translateY: -orbitRadius },
                ],
                ...Platform.select({
                  ios: {
                    shadowColor: level === 3 ? '#fbbf24' : '#e2e8f0',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.9,
                    shadowRadius: 4,
                  },
                  android: {},
                }),
              }}
            />
          );
        })}

        {/* ── THE COIN ── */}
        <Animated.View style={[s.coinWrap, {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: level === 1 ? 2 : 4,
          borderColor: EARNED_RIM_COLORS[Math.min(level - 1, 4)],
          ...Platform.select({
            ios: {
              shadowColor: level >= 5 ? '#ffb400' : level >= 4 ? '#5fd0ff' : level >= 3 ? '#fbbf24' : '#05346e',
              shadowOffset: { width: 0, height: level >= 3 ? 0 : 3 },
              shadowOpacity: level >= 3 ? 0.6 : 0.4,
              shadowRadius: level >= 3 ? 8 : 5,
            },
            android: { elevation: level >= 3 ? 8 : 5 },
          }),
        }]}>
          {coinUrl ? (
            <Image
              source={{ uri: coinUrl }}
              style={{ width: size - (level === 1 ? 4 : 8), height: size - (level === 1 ? 4 : 8), borderRadius: size / 2 }}
              contentFit="cover"
            />
          ) : (
            <Image
              source={require('../../assets/images/coingold.png')}
              style={{ width: size - (level === 1 ? 4 : 8), height: size - (level === 1 ? 4 : 8), borderRadius: size / 2 }}
              contentFit="contain"
            />
          )}

          {/* Shimmer sweep (Lv2+) */}
          {level >= 2 && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: size / 2,
                overflow: 'hidden',
              }}
            >
              <Animated.View style={{
                position: 'absolute',
                top: -5,
                width: level >= 4 ? 16 : 10,
                height: size + 10,
                backgroundColor: level >= 5 ? 'rgba(251,191,36,0.35)' : level >= 4 ? 'rgba(196,181,253,0.3)' : 'rgba(255,255,255,0.25)',
                transform: [{ translateX: shimmerX }, { rotate: '20deg' }],
              }} />
            </Animated.View>
          )}
        </Animated.View>

        {/* ── Lv3+: Orbiting motes ── */}
        {level >= 3 && moteAnims.map((mote, i) => {
          const orbitRadius = size / 2 + (level >= 5 ? 14 : level >= 4 ? 10 : 8);
          const moteSize = level >= 5 ? 4 : level >= 4 ? 3.5 : 3;
          const rotation = mote.orbit.interpolate({
            inputRange: [0, 1],
            outputRange: [`${i * 60}deg`, `${i * 60 + (i % 2 === 0 ? 360 : -360)}deg`],
          });
          const color = level >= 5
            ? (i % 3 === 0 ? '#ffb400' : i % 3 === 1 ? '#ffcf3b' : '#ffffff')
            : level >= 4
              ? PRISMATIC_COLORS[i % PRISMATIC_COLORS.length]
              : '#fbbf24';
          return (
            <Animated.View
              key={'mote' + i}
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: moteSize,
                height: moteSize,
                borderRadius: moteSize / 2,
                backgroundColor: color,
                opacity: mote.twinkle,
                transform: [
                  { rotate: rotation },
                  { translateY: -orbitRadius },
                ],
                ...Platform.select({
                  ios: { shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 3 },
                  android: {},
                }),
              }}
            />
          );
        })}

        {/* ── Lv5: Constellation stars (wider orbit) ── */}
        {level >= 5 && constellationAnims.map((star, i) => {
          const orbitRadius = size / 2 + 22 + (i % 3) * 6;
          const starSize = 2 + (i % 3);
          const rotation = star.orbit.interpolate({
            inputRange: [0, 1],
            outputRange: [`${i * 45}deg`, `${i * 45 + (i % 2 === 0 ? 360 : -360)}deg`],
          });
          return (
            <Animated.View
              key={'star' + i}
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: starSize,
                height: starSize,
                borderRadius: starSize / 2,
                backgroundColor: i % 2 === 0 ? '#fde68a' : '#fed7aa',
                opacity: star.pulse,
                transform: [
                  { rotate: rotation },
                  { translateY: -orbitRadius },
                ],
                ...Platform.select({
                  ios: { shadowColor: '#fbbf24', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 2 },
                  android: {},
                }),
              }}
            />
          );
        })}
      </Animated.View>

      {/* ── Label ── */}
      {showLabel && <View style={s.labelWrap}>
        <Text style={[s.label, { color: labelColor ?? cfg.labelColor }]}>{'Lv.' + level}</Text>
        <Text style={[s.labelName, { color: labelColor ?? cfg.labelColor }]}>{cfg.label}</Text>
      </View>}
    </View>
  );
}

export function CoinUpgradeDemoScreen() {
  return (
    <View style={s.demoContainer}>
      <Text style={s.demoTitle}>Coin Upgrade Levels</Text>
      <Text style={s.demoSub}>Collect Ride Parts to upgrade your coins</Text>
      <View style={s.demoRow}>
        {[1, 2, 3, 4, 5].map(lv => (
          <CoinUpgradeDemo key={lv} level={lv} size={48} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinWrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0768b9',
  },
  placeholderCoin: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 20,
  },
  labelWrap: {
    alignItems: 'center',
    marginTop: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  labelName: {
    fontSize: 8,
    fontWeight: '700',
    opacity: 0.7,
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  demoContainer: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#0879ca',
  },
  demoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  demoSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  demoRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    width: '100%',
  },
});
