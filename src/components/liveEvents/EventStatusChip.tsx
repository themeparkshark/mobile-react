import { memo, useEffect } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { LiveEvent } from '../../api/endpoints/live-events';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { useEventAmbient } from '../../services/liveEvents/ambient';
import { chipState, shortEnd, timeLine } from '../../services/liveEvents/model';
import { BRAND, GameIcon } from '../../ui';
import { eventArt } from './eventArt';

/**
 * The event's pill for the park map's status row (and anywhere a one-line
 * entry is needed). One message at a time, most useful first:
 *   a chest to open  -> "Chest ready!" + OPEN
 *   Frenzy           -> bolt + "x2 until 1 PM"
 *   otherwise        -> your chest bar
 * The emblem hops only while a chest is ready (UI thread; still under reduced motion).
 */
function EventStatusChip({ event, onPress, inline = false, paused = false, now = Date.now() }: {
  readonly event: LiveEvent;
  /** The map is covered or blurred: the hop rests. */
  readonly paused?: boolean;
  readonly onPress: () => void;
  readonly inline?: boolean;
  readonly now?: number;
}) {
  const art = eventArt(event.art_key);
  const s = chipState(event, now);
  const reduced = useReducedGameMotion();
  const hop = useSharedValue(0);
  const p = useEventAmbient();
  const hopping = s.kind === 'open' && !reduced && p.ambient && !paused;
  useEffect(() => {
    if (!hopping) { cancelAnimation(hop); hop.value = 0; return; }
    hop.value = withRepeat(withSequence(withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 1100 })), -1, false);
    return () => cancelAnimation(hop);
  }, [hopping, hop]);
  const emblemStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -5 * hop.value }, { scale: 1 + 0.06 * hop.value }] }));

  const title = event.title.toUpperCase();
  const label = s.kind === 'open' ? `${event.title}: ${s.count === 1 ? 'a chest is' : `${s.count} chests are`} ready. Open.`
    : s.kind === 'frenzy' ? `${event.title}: Frenzy, ${s.line}. Open event.`
      : s.kind === 'upcoming' ? `${event.title}: ${s.line}. Open event.`
        : `${event.title}: play to open your chests. Open event.`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.pill, inline && styles.inline, s.kind === 'open' && styles.pillReady, pressed && styles.pressed]}>
      <Animated.View style={emblemStyle}>
        <Image source={s.kind === 'open' ? art.chestOpen : art.chestClosed} style={styles.emblem} contentFit="contain" />
        {s.kind === 'open' && <View style={styles.dot} />}
      </Animated.View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {s.kind === 'progress' && (
          <View style={styles.barRow}>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.max(4, s.fill * 100)}%` }]} /></View>
            <Text style={styles.ends} numberOfLines={1}>{timeLine(event, now)}</Text>
          </View>
        )}
        {s.kind === 'open' && <Text style={styles.sub} numberOfLines={1}>{s.count === 1 ? 'Chest ready!' : `${s.count} chests ready!`}<Text style={styles.ends}>{event.phase === 'live' ? `  ${shortEnd(event, now)}` : ''}</Text></Text>}
        {s.kind === 'frenzy' && (
          <View style={styles.frenzyRow}><GameIcon name="rush" size={16} /><Text style={[styles.sub, styles.frenzy]} numberOfLines={1}>{s.line}</Text></View>
        )}
        {s.kind === 'upcoming' && <Text style={styles.sub} numberOfLines={1}>{s.line}</Text>}
      </View>
      {/* No OPEN button here: the what-now rail owns the one action; the chip says what's ready. */}
      {s.kind !== 'open' && <GameIcon name="arrow" size={18} />}
    </Pressable>
  );
}

export default memo(EventStatusChip);

const styles = StyleSheet.create({
  pill: { marginHorizontal: 12, marginTop: 8, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16,
    borderWidth: 3, borderColor: BRAND.white, backgroundColor: BRAND.blue, paddingVertical: 4, paddingLeft: 6, paddingRight: 10,
    shadowColor: BRAND.shadow, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  inline: { marginHorizontal: 0, marginTop: 0 },
  pillReady: { backgroundColor: BRAND.blueBright },
  pressed: { transform: [{ scale: 0.97 }] },
  emblem: { width: 42, height: 42 },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'Shark', fontSize: 13, letterSpacing: 0.3, color: BRAND.gold, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  sub: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white },
  ends: { fontFamily: 'Knockout', fontSize: 12, color: '#e4f7ff' },
  dot: { position: 'absolute', top: 0, right: -2, width: 13, height: 13, borderRadius: 7, backgroundColor: BRAND.red, borderWidth: 2, borderColor: BRAND.white },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  bar: { flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgba(5,52,110,0.55)', borderWidth: 2, borderColor: BRAND.white, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: BRAND.gold },
  miniChest: { width: 20, height: 20 },
  frenzyRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  frenzy: { color: BRAND.goldLight, fontSize: 14 },
  openTag: { backgroundColor: BRAND.gold, borderRadius: 10, borderWidth: 2, borderColor: BRAND.white, borderBottomWidth: 4,
    borderBottomColor: BRAND.goldLip, paddingHorizontal: 9, paddingVertical: 3 },
  openText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy },
});
