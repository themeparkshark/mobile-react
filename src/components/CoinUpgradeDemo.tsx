import { useEffect, useState } from 'react';
import { AccessibilityInfo, View, Text, StyleSheet, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Reanimated, { useAnimatedStyle, useFrameCallback, useSharedValue, type AnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { COIN_TIERS } from '../constants/coinTiers';
import { usePowerBudget } from '../power';

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
  const cfg = LEVEL_CONFIG[Math.min(level - 1, LEVEL_CONFIG.length - 1)];
  const effectArea = size * 1.5; // total effect zone
  const [reducedMotion, setReducedMotion] = useState(true);
  const budget = usePowerBudget();

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

  // One clock for every effect on this coin, on the UI thread. A level change only changes which
  // effects are drawn: nothing restarts (it used to stop and start about 25 Animated loops on the
  // same frame, which held the Legendary level-up burst for about a second). The clock stops when
  // the coin is still (Reduce Motion, animate off) or ambient loops are not allowed (idle, background).
  const running = animate && !reducedMotion && budget.ambient;
  const t = useCoinClock(running);
  const on = useSharedValue(running ? 1 : 0);
  useEffect(() => { on.value = running ? 1 : 0; }, [on, running]);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -4 * wave(t.value, 4000) }] }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.08 * wave(t.value, 2400) }] }));
  const plasmaStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${360 * phase(t.value, 2000)}deg` }, { scale: 1 + 0.08 * wave(t.value, 2400) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.15 + 0.55 * wave(t.value, 3000),
    transform: [{ scale: 1 + 0.08 * wave(t.value, 2400) }],
  }));
  const ringGlowStyle = useAnimatedStyle(() => ({ opacity: 0.15 + 0.55 * wave(t.value, 3000) }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -size + 2 * size * phase(t.value, 2200) }, { rotate: '20deg' }],
  }));
  // Ring size
  const ringSize = size + 8;

  return (
    <View style={[s.container, { width: effectArea, height: effectArea }]}>
      {/* ── Lv5: Electric crackle bolts ── */}
      {level >= 5 && BOLTS.map(i => <Bolt key={'bolt' + i} i={i} t={t} on={on} size={size} effectArea={effectArea} />)}

      {/* ── Lv4+: Light rays ── */}
      {level >= 4 && RAYS.map(i => <Ray key={'ray' + i} i={i} t={t} on={on} size={size} effectArea={effectArea} gold={level >= 5} />)}

      {/* ── Main coin group (floats on Lv3+) ── */}
      <Reanimated.View style={[{ alignItems: 'center', justifyContent: 'center' }, level >= 3 ? floatStyle : null]}>

        {/* ── Lv5: Plasma ring ── */}
        {level >= 5 && (
          <Reanimated.View
            pointerEvents="none"
            style={[{
              position: 'absolute',
              width: ringSize + 8,
              height: ringSize + 8,
              borderRadius: (ringSize + 8) / 2,
              borderWidth: 2.5,
              borderColor: '#ffb400',
              opacity: 0.7,
              ...Platform.select({
                ios: { shadowColor: '#ffb400', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 12 },
                android: { elevation: 8 },
              }),
            }, plasmaStyle]}
          />
        )}

        {/* ── Lv4: Prismatic animated border ring ── */}
        {level >= 4 && level < 5 && (
          <Reanimated.View
            pointerEvents="none"
            style={[{
              position: 'absolute',
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderWidth: 2.5,
              borderColor: cfg.borderColor,
              ...Platform.select({
                ios: { shadowColor: '#5fd0ff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 10 },
                android: { elevation: 6 },
              }),
            }, pulseStyle]}
          />
        )}

        {/* ── Lv2-3: Glow aura ── */}
        {level >= 2 && level < 4 && (
          <Reanimated.View
            pointerEvents="none"
            style={[{
              position: 'absolute',
              width: size + 16,
              height: size + 16,
              borderRadius: (size + 16) / 2,
              backgroundColor: level === 3 ? 'rgba(251,191,36,0.15)' : 'rgba(148,163,184,0.1)',
            }, glowStyle]}
          />
        )}

        {/* ── Lv2+: Breathing inner ring ── */}
        {level >= 2 && level < 4 && (
          <Reanimated.View
            pointerEvents="none"
            style={[{
              position: 'absolute',
              width: size + 4,
              height: size + 4,
              borderRadius: (size + 4) / 2,
              borderWidth: 1.5,
              borderColor: cfg.borderColor,
            }, ringGlowStyle]}
          />
        )}

        {/* ── Lv2: Mercury blobs orbiting edge ── */}
        {level >= 2 && level < 4 && MERCURY.map(i => <Mercury key={'merc' + i} i={i} t={t} size={size} gold={level === 3} />)}

        {/* ── THE COIN ── */}
        <View style={[s.coinWrap, {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: level === 1 ? 2 : 4,
          borderColor: EARNED_RIM_COLORS[Math.min(level - 1, EARNED_RIM_COLORS.length - 1)],
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
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: size / 2,
                overflow: 'hidden',
              }}
            >
              <Reanimated.View style={[{
                position: 'absolute',
                top: -5,
                width: level >= 4 ? 16 : 10,
                height: size + 10,
                backgroundColor: level >= 5 ? 'rgba(251,191,36,0.35)' : level >= 4 ? 'rgba(95,208,255,0.3)' : 'rgba(255,255,255,0.25)',
              }, shimmerStyle]} />
            </View>
          )}
        </View>

        {/* ── Lv3+: Orbiting motes ── */}
        {level >= 3 && MOTES.map(i => <Mote key={'mote' + i} i={i} t={t} size={size} level={level} />)}

        {/* ── Lv5: Constellation stars (wider orbit) ── */}
        {level >= 5 && STARS.map(i => <Star key={'star' + i} i={i} t={t} size={size} />)}
      </Reanimated.View>

      {/* ── Label ── */}
      {showLabel && <View style={s.labelWrap}>
        <Text style={[s.label, { color: labelColor ?? cfg.labelColor }]}>{'Lv.' + level}</Text>
        <Text style={[s.labelName, { color: labelColor ?? cfg.labelColor }]}>{cfg.label}</Text>
      </View>}
    </View>
  );
}

const MERCURY = [0, 1, 2];
const MOTES = [0, 1, 2, 3, 4, 5];
const RAYS = [0, 1, 2, 3, 4, 5, 6, 7];
const BOLTS = Array.from({ length: 12 }, (_, i) => i);
const STARS = [0, 1, 2, 3, 4, 5, 6, 7];

/** 0..1 through one period of `ms`. */
function phase(t: number, ms: number): number {
  'worklet';
  return (t % ms) / ms;
}

/** A smooth 0 -> 1 -> 0 swing over one period (the old inOut(sin) there-and-back loops). */
function wave(t: number, ms: number): number {
  'worklet';
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase(t, ms));
}

/** The old Animated default curve (ease in and out). */
function easeInOut(x: number): number {
  'worklet';
  return x * x * (3 - 2 * x);
}

type Clock = SharedValue<number>;

/** Milliseconds since the coin started moving, advanced on the UI thread while `running` (a hitch never jumps more than 50 ms). */
function useCoinClock(running: boolean): Clock {
  const t = useSharedValue(0);
  const frame = useFrameCallback((info) => {
    'worklet';
    t.value += Math.min(info.timeSincePreviousFrame ?? 16, 50);
  }, false);
  useEffect(() => {
    frame.setActive(running);
    return () => frame.setActive(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  return t;
}

/**
 * A moving light dot with its glow drawn as a soft halo disc (no iOS shadow): a shadow on a moving view is
 * recomputed every frame the whole time the card is up, the halo costs nothing extra.
 */
function GlowDot({ size, color, halo = color, style }: {
  readonly size: number; readonly color: string; readonly halo?: string;
  readonly style: StyleProp<AnimatedStyle<ViewStyle>>;
}) {
  const outer = size * 2.6;
  return (
    <Reanimated.View pointerEvents="none" style={[{
      position: 'absolute', width: outer, height: outer, borderRadius: outer / 2, backgroundColor: `${halo}40`,
      alignItems: 'center', justifyContent: 'center',
    }, style]}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </Reanimated.View>
  );
}

function Mercury({ i, t, size, gold }: { readonly i: number; readonly t: Clock; readonly size: number; readonly gold: boolean }) {
  const orbitRadius = size / 2 + 2;
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${i * 120 + 360 * phase(t.value, 3000 + i * 800)}deg` }, { translateY: -orbitRadius }],
  }));
  const color = gold ? '#fbbf24' : '#e2e8f0';
  return <GlowDot size={gold ? 6 : 5} color={color} style={style} />;
}

function Mote({ i, t, size, level }: { readonly i: number; readonly t: Clock; readonly size: number; readonly level: number }) {
  const orbitRadius = size / 2 + (level >= 5 ? 14 : level >= 4 ? 10 : 8);
  const moteSize = level >= 5 ? 4 : level >= 4 ? 3.5 : 3;
  const dir = i % 2 === 0 ? 1 : -1;
  const color = level >= 5
    ? (i % 3 === 0 ? '#ffb400' : i % 3 === 1 ? '#ffcf3b' : '#ffffff')
    : level >= 4
      ? PRISMATIC_COLORS[i % PRISMATIC_COLORS.length]
      : '#fbbf24';
  const style = useAnimatedStyle(() => ({
    opacity: 0.2 + 0.8 * wave(t.value, 2 * (400 + i * 100)),
    transform: [{ rotate: `${i * 60 + dir * 360 * phase(t.value, 4000 + i * 600)}deg` }, { translateY: -orbitRadius }],
  }));
  return <GlowDot size={moteSize} color={color} style={style} />;
}

function Star({ i, t, size }: { readonly i: number; readonly t: Clock; readonly size: number }) {
  const orbitRadius = size / 2 + 22 + (i % 3) * 6;
  const starSize = 2 + (i % 3);
  const dir = i % 2 === 0 ? 1 : -1;
  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.7 * wave(t.value, 2 * (600 + i * 150)),
    transform: [{ rotate: `${i * 45 + dir * 360 * phase(t.value, 6000 + i * 1000)}deg` }, { translateY: -orbitRadius }],
  }));
  return <GlowDot size={starSize} color={i % 2 === 0 ? '#fde68a' : '#fed7aa'} halo="#fbbf24" style={style} />;
}

/** A light ray that flares out from the centre: wait i x 180 ms, flare for 800 ms, rest 1.2 s, repeat. */
function Ray({ i, t, on, size, effectArea, gold }: {
  readonly i: number; readonly t: Clock; readonly on: Clock; readonly size: number; readonly effectArea: number; readonly gold: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const local = (t.value % (2000 + i * 180)) - i * 180;
    if (on.value === 0 || local < 0 || local > 800) return { opacity: 0, transform: [{ rotate: `${i * 45}deg` }, { scaleY: 0.3 }] };
    const x = local / 800;
    const opacity = local < 200 ? 0.6 * (local / 200) : 0.6 * (1 - (local - 200) / 600);
    return { opacity, transform: [{ rotate: `${i * 45}deg` }, { scaleY: 0.3 + 1.2 * (1 - (1 - x) * (1 - x)) }] };
  });
  return (
    <Reanimated.View pointerEvents="none" style={[{
      position: 'absolute', left: effectArea / 2 - 1.5, top: effectArea / 2 - size * 0.4, width: 3, height: size * 0.8,
      borderRadius: 1.5, backgroundColor: gold ? '#ffcf3b' : '#bfe5ff',
    }, style]} />
  );
}

/** An electric crackle: wait i x 120 ms, flicker out from the rim for 310 ms, rest 1.8 s, repeat. */
function Bolt({ i, t, on, size, effectArea }: {
  readonly i: number; readonly t: Clock; readonly on: Clock; readonly size: number; readonly effectArea: number;
}) {
  const angle = (i / BOLTS.length) * Math.PI * 2;
  const dist = size * (0.35 + (i % 4) * 0.08);
  const fromX = Math.cos(angle) * size * 0.3;
  const fromY = Math.sin(angle) * size * 0.3;
  const toX = Math.cos(angle) * dist;
  const toY = Math.sin(angle) * dist;
  const turn = `${(i * 47) % 360}deg`;
  const style = useAnimatedStyle(() => {
    const local = (t.value % (i * 120 + 310 + 1800)) - i * 120;
    if (on.value === 0 || local < 0 || local > 310) return { opacity: 0, transform: [{ translateX: fromX }, { translateY: fromY }, { scale: 0.2 }, { rotate: turn }] };
    const opacity = local < 50 ? local / 50 : local < 80 ? 1 - 0.2 * ((local - 50) / 30) : local < 110 ? 0.8 + 0.2 * ((local - 80) / 30) : 1 - (local - 110) / 200;
    const k = easeInOut(local / 310);
    return {
      opacity,
      transform: [{ translateX: fromX + (toX - fromX) * k }, { translateY: fromY + (toY - fromY) * k }, { scale: 0.2 + 0.8 * k }, { rotate: turn }],
    };
  });
  return (
    <Reanimated.View pointerEvents="none" style={[{
      position: 'absolute', left: effectArea / 2 - 1, top: effectArea / 2 - 1, width: 2, height: i % 3 === 0 ? 12 : 8,
      borderRadius: 1, backgroundColor: i % 2 === 0 ? '#ffffff' : '#ffcf3b',
    }, style]} />
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
    fontFamily: 'Shark',
    fontSize: 20,
  },
  labelWrap: {
    alignItems: 'center',
    marginTop: 4,
  },
  label: {
    fontFamily: 'Shark',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  labelName: {
    fontFamily: 'Knockout',
    fontSize: 10,
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
    fontFamily: 'Shark',
    fontSize: 20,
  },
  demoSub: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Knockout',
    fontSize: 15,
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
