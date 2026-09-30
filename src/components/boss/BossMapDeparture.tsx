import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import type { RideControlClaim } from '../../api/endpoints/parks/rideControl';
import { TEAMS, teamName } from '../../constants/teams';
import { haptic } from '../../gamekit/Haptics';
import { ParticleField } from '../../gamekit/Particles';
import type { ParticleHandle } from '../../gamekit/Particles';
import { playSfx } from '../../gamekit/SFX';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import type { BossMapImpact } from '../../services/boss/mapImpact';
import { BRAND, GameIcon } from '../../ui';
import { Marker } from '../map/Marker';
import RideTeamFlag from '../map/RideTeamFlag';
import { BOSS_ART, BOSS_FX } from './bossArt';

const W = 320, H = 300;
/** The ride sits here inside the moment (anchor), the boss hovers up and right of it. */
const RIDE = { x: W / 2, y: H * 0.8 };

/** Beat timings (ms). One animation language: anticipation, overshoot, settle. */
export const MAP_BEAT = {
  anticipate: 180,
  exit: 1100,
  flagAt: 1350,
  fightersAt: 1650,
  fighterStagger: 140,
  total: 3400,
  reducedTotal: 1400,
} as const;

/**
 * The signature map beat after a boss falls (about 3.4s): the boss makes its
 * exit (Kraken dives with a splash, Robo-Shark shorts out in sparks, Ghost Squid
 * dissolves into wisps), the winning team's flag grows over the ride with team
 * confetti, and the top fighters' sharks pop up around it. "We helped cause that."
 *
 * Reduced motion: the same information, still: the boss faded with a check, the
 * flag and fighters in place, and a shorter hold before handing back to the map.
 */
export default function BossMapDeparture({ impact, flag, onComplete }: {
  readonly impact: BossMapImpact;
  /** The verified claim from useBossMapMoment; falls back to the receipt's own claim. */
  readonly flag?: RideControlClaim | null;
  readonly onComplete: (key: string) => void;
}) {
  const reduced = useReducedGameMotion();
  const latest = useRef(onComplete); latest.current = onComplete;
  const particles = useRef<ParticleHandle>(null);
  const claim = flag === undefined ? impact.claim : flag;
  const team = claim?.team ?? null;
  const held = !!claim && !claim.flipped;

  const boss = useSharedValue(0);      // 0 idle -> 1 gone
  const lift = useSharedValue(0);      // anticipation
  const jitter = useSharedValue(0);    // Robo-Shark short circuit
  const ripple = useSharedValue(0);    // Kraken splash rings
  const flagGrow = useSharedValue(0);
  const glow = useSharedValue(0);
  const pops = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];

  useEffect(() => {
    let done = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = () => { if (!done) { done = true; latest.current(impact.key); } };
    if (reduced) {
      boss.value = 1; flagGrow.value = team ? 1 : 0; glow.value = 0;
      pops.forEach(p => { p.value = 1; });
      timers.push(setTimeout(finish, MAP_BEAT.reducedTotal));
      return () => { done = true; timers.forEach(clearTimeout); };
    }
    boss.value = 0; lift.value = 0; flagGrow.value = 0; ripple.value = 0; glow.value = 0;
    pops.forEach(p => { p.value = 0; });
    // Anticipation: the boss rears up, then makes its exit.
    lift.value = withSequence(withTiming(1, { duration: MAP_BEAT.anticipate, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 260 }));
    boss.value = withDelay(MAP_BEAT.anticipate, withTiming(1, { duration: MAP_BEAT.exit, easing: Easing.in(Easing.cubic) }));
    if (impact.boss === 'robo_shark') {
      jitter.value = withDelay(MAP_BEAT.anticipate, withRepeat(withSequence(withTiming(1, { duration: 40 }), withTiming(-1, { duration: 40 })), 7, true));
    }
    if (impact.boss === 'kraken') {
      ripple.value = withDelay(MAP_BEAT.anticipate + 420, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    }
    const fx = BOSS_FX[impact.boss];
    timers.push(setTimeout(() => {
      const bossPoint = { x: RIDE.x + 34, y: RIDE.y - 92 };
      particles.current?.burst({ ...bossPoint, preset: 'burst', count: impact.boss === 'robo_shark' ? 34 : 26,
        colors: fx.particles, speed: impact.boss === 'ghost_squid' ? 0.45 : impact.boss === 'robo_shark' ? 1.3 : 0.9,
        size: impact.boss === 'robo_shark' ? 5 : 8 });
      haptic(impact.boss === 'robo_shark' ? 'comboHeavy' : 'hitMedium');
      playSfx(impact.boss === 'kraken' ? 'whoosh' : 'combo', 0.7);
    }, MAP_BEAT.anticipate + 380));
    // The flag: grows with an overshoot, confetti and the win sound on the same frame.
    timers.push(setTimeout(() => {
      if (team) {
        flagGrow.value = withSpring(1, { damping: 9, stiffness: 180, mass: 0.9 });
        glow.value = withSequence(withTiming(1, { duration: 220 }), withTiming(0.35, { duration: 900 }));
        particles.current?.burst({ x: RIDE.x + 30, y: RIDE.y - 160, preset: 'confetti', count: 48,
          colors: [TEAMS[team].color, BRAND.gold, BRAND.white, TEAMS[team].color] });
        haptic('success');
        playSfx('win', 0.8);
      }
    }, MAP_BEAT.flagAt));
    pops.forEach((p, i) => {
      if (i >= impact.fighters.length) return;
      p.value = withDelay(MAP_BEAT.fightersAt + i * MAP_BEAT.fighterStagger,
        withSequence(withSpring(1.18, { damping: 8, stiffness: 320 }), withSpring(1, { damping: 12, stiffness: 240 })));
    });
    timers.push(setTimeout(finish, MAP_BEAT.total));
    return () => {
      done = true;
      timers.forEach(clearTimeout);
      [boss, lift, jitter, ripple, flagGrow, glow, ...pops].forEach(v => cancelAnimation(v));
    };
  }, [impact.key, reduced]);

  const kind = impact.boss;
  const bossStyle = useAnimatedStyle(() => {
    const t = boss.value, up = lift.value;
    if (kind === 'kraken') {
      // Rear up, then dive into the water.
      return { opacity: t > 0.85 ? (1 - t) / 0.15 : 1, transform: [{ translateY: -8 * up + 70 * t * t },
        { scale: (1 + 0.1 * up) * (1 - 0.75 * t) }, { rotate: `${-10 * t}deg` }] };
    }
    if (kind === 'robo_shark') {
      // Short circuit: shake, tilt, power down and drop.
      return { opacity: t < 0.7 ? (Math.floor(t * 20) % 2 === 0 ? 1 : 0.55) : (1 - t) / 0.3,
        transform: [{ translateX: 3 * jitter.value + 26 * t }, { translateY: -6 * up + 30 * t * t },
          { rotate: `${22 * t}deg` }, { scale: 1 + 0.08 * up - 0.2 * t }] };
    }
    // Ghost Squid: rises and dissolves.
    return { opacity: 1 - t, transform: [{ translateY: -6 * up - 60 * t }, { translateX: Math.sin(t * 9) * 8 },
      { scale: 1 + 0.08 * up + 0.25 * t }] };
  });
  const ringStyle = (delay: number) => useAnimatedStyle(() => {
    const r = Math.max(0, Math.min(1, (ripple.value - delay) / (1 - delay)));
    return { opacity: r > 0 ? 0.9 * (1 - r) : 0, transform: [{ scaleX: 0.3 + 1.4 * r }, { scaleY: 0.3 + 1.4 * r }] };
  });
  const ringA = ringStyle(0), ringB = ringStyle(0.25);
  const flagStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, flagGrow.value * 3),
    transform: [{ translateY: 18 * (1 - flagGrow.value) }, { scale: 0.3 + 0.7 * flagGrow.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.8 + 0.5 * glow.value }] }));
  const popStyles = pops.map(p => useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 2),
    transform: [{ translateY: 16 * (1 - p.value) }, { scale: p.value }] })));
  // Around the landmark, never on it: left, right, and up high on the left.
  const spots = [{ x: RIDE.x - 104, y: RIDE.y - 78 }, { x: RIDE.x + 104, y: RIDE.y - 70 }, { x: RIDE.x - 92, y: RIDE.y - 160 }];

  return <Marker coordinate={impact.coordinate} anchor={{ x: 0.5, y: RIDE.y / H }}>
    <View style={styles.wrap} accessibilityLabel={`Boss cleared at ${impact.rideName}. Your ${impact.yourDamage} damage helped.${team
      ? held ? ` ${teamName(team)} held the ride.` : ` ${teamName(team)} raised its flag.` : ''}`}>
      {kind === 'kraken' && !reduced && <>
        <Animated.View style={[styles.ring, ringA]} />
        <Animated.View style={[styles.ring, ringB]} />
      </>}
      {team && <Animated.View style={[styles.glow, { backgroundColor: TEAMS[team].color }, glowStyle]} />}
      <Animated.View style={[styles.boss, reduced ? styles.bossReduced : bossStyle]}>
        <Image source={BOSS_ART[kind]} style={styles.art} contentFit="contain" />
      </Animated.View>
      {reduced && <View style={styles.stamp}><GameIcon name="check" size={26} accessibilityLabel="Defeated" /></View>}
      {team && <Animated.View style={[styles.flag, flagStyle]}>
        <RideTeamFlag team={team} size={2.2} />
        {held && <View style={styles.heldTag}><Text style={styles.heldText}>HELD!</Text></View>}
      </Animated.View>}
      {impact.fighters.map((fighter, i) => (
        <Animated.View key={`${fighter.username}-${i}`} style={[styles.fighter, { left: spots[i].x - 38, top: spots[i].y - 30 }, popStyles[i]]}>
          <View style={[styles.fighterRing, { borderColor: fighter.team ? TEAMS[fighter.team].color : BRAND.gold }]}>
            <GameIcon name="shark" size={34} />
          </View>
          {i === 0 && <View style={styles.fighterCrown}><GameIcon name="crown" size={18} /></View>}
          <Text style={[styles.fighterName, fighter.you && { color: BRAND.gold }]} numberOfLines={1}>{fighter.you ? 'You' : fighter.username}</Text>
        </Animated.View>
      ))}
      {!reduced && <ParticleField ref={particles} width={W} height={H} style={StyleSheet.absoluteFill} />}
    </View>
  </Marker>;
}

const styles = StyleSheet.create({
  wrap: { width: W, height: H },
  boss: { position: 'absolute', left: RIDE.x + 34 - 34, top: RIDE.y - 92 - 34, width: 68, height: 68, zIndex: 3 },
  bossReduced: { opacity: 0.45 },
  art: { width: 68, height: 68 },
  stamp: { position: 'absolute', left: RIDE.x + 34 + 10, top: RIDE.y - 92 + 8, zIndex: 4 },
  ring: { position: 'absolute', left: RIDE.x + 34 - 40, top: RIDE.y - 46, width: 80, height: 26, borderRadius: 40,
    borderWidth: 3, borderColor: '#bfe5ff' },
  glow: { position: 'absolute', left: RIDE.x - 40, top: RIDE.y - 200, width: 110, height: 110, borderRadius: 55 },
  // Above the landmark's roof so the ride art never covers it.
  flag: { position: 'absolute', left: RIDE.x - 4, top: RIDE.y - 196, width: 70, height: 90, alignItems: 'flex-start', zIndex: 5 },
  heldTag: { position: 'absolute', top: -14, left: 44, backgroundColor: BRAND.gold, borderRadius: 8, borderWidth: 2,
    borderColor: BRAND.white, paddingHorizontal: 6, paddingVertical: 1, transform: [{ rotate: '-8deg' }] },
  heldText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy },
  fighter: { position: 'absolute', width: 76, alignItems: 'center', zIndex: 6 },
  fighterRing: { width: 46, height: 46, borderRadius: 23, backgroundColor: BRAND.white, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center' },
  fighterCrown: { position: 'absolute', top: -10, right: 10, transform: [{ rotate: '14deg' }] },
  fighterName: { marginTop: 1, maxWidth: 76, fontFamily: 'Shark', fontSize: 12, color: BRAND.white, textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 1 },
});
