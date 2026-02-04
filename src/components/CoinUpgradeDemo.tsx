import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { Image } from 'expo-image';

interface Props {
  level: number;
  coinUrl?: string;
  size?: number;
}

const LEVEL_CONFIG = [
  { label: 'Basic', labelColor: '#a8a29e', borderColor: '#57534e', bgTint: 'rgba(120,113,108,0.08)' },
  { label: 'Silver', labelColor: '#cbd5e1', borderColor: '#94a3b8', bgTint: 'rgba(148,163,184,0.12)' },
  { label: 'Gold', labelColor: '#fbbf24', borderColor: '#f59e0b', bgTint: 'rgba(251,191,36,0.1)' },
  { label: 'Prismatic', labelColor: '#c4b5fd', borderColor: '#a78bfa', bgTint: 'rgba(167,139,250,0.1)' },
  { label: 'Legendary', labelColor: '#fb923c', borderColor: '#f97316', bgTint: 'rgba(249,115,22,0.12)' },
];

// Prismatic color cycle positions
const PRISMATIC_COLORS = ['#a78bfa', '#ec4899', '#3b82f6', '#22c55e', '#fbbf24', '#a78bfa'];

export default function CoinUpgradeDemo({ level, coinUrl, size = 70 }: Props) {
  const cfg = LEVEL_CONFIG[Math.min(level - 1, 4)];
  const center = size / 2;
  const effectArea = size * 1.5; // total effect zone
  const effectOffset = (effectArea - size) / 2;

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

  // ── Lv4: Prismatic color cycle + light rays ──
  const prismaticStep = useRef(0);
  const prismaticColor = useRef('#a78bfa');
  const prismaticTimer = useRef<ReturnType<typeof setInterval> | null>(null);
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
      // Color cycle via interval (avoids useNativeDriver:false crash)
      prismaticTimer.current = setInterval(() => {
        prismaticStep.current = (prismaticStep.current + 1) % PRISMATIC_COLORS.length;
        prismaticColor.current = PRISMATIC_COLORS[prismaticStep.current];
      }, 500);
      anims.push(Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ));

      // Staggered light rays
      rayAnims.forEach((ray, i) => {
        const loop = () => {
          ray.opacity.setValue(0);
          ray.scale.setValue(0.3);
          Animated.sequence([
            Animated.delay(i * 400 + Math.random() * 500),
            Animated.parallel([
              Animated.sequence([
                Animated.timing(ray.opacity, { toValue: 0.6, duration: 200, useNativeDriver: true }),
                Animated.timing(ray.opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
              ]),
              Animated.timing(ray.scale, { toValue: 1.5, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            ]),
          ]).start(() => loop());
        };
        loop();
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
        const loop = () => {
          const angle = Math.random() * Math.PI * 2;
          const dist = size * 0.35 + Math.random() * size * 0.3;
          bolt.opacity.setValue(0);
          bolt.scale.setValue(0.2);
          bolt.x.setValue(Math.cos(angle) * size * 0.3);
          bolt.y.setValue(Math.sin(angle) * size * 0.3);
          Animated.sequence([
            Animated.delay(i * 150 + Math.random() * 400),
            Animated.parallel([
              Animated.sequence([
                Animated.timing(bolt.opacity, { toValue: 1, duration: 50, useNativeDriver: true }),
                Animated.timing(bolt.opacity, { toValue: 0.8, duration: 30, useNativeDriver: true }),
                Animated.timing(bolt.opacity, { toValue: 1, duration: 30, useNativeDriver: true }),
                Animated.timing(bolt.opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
              ]),
              Animated.timing(bolt.x, { toValue: Math.cos(angle) * dist, duration: 310, useNativeDriver: true }),
              Animated.timing(bolt.y, { toValue: Math.sin(angle) * dist, duration: 310, useNativeDriver: true }),
              Animated.timing(bolt.scale, { toValue: 1, duration: 310, useNativeDriver: true }),
            ]),
          ]).start(() => loop());
        };
        loop();
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
      if (prismaticTimer.current) clearInterval(prismaticTimer.current);
    };
  }, [level]);

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
  // Prismatic border uses static cycling (no Animated color interpolation needed)

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
            backgroundColor: i % 2 === 0 ? '#60a5fa' : '#c084fc',
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
        const angle = (i / 8) * Math.PI * 2;
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
              backgroundColor: level >= 5 ? '#fb923c' : '#c4b5fd',
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
              borderColor: '#f97316',
              opacity: 0.7,
              transform: [{ rotate: plasmaRotation }, { scale: pulseAnim }],
              ...Platform.select({
                ios: { shadowColor: '#f97316', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 12 },
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
                ios: { shadowColor: '#a78bfa', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 10 },
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
          borderWidth: level === 1 ? 2 : 0,
          borderColor: level === 1 ? cfg.borderColor : 'transparent',
          ...Platform.select({
            ios: {
              shadowColor: level >= 5 ? '#f97316' : level >= 4 ? '#a78bfa' : level >= 3 ? '#fbbf24' : '#000',
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
              style={{ width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }}
              contentFit="cover"
            />
          ) : (
            <View style={[s.placeholderCoin, {
              width: size - 4, height: size - 4, borderRadius: (size - 4) / 2,
              backgroundColor: level >= 5 ? '#1a0a00' : level >= 4 ? '#1a1030' : level >= 3 ? '#1a1500' : '#334155',
            }]}>
              <Text style={[s.placeholderText, {
                color: level >= 5 ? '#f97316' : level >= 4 ? '#a78bfa' : level >= 3 ? '#fbbf24' : level >= 2 ? '#94a3b8' : '#64748b',
              }]}>🦈</Text>
            </View>
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
            ? (i % 3 === 0 ? '#f97316' : i % 3 === 1 ? '#fbbf24' : '#ef4444')
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
      <View style={s.labelWrap}>
        <Text style={[s.label, { color: cfg.labelColor }]}>{'Lv.' + level}</Text>
        <Text style={[s.labelName, { color: cfg.labelColor }]}>{cfg.label}</Text>
      </View>
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
    backgroundColor: '#1e293b',
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
    backgroundColor: '#0d0d1a',
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
