/**
 * The line Ticket on the wait card (T084): a small Ticket that fills while the guest waits near the ride,
 * so "10 minutes in a ride line earns a Ticket" is something a kid can watch happen. Full, it pops once
 * and stays bright; the Ticket itself lands when the wait ends (the server pays it then).
 * Shown only while queue_tickets is on and this ride's Ticket is still to earn today.
 */
import { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { BEZIER, DURATION, SPRING } from '../../../ui/motion';
import { lineTicketProgress } from '../../../services/lineplay/lineLayout';

const SIZE = 34;
const TICKET = require('../../../../assets/images/ticket-icon.png');

export default function LineTicketFill({ verifiedSeconds, intervalSeconds, reducedMotion = false }: {
  readonly verifiedSeconds: number;
  readonly intervalSeconds: number;
  readonly reducedMotion?: boolean;
}) {
  const { progress, full, minutesLeft } = lineTicketProgress(verifiedSeconds, intervalSeconds);
  // Steps of 1/40 (15 s of a 10 minute Ticket): the fill moves a little now and then, never every clock tick.
  const shown = full ? 1 : Math.floor(progress * 40) / 40;
  const fill = useSharedValue(shown);
  const pop = useSharedValue(1);
  useEffect(() => {
    fill.value = reducedMotion ? shown
      : withTiming(shown, { duration: DURATION.base, easing: Easing.bezier(...BEZIER.out) });
  }, [shown, reducedMotion, fill]);
  useEffect(() => {
    if (!full || reducedMotion) return;
    pop.value = withSequence(withTiming(1.18, { duration: DURATION.quick, easing: Easing.bezier(...BEZIER.out) }),
      withSpring(1, SPRING.pop));
  }, [full, reducedMotion, pop]);
  const fillStyle = useAnimatedStyle(() => ({ width: SIZE * fill.value }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return <Reanimated.View style={[styles.well, full && styles.wellFull, popStyle]} accessible accessibilityRole="text"
    accessibilityLabel={full ? 'Ticket full. It comes when this wait ends.' : `Ticket filling. ${minutesLeft} more minute${minutesLeft === 1 ? '' : 's'} near the ride.`}>
    <Image source={TICKET} style={[styles.ticket, styles.dim]} resizeMode="contain" />
    <Reanimated.View style={[styles.clip, fillStyle]} pointerEvents="none">
      <Image source={TICKET} style={styles.ticket} resizeMode="contain" />
    </Reanimated.View>
  </Reanimated.View>;
}

const styles = StyleSheet.create({
  well: { width: SIZE + 6, height: SIZE + 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(7,62,121,0.35)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)' },
  wellFull: { backgroundColor: '#ffca30', borderColor: '#07569e' },
  ticket: { width: SIZE, height: SIZE },
  dim: { opacity: 0.3 },
  clip: { position: 'absolute', left: 1, top: 1, height: SIZE, overflow: 'hidden' },
});
