import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { BossRaid } from '../../api/endpoints/parks/raid';
import { BOSS_ART } from '../../games/boss/BossBrawl';
import { Marker } from '../map/Marker';

/** The raid boss hovering over its ride: small, bobbing, with its shared HP bar. */
export default function BossMarker({ raid, onPress }: { readonly raid: BossRaid; readonly onPress: () => void }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [p]);
  const bob = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.sin(p.value * Math.PI * 2) * 4 }, { rotate: `${Math.sin(p.value * Math.PI * 4) * 6}deg` }],
  }));
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 - p.value * 0.6, transform: [{ scale: 0.6 + p.value * 0.8 }] }));
  if (raid.latitude === null || raid.longitude === null) return null;
  const hp = Math.max(0.03, raid.hp_left / Math.max(1, raid.hp_max));
  return (
    // Anchored so the boss hovers beside its ride's landmark instead of covering it.
    <Marker coordinate={{ latitude: raid.latitude, longitude: raid.longitude }} anchor={{ x: -0.2, y: 1.15 }} onPress={onPress}
      accessibilityLabel={`Boss raid at ${raid.ride_name ?? 'this ride'}. Open.`}>
      <View style={styles.wrap}>
        <Animated.View style={[styles.ring, ring]} />
        <View style={styles.hpTrack}><View style={[styles.hpFill, { width: `${hp * 100}%` }]} /></View>
        <Animated.View style={bob}>
          <Image source={BOSS_ART[raid.boss]} style={styles.boss} contentFit="contain" />
        </Animated.View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 70, height: 88, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 },
  boss: { width: 50, height: 50 },
  ring: { position: 'absolute', bottom: 0, width: 60, height: 22, borderRadius: 30, borderWidth: 3, borderColor: '#ef4444' },
  hpTrack: { width: 46, height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: '#fff',
    overflow: 'hidden', marginBottom: 2 },
  hpFill: { height: '100%', backgroundColor: '#ef4444' },
});
