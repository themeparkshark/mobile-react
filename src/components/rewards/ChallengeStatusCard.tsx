/**
 * One bright card for every ride challenge status (checking, not started,
 * pending, expired, missed). Dustin's modal template: the ribbon title over the
 * blue card with a white border and his yellow button, never the old dark card
 * with a red X. A miss shows the drawn "so close" shark; waiting states show
 * the TPS shark loader.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import Ribbon from '../Ribbon';
import YellowButton from '../YellowButton';
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

export default function ChallengeStatusCard({ title, message, art = 'none', primary, secondary, quiet, guardRetry = false }: {
  readonly title: string;
  readonly message: string;
  readonly art?: ChallengeStatusArt;
  readonly primary?: ChallengeStatusAction;
  readonly secondary?: ChallengeStatusAction;
  /** A quiet text action at the bottom ("Return to map"). */
  readonly quiet?: ChallengeStatusAction;
  /**
   * The primary spends a Ticket or a retry: put the quiet action above it and
   * ignore the primary for RETRY_TAP_GUARD_MS after the card appears.
   */
  readonly guardRetry?: boolean;
}) {
  const reduced = useReducedGameMotion();
  const [armed, setArmed] = useState(!guardRetry);
  useEffect(() => {
    if (!guardRetry) { setArmed(true); return; }
    setArmed(false);
    const timer = setTimeout(() => setArmed(true), RETRY_TAP_GUARD_MS);
    return () => clearTimeout(timer);
  }, [guardRetry]);
  const quietAction = quiet && <Pressable accessibilityRole="button" onPress={quiet.onPress}
    style={guardRetry ? styles.quietAbove : styles.quiet} hitSlop={8}>
    <Text style={styles.quietText}>{quiet.label}</Text>
  </Pressable>;
  return (
    <Animated.View entering={reduced ? FadeIn.duration(120) : ZoomIn.springify().damping(14).stiffness(220)}
      style={styles.wrap} accessibilityRole="alert">
      <View style={styles.ribbon}><Ribbon text={title} /></View>
      <View style={styles.card}>
        {art === 'soClose' && <Image source={SO_CLOSE_SHARK} contentFit="contain" style={styles.shark}
          accessibilityLabel="The shark just missed the coin" />}
        {art === 'loading' && <View style={styles.loader}><SharkLoader compact tone="onBlue" /></View>}
        <Text style={styles.message}>{message}</Text>
        {guardRetry && quietAction}
        {primary && <View style={styles.primary}>
          <YellowButton text={primary.label} onPress={primary.onPress} disabled={primary.disabled || !armed} />
        </View>}
        {secondary && <Pressable accessibilityRole="button" onPress={secondary.onPress} disabled={secondary.disabled}
          style={[styles.secondary, secondary.disabled && { opacity: 0.5 }]}>
          <Text style={styles.secondaryText}>{secondary.label}</Text>
        </Pressable>}
        {!guardRetry && quietAction}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '88%', alignItems: 'center' },
  ribbon: { width: '100%', zIndex: 2 },
  card: { alignSelf: 'stretch', marginTop: '-9%', backgroundColor: '#0879ca', borderWidth: 3, borderColor: '#ffffff',
    borderRadius: 20, paddingTop: 30, paddingHorizontal: 18, paddingBottom: 14, alignItems: 'center',
    shadowColor: '#05346e', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 8 }, shadowRadius: 14, elevation: 10 },
  shark: { width: 150, height: 150, marginBottom: 6 },
  loader: { height: 110, alignSelf: 'stretch', justifyContent: 'center' },
  message: { fontFamily: 'Knockout', fontSize: 18, lineHeight: 23, color: '#ffffff', textAlign: 'center',
    marginBottom: 12 },
  primary: { alignSelf: 'stretch', alignItems: 'center' },
  secondary: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: '#e4f7ff', borderWidth: 2, borderColor: '#ffffff',
    borderBottomWidth: 4, borderBottomColor: '#9ccbe9', borderRadius: 14, paddingVertical: 11, marginTop: 8 },
  secondaryText: { fontFamily: 'Shark', fontSize: 17, color: '#05346e' },
  quiet: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  quietAbove: { minHeight: 56, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  quietText: { fontFamily: 'Shark', fontSize: 16, color: '#dff4ff' },
});
