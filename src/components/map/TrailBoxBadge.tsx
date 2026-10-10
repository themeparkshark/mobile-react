import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { BRAND, GameIcon } from '../../ui';
import { useTrail } from '../../services/trail/TrailProvider';
import { mapTrailOf } from './mapTrail';

/**
 * Trail Boxes (steps stream, claude/fb-steps): the walk-to-open box rides on the map shark's back while
 * it fills, so a kid sees "my walking fills this". The steps stream wires its provider at integration
 * (useTrail: walking box, headlineBox tier and steps, ready count) into this small shape.
 * Release 3 ports only this badge from claude/fb-motion; TrailBoxCue reads useTrail itself.
 */
export interface MapTrail {
  /** A box is filling with steps right now. */
  readonly walking: boolean;
  readonly tier: 'blue' | 'red' | 'gold' | null;
  /** 0..1 of the headline box's goal. */
  readonly progress: number;
  /** Boxes ready to open; when it goes up, the shark celebrates. */
  readonly readyCount: number;
}

const TIER: Record<'blue' | 'red' | 'gold', string> = { blue: BRAND.blueBright, red: BRAND.red, gold: BRAND.gold };

/** The box on the shark's back with a thin fill bar; pops when a step milestone lands. UI-thread only. */
export function TrailBoxBadge({ trail, live }: { readonly trail: MapTrail | null | undefined; readonly live: boolean }) {
  const on = !!trail?.walking && !!trail.tier;
  const show = useSharedValue(on ? 1 : 0);
  const fill = useSharedValue(trail?.progress ?? 0);
  useEffect(() => { show.value = withTiming(on ? 1 : 0, { duration: 250 }); }, [on, show]);
  useEffect(() => {
    const p = Math.max(0, Math.min(1, trail?.progress ?? 0));
    fill.value = live ? withTiming(p, { duration: 400 }) : p;
  }, [trail?.progress, live, fill]);
  const ready = trail?.readyCount ?? 0;
  const pop = useSharedValue(1);
  useEffect(() => {
    if (ready > 0 && live) pop.value = withSequence(withTiming(1.35, { duration: 120 }), withSpring(1, { damping: 6, stiffness: 260 }));
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const wrap = useAnimatedStyle(() => ({ opacity: show.value, transform: [{ scale: (0.6 + 0.4 * show.value) * pop.value }] }));
  // scaleX, not width: no layout pass per frame.
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, fill.value) }] }));
  return (
    <Reanimated.View pointerEvents="none" style={[styles.badge, wrap]}>
      <View style={[styles.box, { backgroundColor: trail?.tier ? TIER[trail.tier] : BRAND.blueBright }]}>
        <GameIcon name="gift" size={15} />
      </View>
      <View style={styles.track}><Reanimated.View style={[styles.fill, bar]} /></View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  // On the shark's back (upper right of its 100 x 110 box).
  badge: { position: 'absolute', left: 64, top: 44, alignItems: 'center' },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2.5, borderColor: BRAND.navy, borderBottomWidth: 4, alignItems: 'center', justifyContent: 'center' },
  track: { marginTop: 2, width: 24, height: 7, borderRadius: 3.5, borderWidth: 1.5, borderColor: BRAND.navy, backgroundColor: BRAND.cream, overflow: 'hidden' },
  fill: { width: 21, height: 4, borderRadius: 2, backgroundColor: BRAND.gold, borderBottomWidth: 1.5, borderBottomColor: BRAND.goldLip, transformOrigin: 'left' },
});

/** The badge wired to the Trail Boxes state (nothing while the trail_boxes flag is off or no box is walking). */
export function TrailBoxCue({ live }: { readonly live: boolean }) {
  const trail = useTrail();
  const mapTrail = mapTrailOf(trail.state, trail.enabled);
  if (!mapTrail || (!mapTrail.walking && mapTrail.readyCount === 0)) return null;
  return <TrailBoxBadge trail={mapTrail} live={live} />;
}
