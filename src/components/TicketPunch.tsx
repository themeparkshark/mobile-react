import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { playSfx } from '../gamekit/SFX';

const TICKET = require('../../assets/images/ticket-icon.png');
const TICKET_RATIO = 549 / 799;

/**
 * Spending a Park Ticket is the "throw": the ticket slides in, gets punched in
 * half with a snap, and the challenge the server assigned pops up as a card.
 * ~1.6 s, tap to skip. Replaces the spin wheel, which only decorated a game
 * the server had already chosen.
 */
export default function TicketPunch({
  gameName,
  gameColor,
  rideName,
  note,
  onDone,
}: {
  readonly gameName: string;
  readonly gameColor: string;
  readonly rideName: string;
  /** Small line under the card, e.g. "Rescue Pass used". */
  readonly note?: string;
  readonly onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const done = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const enter = useSharedValue(0);
  const tear = useSharedValue(0);
  const flash = useSharedValue(0);
  const card = useSharedValue(0);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    timers.current.forEach(clearTimeout);
    onDone();
  };
  const at = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        tear.value = 1;
        card.value = withTiming(1, { duration: 200 });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        at(1000, finish);
        return;
      }
      const T = { punch: 520, card: 640, done: 1650 };
      playSfx('whoosh', 0.6);
      enter.value = withSpring(1, { damping: 12, stiffness: 170 });
      tear.value = withDelay(T.punch, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
      flash.value = withDelay(T.punch, withSequence(withTiming(0.85, { duration: 30 }), withTiming(0, { duration: 220 })));
      card.value = withDelay(T.card, withSequence(
        withSpring(1, { damping: 9, stiffness: 190 }),
        withDelay(T.done - T.card - 500, withTiming(1, { duration: 1 }, (ok) => {
          if (ok) runOnJS(finish)();
        })),
      ));
      at(T.punch, () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        playSfx('hit');
      });
      at(T.card + 60, () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        playSfx('go', 0.9);
      });
      at(T.done + 400, finish); // safety net
    });
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
    };
    // Plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ticketW = Math.min(width * 0.72, 320);
  const ticketH = ticketW * TICKET_RATIO;

  const ticketWrap = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: (1 - enter.value) * height * 0.35 },
      { scale: 0.7 + enter.value * 0.3 },
    ],
  }));
  const leftHalf = useAnimatedStyle(() => ({
    opacity: 1 - Math.max(0, tear.value - 0.55) / 0.45,
    transform: [
      { translateX: -tear.value * width * 0.32 },
      { translateY: tear.value * 90 },
      { rotate: `${-tear.value * 24}deg` },
    ],
  }));
  const rightHalf = useAnimatedStyle(() => ({
    opacity: 1 - Math.max(0, tear.value - 0.55) / 0.45,
    transform: [
      { translateX: tear.value * width * 0.32 },
      { translateY: tear.value * 120 },
      { rotate: `${tear.value * 30}deg` },
    ],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, card.value * 1.4),
    transform: [{ scale: 0.4 + card.value * 0.6 }, { rotate: `${(1 - card.value) * -8}deg` }],
  }));

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityRole="button"
      accessibilityLabel={`Ticket punched. ${gameName} for ${rideName}. Tap to start.`}>
      <Image source={require('../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />

      <Animated.View style={[styles.center, { top: height * 0.4 - ticketH / 2 }, ticketWrap]} pointerEvents="none">
        <View style={{ width: ticketW, height: ticketH }}>
          <Animated.View style={[styles.half, { width: ticketW / 2, height: ticketH }, leftHalf]}>
            <Image source={TICKET} style={{ width: ticketW, height: ticketH }} contentFit="contain" />
          </Animated.View>
          <Animated.View style={[styles.half, { left: ticketW / 2, width: ticketW / 2, height: ticketH }, rightHalf]}>
            <Image source={TICKET} style={{ width: ticketW, height: ticketH, marginLeft: -ticketW / 2 }} contentFit="contain" />
          </Animated.View>
        </View>
      </Animated.View>

      <Animated.View style={[styles.cardWrap, { top: height * 0.4 - 70 }, cardStyle]} pointerEvents="none">
        <View style={[styles.card, { borderColor: gameColor }]}>
          <Text style={styles.cardKicker}>YOUR CHALLENGE</Text>
          <Text style={styles.cardGame} adjustsFontSizeToFit numberOfLines={1}>{gameName}</Text>
          <Text style={styles.cardRide} numberOfLines={2}>Win to catch the {rideName} coin!</Text>
        </View>
        {!!note && <Text style={styles.note}>{note}</Text>}
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} pointerEvents="none" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(3, 38, 92, 0.5)' },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  half: { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
  cardWrap: { position: 'absolute', left: 28, right: 28, alignItems: 'center' },
  card: {
    alignSelf: 'stretch', alignItems: 'center', backgroundColor: '#ffcf3b', borderRadius: 22,
    borderWidth: 5, paddingVertical: 18, paddingHorizontal: 16,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  cardKicker: { fontFamily: 'Knockout', fontSize: 15, letterSpacing: 2, color: '#7a3d00' },
  cardGame: { fontFamily: 'Shark', fontSize: 40, color: '#075083', marginTop: 2 },
  cardRide: { fontFamily: 'Knockout', fontSize: 18, color: '#075083', marginTop: 6, textAlign: 'center' },
  note: { fontFamily: 'Knockout', fontSize: 15, color: '#e4f7ff', marginTop: 12 },
  flash: { backgroundColor: '#ffffff' },
});
