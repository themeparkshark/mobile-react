import { memo, useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { LiveEvent } from '../../api/endpoints/live-events';
import { playSfx } from '../../gamekit/SFX';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { frenzyLine } from '../../services/liveEvents/model';

const seen = new Set<string>();
export function resetFrenzySweepForTests(): void { seen.clear(); }

/**
 * Frenzy start, map-wide: one gold shimmer band sweeps across the whole map
 * (one gradient view, 1.1 s, UI thread, then unmounts) with the horn cue.
 * Once per Frenzy window. Mount over the map with absoluteFill; it never takes touches.
 */
function FrenzySweep({ event }: { readonly event: LiveEvent | null }) {
  const reduced = useReducedGameMotion();
  const { width, height } = useWindowDimensions();
  const key = event && frenzyLine(event) ? `${event.id}:${event.frenzy.ends_at}` : null;
  const [on, setOn] = useState(false);
  const x = useSharedValue(-1);
  useEffect(() => {
    if (!key || seen.has(key) || reduced) return;
    seen.add(key);
    setOn(true);
    playSfx('whoosh');
    setTimeout(() => playSfx('go'), 180); // the horn beat
    x.value = -1;
    x.value = withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }, done => { if (done) runOnJS(setOn)(false); });
  }, [key, reduced, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * (width + 260) }, { rotate: '18deg' }] }));
  if (!on) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.band, { height: height * 1.6, top: -height * 0.3, left: width / 2 - 130 }, style]}>
      <LinearGradient colors={['rgba(255,207,59,0)', 'rgba(255,224,122,0.55)', 'rgba(255,255,255,0.7)', 'rgba(255,224,122,0.55)', 'rgba(255,207,59,0)']}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

export default memo(FrenzySweep);

const styles = StyleSheet.create({ band: { position: 'absolute', width: 260 } });
