import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { LiveRush } from '../api/endpoints/parks/live';
import type { TaskType } from '../models/task-type';

export type RushPick = { readonly task: TaskType; readonly rush: LiveRush };

function left(endsAt: string, now: number): string {
  const s = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A real short wait on a normally busy ride, as a limited-time event: the
 * nearest Rush with its countdown. Tapping it flies the map to the ride.
 */
export default function RushCallout({ rushes, onFocus }: {
  readonly rushes: readonly RushPick[];
  readonly onFocus: (task: TaskType) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const live = rushes.filter(r => new Date(r.rush.ends_at).getTime() > now);
  useEffect(() => {
    if (!rushes.length) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [rushes.length]);

  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const bolt = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.18 }, { rotate: `${-8 + pulse.value * 16}deg` }] }));

  if (!live.length) return null;
  const { task, rush } = live[0];
  return (
    <Pressable accessibilityRole="button" onPress={() => onFocus(task)} style={styles.pill}
      accessibilityLabel={`Rush on ${task.name}: ${rush.wait} minute wait, usually ${rush.typical}. ${left(rush.ends_at, now)} left. Show on map.`}>
      <View style={styles.boltWrap}><Animated.Text style={[styles.bolt, bolt]}>⚡</Animated.Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>RUSH · {task.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {rush.wait} min wait (usually {rush.typical}) · 2x Parts · {left(rush.ends_at, now)} left
          {live.length > 1 ? `  +${live.length - 1} more` : ''}
        </Text>
      </View>
      <Text style={styles.go}>GO ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { marginHorizontal: 12, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ffcf3b', borderRadius: 16, borderWidth: 3, borderColor: '#fff',
    paddingVertical: 5, paddingLeft: 10, paddingRight: 12,
    shadowColor: '#ffb300', shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  boltWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#075083', alignItems: 'center', justifyContent: 'center' },
  bolt: { fontSize: 18 },
  title: { fontFamily: 'Shark', fontSize: 15, color: '#6a3b00' },
  sub: { fontFamily: 'Knockout', fontSize: 12, color: '#7a4a00' },
  go: { fontFamily: 'Shark', fontSize: 16, color: '#075083' },
});
