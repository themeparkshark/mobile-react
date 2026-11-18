/**
 * One bright card for every ride challenge status (checking, not started,
 * pending, expired, missed). Dustin's modal template: the ribbon title over the
 * blue card with a white border and the gold button, never the old dark card
 * with a red X. A miss shows the drawn shark (GOOD TRY!) and a ticket picture
 * (-1, +1); waiting states show the TPS shark loader. Buttons are the shared
 * results buttons: gold first, white under it.
 */
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import { ResultsRibbon } from '../../gamekit/results/ResultsRibbon';
import GameIcon, { type GameIconName } from '../../ui/GameIcon';
import { ResultPrimaryButton, ResultSecondaryButton } from '../../gamekit/results/ResultButtons';
import SharkLoader from '../../ui/SharkLoader';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { RESULT_INPUT_LOCK_MS, nextMashUnlock } from './mashGuard';
import TryPips from './TryPips';
// Knockout draws 1 like a capital I: "1 Ticket used." read "I Ticket used." on the loss card.
import { withNumberFont } from '../../ui/numberText';

export type ChallengeStatusArt = 'soClose' | 'loading' | 'none';

export interface ChallengeStatusAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  /** Pictures that lead the label (the ad retry: play, then retry). */
  readonly icons?: readonly GameIconName[];
  /** What VoiceOver says when the pictures carry more than the label. */
  readonly a11yLabel?: string;
  /** A small quiet tag inside the button (a member's "VIP try"). */
  readonly note?: string;
}

/**
 * A paid retry right after a game's own result panel: the guest's second tap
 * on that panel's Close must not land on Try Again. The safe action takes the
 * spot under the message and the retry wakes up after this guard.
 */
export const RETRY_TAP_GUARD_MS = 800;
/**
 * Every button on a result or try card ignores taps for this long after the card appears (fix W3 T046),
 * and a tap that lands while it is locked starts the wait again (mashGuard.ts): a kid still mashing the
 * holes where the buttons now sit never skips the card or restarts the game.
 */
export { RESULT_INPUT_LOCK_MS } from './mashGuard';

/** A small line under the buttons: what comes next ("Next coin: Tiki Room, 60 m"), with its picture. */
export interface ChallengeFootnote {
  readonly icon: GameIconName;
  readonly text: string;
}

export const SO_CLOSE_SHARK = require('../../../assets/images/screens/redeem/so-close-shark.png');

/** One button voice on every result and try card: caps labels (TRY AGAIN, DONE), like the results cards. */
export function capsAction<T extends ChallengeStatusAction | undefined>(action: T): T {
  return (action ? { ...action, label: action.label.toUpperCase() } : action) as T;
}

export default function ChallengeStatusCard({ title, message, art = 'none', primary: primaryIn, secondary: secondaryIn, quiet: quietIn, guardRetry = false, ticket, line, ticketFlyTo, pips, footnotes, extraRow, onClose }: {
  readonly title: string;
  readonly message: string;
  readonly art?: ChallengeStatusArt;
  readonly primary?: ChallengeStatusAction;
  readonly secondary?: ChallengeStatusAction;
  /** The safe way out (Back to Map): a white button under the big one. */
  readonly quiet?: ChallengeStatusAction;
  /**
   * The primary spends a Ticket or a retry: it ignores taps for
   * RETRY_TAP_GUARD_MS after the card appears, so a second tap on the game's
   * own Close never starts (and pays for) a new try.
   */
  readonly guardRetry?: boolean;
  /** Tickets this try changed, as a picture: -1 spent, +1 came back. 0 or none: no picture. */
  readonly ticket?: number;
  /** How the try went, in one honest line ("8 of 13 bonks.", "1 of 3 right. 2 wins the coin."). */
  readonly line?: string | null;
  /**
   * Where the header's Ticket pill sits (window coordinates): a Ticket that came back
   * flies up off the card toward it, so a child sees it go home (blueprint 5.3).
   */
  readonly ticketFlyTo?: { x: number; y: number } | null;
  /** The line as a picture (fix W3 T053): one pip per bonk, pair or answer the coin needs, the ones got filled. */
  readonly pips?: { readonly have: number; readonly need: number } | null;
  /** Small lines under the buttons: what comes next, how many Tickets are left (fix W3 T029). */
  readonly footnotes?: readonly ChallengeFootnote[];
  /** One optional row under the free ways (a calm offer, mounted by a later step; nothing by default). */
  readonly extraRow?: ReactNode;
  /** A small X like every other sheet (fix W3 T047); omitted on cards that must be answered. */
  readonly onClose?: () => void;
}) {
  const primary = capsAction(primaryIn);
  const secondary = capsAction(secondaryIn);
  const quiet = capsAction(quietIn);
  const reduced = useReducedGameMotion();
  // Input lock (T046): every button waits RESULT_INPUT_LOCK_MS after the card appears (a paid or free retry
  // waits RETRY_TAP_GUARD_MS), and a tap while locked starts the wait again, so mashing never presses a button.
  const lockMs = guardRetry ? Math.max(RETRY_TAP_GUARD_MS, RESULT_INPUT_LOCK_MS) : RESULT_INPUT_LOCK_MS;
  const [armed, setArmed] = useState(false);
  const unlockAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arm = (delay: number) => {
    unlockAt.current = Date.now() + delay;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(true), delay);
  };
  useEffect(() => {
    setArmed(false);
    arm(lockMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [lockMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const lockedTap = () => {
    const now = Date.now();
    const next = nextMashUnlock(unlockAt.current, now, RESULT_INPUT_LOCK_MS);
    if (next !== unlockAt.current) { setArmed(false); arm(next - now); }
  };
  // One button system with every results card: the big gold button first,
  // then white buttons under it (never a small text link, never above it).
  return (
    <Animated.View entering={reduced ? FadeIn.duration(120) : ZoomIn.springify().damping(14).stiffness(220)}
      style={styles.wrap} accessibilityRole="alert">
      {/* The one results ribbon every card wears (same lettering as the shared card). */}
      <ResultsRibbon title={title.toUpperCase()} reducedMotion={reduced} style={styles.ribbon} />
      <View style={styles.card}>
        {art === 'soClose' && <Image source={SO_CLOSE_SHARK} contentFit="contain" style={styles.shark}
          accessibilityLabel="The shark missed the coin this time" />}
        {art === 'loading' && <View style={styles.loader}><SharkLoader compact tone="onBlue" /></View>}
        {/* Only a change gets a picture: a bare 0 would read as "you have no Tickets". */}
        {/* The ticket picture says it (+1 came back, -1 spent), so its line is
            spoken only; without a picture the short line shows. */}
        {!!line && <Text style={styles.line}>{withNumberFont(line)}</Text>}
        {pips && pips.need > 0 && <TryPips have={pips.have} need={pips.need} />}
        {ticket ? <View style={styles.ticketRow}>
          <View style={styles.ticket} accessible accessibilityLabel={message}>
            <GameIcon name="ticket" size={30} />
            <Text style={[styles.ticketText, ticket > 0 && styles.ticketBack]}>{ticket > 0 ? `+${ticket}` : `${ticket}`}</Text>
          </View>
          {ticket > 0 && <TicketFlyBack to={ticketFlyTo ?? null} reduced={reduced} />}
          <Text style={styles.messageSmall}>{withNumberFont(message)}</Text>
        </View> : <Text style={styles.message}>{withNumberFont(message)}</Text>}
        {primary && <ResultPrimaryButton label={primary.label} icons={primary.icons} a11yLabel={primary.a11yLabel} note={primary.note} onPress={primary.onPress}
          disabled={primary.disabled || !armed} style={[styles.primary, primary.disabled && styles.dim]} />}
        {secondary && <ResultSecondaryButton label={secondary.label} onPress={secondary.disabled || !armed ? undefined : secondary.onPress}
          style={[styles.secondary, secondary.disabled && styles.dim]} />}
        {quiet && <ResultSecondaryButton label={quiet.label} onPress={armed ? quiet.onPress : undefined} style={styles.secondary} />}
        {extraRow ?? null}
        {footnotes?.map(note => (
          <View key={note.text} style={styles.footnote} accessible accessibilityLabel={note.text}>
            <GameIcon name={note.icon} size={20} />
            <Text style={styles.footnoteText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{withNumberFont(note.text)}</Text>
          </View>
        ))}
        {/* While locked, a tap anywhere on the card is caught here and starts the lock again (never a button press). */}
        {!armed && <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => { lockedTap(); return true; }} />}
      </View>
      {onClose && <Pressable onPress={armed ? onClose : lockedTap} style={styles.close} hitSlop={12}
        accessibilityRole="button" accessibilityLabel="Close">
        <GameIcon name="close" size={34} />
      </Pressable>}
    </Animated.View>
  );
}

/**
 * The Ticket that came back flies up off the card toward the header's Ticket pill (UI thread,
 * one small picture, plays once). With Reduce Motion, or with no known pill, it stays still.
 */
function TicketFlyBack({ to, reduced }: { readonly to: { x: number; y: number } | null; readonly reduced: boolean }) {
  const t = useSharedValue(0);
  const ref = useRef<View>(null);
  const [delta, setDelta] = useState<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    if (reduced || !to) return undefined;
    const timer = setTimeout(() => {
      ref.current?.measureInWindow((x, y, w, h) => {
        if (![x, y, w, h].every(Number.isFinite) || w <= 0) return;
        setDelta({ dx: to.x - (x + w / 2), dy: to.y - (y + h / 2) });
        t.value = withDelay(120, withTiming(1, { duration: 650, easing: Easing.in(Easing.quad) }));
      });
    }, 450);
    return () => { clearTimeout(timer); cancelAnimation(t); };
  }, [to, reduced, t]);
  const dx = delta?.dx ?? 0;
  const dy = delta?.dy ?? 0;
  const style = useAnimatedStyle(() => ({
    opacity: t.value <= 0 || t.value >= 1 ? 0 : 1,
    transform: [{ translateX: dx * t.value }, { translateY: dy * t.value - Math.sin(t.value * Math.PI) * 40 }, { scale: 1 - t.value * 0.4 }],
  }));
  return (
    <View ref={ref} collapsable={false} pointerEvents="none" style={styles.flyFrom}>
      <Animated.View style={style}><GameIcon name="ticket" size={30} /></Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { fontFamily: 'Shark', fontSize: 19, lineHeight: 23, color: '#ffffff', textAlign: 'center', marginBottom: 8 },
  ticketRow: { alignItems: 'center', marginBottom: 6 },
  messageSmall: { fontFamily: 'Knockout', fontSize: 17, lineHeight: 21, color: '#ffffff', textAlign: 'center', marginTop: -4 },
  flyFrom: { position: 'absolute', top: 2, alignSelf: 'center', width: 30, height: 30 },
  wrap: { width: '88%', alignItems: 'center' },
  ribbon: { alignSelf: 'stretch', marginHorizontal: -14, zIndex: 2 },
  card: { alignSelf: 'stretch', marginTop: -40, backgroundColor: '#0879ca', borderWidth: 3, borderColor: '#ffffff',
    borderRadius: 20, paddingTop: 40, paddingHorizontal: 18, paddingBottom: 14, alignItems: 'center',
    shadowColor: '#05346e', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 8 }, shadowRadius: 14, elevation: 10 },
  shark: { width: 150, height: 150, marginBottom: 6 },
  loader: { height: 110, alignSelf: 'stretch', justifyContent: 'center' },
  message: { fontFamily: 'Knockout', fontSize: 18, lineHeight: 23, color: '#ffffff', textAlign: 'center',
    marginBottom: 12 },
  primary: { marginTop: 4 },
  secondary: { flex: 0, minHeight: 52 },
  dim: { opacity: 0.5 },
  ticket: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 3, borderColor: '#05346e',
    paddingHorizontal: 12, paddingVertical: 2, marginBottom: 12 },
  ticketText: { fontFamily: 'Shark', fontSize: 22, color: '#05346e' },
  ticketBack: { color: '#1f8a3a' },
  footnote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, maxWidth: '100%' },
  footnoteText: { fontFamily: 'Knockout', fontSize: 16, color: '#ffe07a', flexShrink: 1 },
  close: { position: 'absolute', top: 30, right: -4, zIndex: 5 },
});
