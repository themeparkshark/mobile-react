/**
 * The coin card's Ticket count, with the claim moment (fix round W3, T142):
 * when earned Tickets are claimed in place, a few Tickets arc down from the
 * button into this count and the number counts up to the new total, like the
 * daily chest. UI-thread motion (Reanimated), at most 4 flying pictures, one
 * play per claim. Reduce Motion: the number simply changes.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
  type SharedValue } from 'react-native-reanimated';
import GameIcon from '../../ui/GameIcon';
import { claimFlightPlan } from './claimFlightModel';

const FLY_FROM_Y = -70;

function FlyingTicket({ t, index, count }: { readonly t: SharedValue<number>; readonly index: number; readonly count: number }) {
  const spread = (index - (count - 1) / 2) * 26;
  const style = useAnimatedStyle(() => {
    const local = Math.max(0, Math.min(1, t.value * (1 + count * 0.15) - index * 0.15));
    return {
      opacity: local <= 0 || local >= 1 ? 0 : 1,
      transform: [
        { translateX: spread * (1 - local) },
        { translateY: FLY_FROM_Y * (1 - local) - Math.sin(local * Math.PI) * 26 },
        { scale: 1.1 - local * 0.35 },
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.fly, style]}><GameIcon name="ticket" size={26} /></Animated.View>;
}

export default function TicketClaimFlight({ tickets, claimed, reduced }: {
  /** Tickets the player holds now (after the claim has landed in the wallet). */
  readonly tickets: number;
  /** Bumped once per finished claim: how many Tickets it brought (0 = nothing to play). */
  readonly claimed: { readonly id: number; readonly amount: number } | null;
  readonly reduced: boolean;
}) {
  const t = useSharedValue(0);
  const bump = useSharedValue(1);
  const [shown, setShown] = useState(tickets);
  const played = useRef<number | null>(null);
  const plan = claimed ? claimFlightPlan(claimed.amount) : null;
  useEffect(() => {
    if (!claimed || played.current === claimed.id || !plan) { if (!claimed) setShown(tickets); return undefined; }
    played.current = claimed.id;
    const from = Math.max(0, tickets - claimed.amount);
    if (reduced) { setShown(tickets); return undefined; }
    setShown(from);
    t.value = 0;
    t.value = withTiming(1, { duration: plan.flightMs, easing: Easing.out(Easing.cubic) });
    bump.value = withDelay(plan.flightMs - 80, withSequence(withTiming(1.25, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 260 })));
    const timers: ReturnType<typeof setTimeout>[] = [];
    plan.steps.forEach((share, i) => {
      timers.push(setTimeout(() => setShown(from + Math.round(claimed.amount * share)), plan.flightMs - 60 + i * plan.stepMs));
    });
    return () => { timers.forEach(clearTimeout); cancelAnimation(t); cancelAnimation(bump); };
  }, [claimed?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!claimed || played.current !== claimed.id || reduced) setShown(tickets); }, [tickets]); // eslint-disable-line react-hooks/exhaustive-deps
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const n = shown;
  return (
    <View style={styles.row} accessible accessibilityLabel={`You have ${tickets} ticket${tickets === 1 ? '' : 's'}`}>
      <Animated.View style={bumpStyle}><GameIcon name="ticket" size={24} /></Animated.View>
      <Text style={styles.count}>{n} {n === 1 ? 'Ticket' : 'Tickets'}</Text>
      {plan && Array.from({ length: plan.pictures }, (_, i) => <FlyingTicket key={`${claimed?.id}-${i}`} t={t} index={i} count={plan.pictures} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 },
  count: { color: '#ffffff', fontFamily: 'Shark', fontSize: 18, textShadowColor: '#05346e',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  fly: { position: 'absolute', left: '50%', marginLeft: -40, top: 0 },
});
