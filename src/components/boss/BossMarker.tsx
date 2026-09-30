import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import type { BossRaid } from '../../api/endpoints/parks/raid';
import { Marker } from '../map/Marker';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { bossDisplayCoordinate } from '../../services/boss/mapImpact';
import { BOSS_ART } from './bossArt';

export const BOSS_MARKER_SIZE = 76;

/**
 * The raid boss beside its ride: it lands with a splash the first time it
 * appears, then bobs with a pulsing ring and its shared HP bar.
 */
export default function BossMarker({ raid, onPress, animate = true }: { readonly raid: BossRaid; readonly onPress: () => void; readonly animate?: boolean }) {
  const p = useSharedValue(0);
  const land = useSharedValue(1);
  const splash = useSharedValue(0);
  const reduced = useReducedGameMotion();
  useEffect(() => {
    if (reduced) { land.value = 1; splash.value = 0; return; }
    // Drop in from above, squash on landing, splash rings out.
    land.value = 0;
    land.value = withSequence(withTiming(1, { duration: 420, easing: Easing.in(Easing.quad) }),
      withSpring(1, { damping: 7, stiffness: 300 }));
    splash.value = withDelay(400, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    return () => { cancelAnimation(land); cancelAnimation(splash); };
  }, [raid.id, reduced, land, splash]);
  useEffect(() => {
    p.value = 0;
    if (!reduced && animate) p.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [p, reduced, animate]);
  const bob = useAnimatedStyle(() => {
    const drop = 1 - land.value;
    const squash = land.value > 0.98 ? 0 : Math.max(0, land.value - 0.85) * 0.6;
    return { transform: [{ translateY: -90 * drop + Math.sin(p.value * Math.PI * 2) * 4 },
      { rotate: `${Math.sin(p.value * Math.PI * 4) * 5}deg` }, { scaleY: 1 - squash }, { scaleX: 1 + squash }] };
  });
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 - p.value * 0.6, transform: [{ scale: 0.6 + p.value * 0.8 }] }));
  const splashStyle = useAnimatedStyle(() => ({ opacity: splash.value > 0 ? 0.9 * (1 - splash.value) : 0,
    transform: [{ scaleX: 0.4 + 1.6 * splash.value }, { scaleY: 0.4 + 1.2 * splash.value }] }));
  if (raid.latitude === null || raid.longitude === null) return null;
  const hp = Math.min(1, Math.max(0, raid.hp_left / Math.max(1, raid.hp_max)));
  return (
    // Anchored so the boss hovers beside its ride's landmark instead of covering it.
    <Marker coordinate={bossDisplayCoordinate({ latitude: raid.latitude, longitude: raid.longitude })} anchor={{ x: 0.5, y: 0.9 }} onPress={onPress}
      accessibilityLabel={`Boss raid at ${raid.ride_name ?? 'this ride'}, ${Math.round(hp * 100)} percent health. Open.`}>
      <View style={styles.wrap}>
        <Animated.View style={[styles.ring, reduced || !animate ? { opacity: 0.4 } : ring]} />
        {!reduced && <Animated.View style={[styles.splash, splashStyle]} />}
        <View style={styles.hpTrack}><View style={[styles.hpFill, { width: `${hp * 100}%` }]} /></View>
        <Animated.View style={bob}>
          <Image source={BOSS_ART[raid.boss]} style={styles.boss} contentFit="contain" />
        </Animated.View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 96, height: 118, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 },
  boss: { width: BOSS_MARKER_SIZE, height: BOSS_MARKER_SIZE },
  ring: { position: 'absolute', bottom: 0, width: 78, height: 26, borderRadius: 39, borderWidth: 3, borderColor: '#ef4a3c' },
  splash: { position: 'absolute', bottom: 2, width: 70, height: 20, borderRadius: 35, borderWidth: 3, borderColor: '#ffffff' },
  hpTrack: { width: 60, height: 8, borderRadius: 4, backgroundColor: 'rgba(5,52,110,0.45)', borderWidth: 1.5, borderColor: '#fff',
    overflow: 'hidden', marginBottom: 3 },
  hpFill: { height: '100%', backgroundColor: '#ef4a3c' },
});
