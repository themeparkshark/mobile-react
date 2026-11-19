import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { playSfx } from '../gamekit/SFX';
import { pressTrace } from '../ui/pressTrace';

const TICKET = require('../../assets/images/ticket-icon.png');
const TICKET_RATIO = 549 / 799;
/** Punch beats (ms after PLAY): the tear, then the game card as soon as the server has dealt it. */
export const PUNCH_T = { ready: 420, punch: 520, card: 640, done: 1650 } as const;
/**
 * Fix round w4 (N04, T036): the game card's shortest stay after the tear (ms), then the punch hands over as soon
 * as the game under it reports its board drawn. A repeat start (TRY AGAIN) already knows its game: a short stay.
 */
export const CARD_HOLD_MS = { first: 900, repeat: 450 } as const;
/** Never wait longer than this after the tear for the board (a game that never reports drawn hands over anyway). */
export const BOARD_WAIT_MAX_MS = 3000;
/**
 * Fix pass w5 (N04): TRY AGAIN on the kept board. The ticket slides in over the board while it resets, tears the
 * moment the server deals the same game, and hands over with the tear (no game card: the player knows the game).
 */
export const INSTANT_PUNCH_MS = { ready: 180, handOver: 200 } as const;

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
  kicker = 'YOUR GAME',
  winLine,
  onCardShown,
  boardReady,
  quick = false,
  instant = false,
  onDone,
}: {
  /**
   * The game the server dealt. Fix round w3 T036: the punch starts the moment PLAY is tapped, while
   * the Ticket spend is still on its way; null until the server answers, and the game card pops then.
   */
  readonly gameName: string | null;
  readonly gameColor: string;
  readonly rideName: string;
  /** Over the game's name: "THIS RIDE'S GAME" where the server deals one game per ride and day, else "YOUR GAME" (punchLines). */
  readonly kicker?: string;
  /** Under it: "Win the Walt Statue coin!" (never "the The ..."). */
  readonly winLine?: string;
  /** Small line under the card, e.g. "Rescue Pass used". */
  readonly note?: string;
  /**
   * The tear has started and the game's card is popping (fix round w4, T036): the ride mounts the dealt game
   * under the punch now, so its mount never holds the tear back and its board is drawn before the hand-over.
   */
  readonly onCardShown?: () => void;
  /**
   * The game mounted under the punch has drawn its board (w4 N04). Undefined keeps the fixed beat; false holds
   * the card (never a blank page after the hand-over) until it turns true or BOARD_WAIT_MAX_MS passes.
   */
  readonly boardReady?: boolean;
  /** A repeat start of the same game (TRY AGAIN): the card's short stay (CARD_HOLD_MS.repeat). */
  readonly quick?: boolean;
  /** TRY AGAIN on the kept board (w5 N04): tear on the deal and hand over with it, no game card. */
  readonly instant?: boolean;
  readonly onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const done = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** null until the motion setting is known; then whether Reduce Motion is on. */
  const [reduced, setReduced] = useState<boolean | null>(null);
  /** The ticket is torn and the card may pop (T.card reached). */
  const [torn, setTorn] = useState(false);
  const cardShown = useRef(false);

  const enter = useSharedValue(0);
  const tear = useSharedValue(0);
  const flash = useSharedValue(0);
  const card = useSharedValue(0);
  /** A gentle wait bob (0..1) while the server deals the game. */
  const bob = useSharedValue(0);

  const finish = () => {
    if (done.current || !cardShown.current) return; // never skip past a game that is not dealt yet
    done.current = true;
    timers.current.forEach(clearTimeout);
    pressTrace('punch.done');
    onDone();
  };
  const at = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  /** The card has had its shortest stay; the hand-over waits only for the board now. */
  const held = useRef(false);
  const boardReadyRef = useRef(boardReady);
  boardReadyRef.current = boardReady;
  const tryFinish = () => { if (held.current && boardReadyRef.current !== false) finish(); };
  const holdThen = (ms: number) => at(ms, () => { held.current = true; tryFinish(); });
  useEffect(() => { if (boardReady) tryFinish(); }, [boardReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const safetyMs = (fixed: number) => (boardReady === undefined ? fixed : BOARD_WAIT_MAX_MS);

  // The ticket slides in at once (PLAY is answered in the first frame) and bobs gently while the spend is on
  // its way; it tears the moment the server has dealt the game, so the scene is never empty (T036).
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((isReduced) => {
      if (cancelled) return;
      setReduced(isReduced);
      if (isReduced) {
        enter.value = 1;
        at(instant ? INSTANT_PUNCH_MS.ready : PUNCH_T.ready, () => setTorn(true));
        return;
      }
      playSfx('whoosh', 0.6);
      enter.value = withSpring(1, { damping: 12, stiffness: 170 });
      bob.value = withDelay(PUNCH_T.ready, withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }), -1, true));
      at(instant ? INSTANT_PUNCH_MS.ready : PUNCH_T.ready, () => setTorn(true));
    });
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
    };
    // Plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Punch and pop: once the ticket has landed and the server has dealt the game.
  useEffect(() => {
    if (!torn || !gameName || cardShown.current || reduced == null) return;
    pressTrace('punch.tear', () => gameName);
    cardShown.current = true;
    if (instant) {
      // The kept board under it is already drawn and reset: tear and hand over, no card.
      cancelAnimation(bob);
      tear.value = reduced ? 1 : withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
      if (!reduced) flash.value = withSequence(withTiming(0.85, { duration: 30 }), withTiming(0, { duration: 220 }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      if (!reduced) playSfx('hit');
      at(INSTANT_PUNCH_MS.handOver, finish);
      return;
    }
    if (reduced) {
      onCardShown?.();
      tear.value = 1;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      card.value = withTiming(1, { duration: 200 });
      holdThen(quick ? 600 : 1000);
      at(safetyMs(1000), finish);
      return;
    }
    cancelAnimation(bob);
    bob.value = withTiming(0, { duration: 80 });
    tear.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    flash.value = withSequence(withTiming(0.85, { duration: 30 }), withTiming(0, { duration: 220 }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playSfx('hit');
    const pop = PUNCH_T.card - PUNCH_T.punch;
    card.value = withDelay(pop, withSpring(1, { damping: 9, stiffness: 190 }));
    // w4 N04: the hand-over no longer waits for the spring to settle plus a fixed beat (about 1.6 s after the
    // tear on device); it comes after the card's short stay, as soon as the board under it is drawn.
    holdThen(pop + (quick ? CARD_HOLD_MS.repeat : CARD_HOLD_MS.first));
    at(pop + 60, () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSfx('go', 0.9);
    });
    at(safetyMs(PUNCH_T.done - PUNCH_T.punch + 400), finish); // safety net
    // The tear and the card run on the UI thread; the game mounts behind them from here (T036).
    onCardShown?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [torn, gameName, reduced]);

  const ticketW = Math.min(width * 0.72, 320);
  const ticketH = ticketW * TICKET_RATIO;

  const ticketWrap = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: (1 - enter.value) * height * 0.35 - bob.value * 8 },
      { scale: 0.7 + enter.value * 0.3 + bob.value * 0.02 },
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
    <Pressable style={StyleSheet.absoluteFill} onPress={() => { held.current = true; tryFinish(); }} accessibilityRole="button"
      accessibilityLabel={`${kicker.charAt(0)}${kicker.slice(1).toLowerCase()}: ${gameName ?? 'your Ticket'}. ${winLine ?? rideName}.${gameName ? ' Tap to start.' : ''}`}>
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
          <Text style={styles.cardKicker}>{kicker}</Text>
          <Text style={styles.cardGame} adjustsFontSizeToFit numberOfLines={1}>{gameName ?? ''}</Text>
          <Text style={styles.cardRide} numberOfLines={2}>{winLine ?? `Win the ${rideName.replace(/^the\s+/i, '')} coin!`}</Text>
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
