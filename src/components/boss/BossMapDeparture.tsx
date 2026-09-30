import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BOSS_ART_SCALE, BOSS_ART } from '../../games/boss/BossBrawl';
import { bossDisplayCoordinate, type BossMapImpact } from '../../services/boss/mapImpact';
import { Marker } from '../map/Marker';

/** Reuses the intact approved character art: dive, power down, or drift away. */
export default function BossMapDeparture({ impact, onComplete }: {
  readonly impact: BossMapImpact;
  readonly onComplete: (key: string) => void;
}) {
  const reduced = useReducedGameMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const latest = useRef(onComplete); latest.current = onComplete;
  useEffect(() => {
    let cancelled = false, completed = false;
    progress.setValue(0);
    const duration = reduced ? 450 : 1800;
    const animation = reduced ? null : Animated.timing(progress, { toValue: 1, duration,
      easing: Easing.inOut(Easing.cubic), useNativeDriver: true });
    animation?.start();
    // A bounded JS handoff also works when an animation callback is interrupted by the native map.
    const timer = setTimeout(() => { if (!cancelled && !completed) { completed = true; latest.current(impact.key); } }, duration);
    return () => { cancelled = true; clearTimeout(timer); animation?.stop(); };
  }, [impact.key, progress, reduced]);
  const dive = impact.boss === 'kraken', robot = impact.boss === 'robo_shark';
  const character = reduced ? {} : {
    opacity: progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 0.9, 0] }),
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: robot ? [0, -4, 35] : [0, 0, 0] }) },
      { translateY: progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: dive ? [0, -5, 27] : robot ? [0, 3, 7] : [0, -8, -43] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: dive ? [1, 0.2] : [1, 0.8] }) },
      { rotate: progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: robot ? ['0deg', '-12deg', '8deg'] : ['0deg', '0deg', '0deg'] }) },
    ],
  };
  const sparkle = reduced ? {} : { opacity: progress.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 1, 0] }),
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.2] }) }] };
  return <Marker coordinate={bossDisplayCoordinate(impact.coordinate)} anchor={{ x: 0.5, y: 0.9 }}>
    <View style={styles.wrap} accessibilityLabel={`Boss cleared at ${impact.rideName}. Your ${impact.yourDamage} damage helped.`}>
      {dive && !reduced && <View style={styles.pool} />}
      <Animated.View style={[styles.character, character]}>
        <Image source={BOSS_ART[impact.boss]} allowDownscaling={impact.boss !== 'robo_shark'}
          style={[styles.art, { transform: [{ scale: BOSS_ART_SCALE?.[impact.boss] ?? 1 }] }]} contentFit="contain" />
      </Animated.View>
      {reduced ? <View style={styles.stamp}><Text style={styles.check}>✓</Text></View>
        : <Animated.View style={[styles.sparkles, sparkle]}>
          {(dive ? ['○', '○', '○'] : robot ? ['✦', 'ϟ', '✦'] : ['✦', '✧', '✦']).map((symbol, i) =>
            <Text key={i} style={[styles.sparkle, { left: [5, 34, 63][i], top: [34, 12, 40][i], color: dive ? '#a0edff' : '#ffdc61' }]}>{symbol}</Text>)}
        </Animated.View>}
    </View>
  </Marker>;
}

const styles = StyleSheet.create({
  wrap: { width: 80, height: 96, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 },
  character: { zIndex: 2 },
  art: { width: 52, height: 52 },
  pool: { position: 'absolute', bottom: 4, width: 52, height: 13, borderRadius: 26, backgroundColor: '#197bb0', borderWidth: 2, borderColor: '#a0edff' },
  sparkles: { ...StyleSheet.absoluteFillObject, zIndex: 3 },
  sparkle: { position: 'absolute', fontSize: 19 },
  stamp: { position: 'absolute', bottom: 7, right: 3, width: 24, height: 24, borderRadius: 12, backgroundColor: '#ffcf3b', borderWidth: 2, borderColor: '#fff' },
  check: { color: '#143b56', fontWeight: '900', fontSize: 16, textAlign: 'center' },
});
