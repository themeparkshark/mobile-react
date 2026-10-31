import { memo, useEffect, useRef, type ReactNode } from 'react';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { haptic } from '../../gamekit/Haptics';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../ui';
import { ticketLine } from './homeFindCopy';

const HIT = { top: 8, bottom: 8, left: 4, right: 4 };
const TICKET = require('../../../assets/images/ticket-icon.png');
/** Alex's paper-and-pencil (ui_home slice47): a story, not a currency. */
const STORY = require('../../../assets/images/home/story-chip.webp');

export interface ParkStoryChip {
  readonly title: string;
  readonly points: number;
  readonly goal: number;
  readonly onPress: () => void;
}

/**
 * The home map's top HUD row: small chips only, never a card. The free-Ticket countdown (a ticket and
 * three pips; tap for the line) and the park story (a paper-and-pencil and n/goal; tap opens the story).
 */
function HomeHudChips({ top, onWidth, findsUntilTicket, ticketsCapped = false, onTicketPress, parkStory = null, eventChip = null, ticketHidden = false }: {
  readonly top: number;
  /** The row's width, so the map can keep finds out from under it. */
  readonly onWidth?: (width: number) => void;
  readonly findsUntilTicket: number | null | undefined;
  readonly ticketsCapped?: boolean;
  readonly onTicketPress: (line: string) => void;
  readonly parkStory?: ParkStoryChip | null;
  /** Shark Events: the event's home chip, after the story (nothing when no event is on). */
  readonly eventChip?: ReactNode;
  /** The home guide card carries the ticket meter (core loop 5.7): the pips chip folds into it. */
  readonly ticketHidden?: boolean;
}) {
  const line = ticketHidden ? null : ticketLine(findsUntilTicket, ticketsCapped);
  const remaining = findsUntilTicket == null ? 3 : Math.max(1, Math.min(3, Math.round(findsUntilTicket)));
  // A find that fills a pip pops the chip; one find from a Ticket, the last pip breathes.
  const reduced = useReducedGameMotion();
  const pop = useSharedValue(1);
  const glow = useSharedValue(0);
  const last = useRef(remaining);
  // Round 4: the catch ends pointing at the next goal. The chips come back first after a catch (stagger slot 0)
  // and the pip that just filled stamps in gold (from 2x, SPRING.stamp) with a ring, 120 ms after the chip pops.
  const stampAt = useSharedValue(-1);
  const stamp = useSharedValue(0);
  useEffect(() => {
    if (last.current !== remaining && !reduced) {
      pop.value = withSequence(withTiming(1.18, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 260 }));
      if (remaining < last.current) {
        stampAt.value = 3 - remaining - 1;
        stamp.value = 0;
        stamp.value = withDelay(120, withTiming(1, { duration: 420 }));
      }
    }
    last.current = remaining;
  }, [remaining, reduced, pop, stamp, stampAt]);
  useEffect(() => {
    if (remaining === 1 && !reduced) glow.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    else { cancelAnimation(glow); glow.value = 0; }
    return () => cancelAnimation(glow);
  }, [remaining, reduced, glow]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const stampPip = useAnimatedStyle(() => {
    const u = stamp.value;
    if (u <= 0 || u >= 1) return { transform: [{ scale: 1 }] };
    const wave = Math.exp(-4 * u) * Math.cos(2.2 * Math.PI * u) * (1 - u);
    return { transform: [{ scale: 1 + 1.0 * wave }] };
  });
  const stampRing = useAnimatedStyle(() => {
    const u = stamp.value;
    return { opacity: u <= 0 || u >= 1 ? 0 : 1 - u, transform: [{ scale: 0.6 + 2.2 * u }] };
  });
  const glowStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + glow.value * 0.45 }], opacity: 0.6 + glow.value * 0.4 }));
  if (!line && !parkStory && !eventChip) return null;
  return (
    <View style={[styles.row, { top }]} pointerEvents="box-none" onLayout={event => onWidth?.(Math.round(event.nativeEvent.layout.width))}>
      {line && (
        <Animated.View style={popStyle}>
          <Pressable accessibilityRole="button" accessibilityLabel={line} onPress={() => { haptic('tapLight'); onTicketPress(line); }} hitSlop={HIT}
            style={styles.chip}>
            <Image source={TICKET} style={styles.ticket} contentFit="contain" />
            <View style={styles.pips}>
              {[0, 1, 2].map(i => i === 2 && remaining === 1
                ? <Animated.View key={i} style={[styles.pip, styles.pipNext, glowStyle]} />
                : i === 3 - remaining - 1
                  ? <View key={i}>
                      <Animated.View style={stampPip}><View style={[styles.pip, styles.pipOn]} /></Animated.View>
                      <Animated.View pointerEvents="none" style={[styles.pipRing, stampRing]} />
                    </View>
                  : <View key={i} style={[styles.pip, i < 3 - remaining && styles.pipOn]} />)}
            </View>
          </Pressable>
        </Animated.View>
      )}
      {parkStory && (
        <Pressable accessibilityRole="button" hitSlop={HIT} onPress={parkStory.onPress} style={styles.chip}
          accessibilityLabel={`Park story: ${parkStory.title}. ${parkStory.points} of ${parkStory.goal} points. Open story.`}>
          <Image source={STORY} style={styles.story} contentFit="contain" />
          <Text style={styles.text}>{parkStory.points}/{parkStory.goal}</Text>
        </Pressable>
      )}
      {eventChip}
    </View>
  );
}

export default memo(HomeHudChips);

const styles = StyleSheet.create({
  // 10 pt apart so the two chips' hit slops (8 pt each) never overlap.
  row: { position: 'absolute', left: 12, zIndex: 20, flexDirection: 'row', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingLeft: 5, paddingRight: 9, borderRadius: 15,
    backgroundColor: 'rgba(5,52,110,0.9)', borderWidth: 2, borderColor: BRAND.white },
  ticket: { width: 24, height: 20 },
  story: { width: 22, height: 20 },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  pipOn: { backgroundColor: BRAND.gold },
  pipNext: { backgroundColor: BRAND.goldLight },
  pipRing: { position: 'absolute', left: -2, top: -2, width: 11, height: 11, borderRadius: 6, borderWidth: 1.5, borderColor: BRAND.goldLight },
  text: { color: BRAND.white, fontFamily: 'Knockout', fontSize: 14 },
});
