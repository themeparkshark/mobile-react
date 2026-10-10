import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { getNextUp, type NextUpAction, type NextUpItem } from '../../api/endpoints/live-events/nextUp';
import { haptic } from '../../gamekit/Haptics';
import useLivePoll from '../../hooks/useLivePoll';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { Image } from 'expo-image';
import { BRAND, GameIcon, isGameIconName } from '../../ui';
import { eventArt } from '../liveEvents/eventArt';

/** Every 3 minutes while the map is focused and awake (the host also refreshes after a chest opens or a sheet closes); slower when the server has nothing. */
export const NEXT_UP_POLL_MS = 180_000;
export const NEXT_UP_IDLE_MS = 10 * 60_000;

/**
 * The "what now" rail: one row, one next thing, one GO. The server ranks every
 * system that is on (chests first, then today's Star Ride, then the core
 * action), so the map never shows a pile of buttons asking for attention.
 * The host decides what each action opens (onAction).
 */
export function useNextUp(parkId: number | null, focused: boolean, enabled = true) {
  const [item, setItem] = useState<NextUpItem | null>(null);
  const [idle, setIdle] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const load = useCallback(() => getNextUp(parkId, Intl.DateTimeFormat().resolvedOptions().timeZone)
    .then(r => { if (alive.current) { setItem(r.item); setIdle(!r.item); } })
    .catch(() => { if (alive.current) setIdle(true); }), [parkId]);
  useLivePoll(load, idle ? NEXT_UP_IDLE_MS : NEXT_UP_POLL_MS, { enabled, focused, key: parkId ?? 'home' });
  return { item, refresh: load };
}

function NextUpRail({ item, onAction }: { readonly item: NextUpItem | null; readonly onAction: (action: NextUpAction) => void }) {
  const reduced = useReducedGameMotion();
  if (!item) return null;
  const icon = isGameIconName(item.icon) ? item.icon : 'arrow';
  const go = () => { haptic('tapLight'); onAction(item.action); };
  return (
    <Animated.View key={item.kind + item.title} entering={reduced ? undefined : FadeInDown.duration(220)} exiting={reduced ? undefined : FadeOutUp.duration(160)}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Next: ${item.title}. Go.`} onPress={go}
        style={({ pressed }) => [styles.rail, pressed && styles.pressed]}>
        <View style={styles.iconWell}>
          {item.kind.startsWith('event') ? <Image source={eventArt(null).chestClosed} style={{ width: 34, height: 34 }} contentFit="contain" />
            : <GameIcon name={icon} size={30} />}
        </View>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <View style={styles.go}><Text style={styles.goText}>GO</Text></View>
      </Pressable>
    </Animated.View>
  );
}

export default memo(NextUpRail);

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 54, borderRadius: 18, backgroundColor: BRAND.cream,
    borderWidth: 3, borderColor: BRAND.navy, paddingVertical: 4, paddingLeft: 5, paddingRight: 5,
    shadowColor: BRAND.shadow, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  pressed: { transform: [{ scale: 0.97 }] },
  iconWell: { width: 42, height: 42, borderRadius: 21, backgroundColor: BRAND.sky, borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  go: { backgroundColor: BRAND.gold, borderRadius: 12, borderWidth: 2.5, borderColor: BRAND.white, borderBottomWidth: 5, borderBottomColor: BRAND.goldLip,
    paddingHorizontal: 16, minHeight: 42, justifyContent: 'center' },
  goText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
});
