/**
 * One bright card for every ride challenge status (checking, not started,
 * pending, expired, missed). Dustin's modal template: the ribbon title over the
 * blue card with a white border and the gold button, never the old dark card
 * with a red X. A miss shows the drawn shark (GOOD TRY!) and a ticket picture
 * (-1, +1); waiting states show the TPS shark loader. Buttons are the shared
 * results buttons: gold first, white under it.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { ResultsRibbon } from '../../gamekit/results/ResultsRibbon';
import GameIcon from '../../ui/GameIcon';
import { ResultPrimaryButton, ResultSecondaryButton } from '../../gamekit/results/ResultButtons';
import SharkLoader from '../../ui/SharkLoader';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

export type ChallengeStatusArt = 'soClose' | 'loading' | 'none';

export interface ChallengeStatusAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}

/**
 * A paid retry right after a game's own result panel: the guest's second tap
 * on that panel's Close must not land on Try Again. The safe action takes the
 * spot under the message and the retry wakes up after this guard.
 */
export const RETRY_TAP_GUARD_MS = 800;

export const SO_CLOSE_SHARK = require('../../../assets/images/screens/redeem/so-close-shark.png');

/** One button voice on every result and try card: caps labels (TRY AGAIN, DONE), like the results cards. */
export function capsAction<T extends ChallengeStatusAction | undefined>(action: T): T {
  return (action ? { ...action, label: action.label.toUpperCase() } : action) as T;
}

export default function ChallengeStatusCard({ title, message, art = 'none', primary: primaryIn, secondary: secondaryIn, quiet: quietIn, guardRetry = false, ticket }: {
  readonly title: string;
  readonly message: string;
  readonly art?: ChallengeStatusArt;
  readonly primary?: ChallengeStatusAction;
  readonly secondary?: ChallengeStatusAction;
  /** The safe way out ("Return to map", DONE): a white button under the big one. */
  readonly quiet?: ChallengeStatusAction;
  /**
   * The primary spends a Ticket or a retry: it ignores taps for
   * RETRY_TAP_GUARD_MS after the card appears, so a second tap on the game's
   * own Close never starts (and pays for) a new try.
   */
  readonly guardRetry?: boolean;
  /** Tickets this try changed, as a picture: -1 spent, +1 came back. 0 or none: no picture. */
  readonly ticket?: number;
}) {
  const primary = capsAction(primaryIn);
  const secondary = capsAction(secondaryIn);
  const quiet = capsAction(quietIn);
  const reduced = useReducedGameMotion();
  const [armed, setArmed] = useState(!guardRetry);
  useEffect(() => {
    if (!guardRetry) { setArmed(true); return; }
    setArmed(false);
    const timer = setTimeout(() => setArmed(true), RETRY_TAP_GUARD_MS);
    return () => clearTimeout(timer);
  }, [guardRetry]);
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
        {ticket ? <View style={styles.ticket} accessible accessibilityLabel={message}>
          <GameIcon name="ticket" size={30} />
          <Text style={[styles.ticketText, ticket > 0 && styles.ticketBack]}>{ticket > 0 ? `+${ticket}` : `${ticket}`}</Text>
        </View> : <Text style={styles.message}>{message}</Text>}
        {primary && <ResultPrimaryButton label={primary.label} onPress={primary.onPress}
          disabled={primary.disabled || !armed} style={[styles.primary, primary.disabled && styles.dim]} />}
        {secondary && <ResultSecondaryButton label={secondary.label} onPress={secondary.disabled ? undefined : secondary.onPress}
          style={[styles.secondary, secondary.disabled && styles.dim]} />}
        {quiet && <ResultSecondaryButton label={quiet.label} onPress={quiet.onPress} style={styles.secondary} />}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
});
