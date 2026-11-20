/**
 * The coin card's Ticket count, with the claim moment (fix round W3, T142):
 * when earned Tickets are claimed in place, a few Tickets arc down from the
 * button into this count and the number counts up to the new total, like the
 * daily chest. UI-thread motion (Reanimated), at most 4 flying pictures, one
 * play per claim. The number is the header chip's own (hudShown, fix pass w5), so both
 * move together. Reduce Motion: the number simply changes.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
  type SharedValue } from 'react-native-reanimated';
import GameIcon from '../../ui/GameIcon';
import { claimFlightPlan } from './claimFlightModel';
import { hudShownNow, mirrorShown, subscribeHudShown, type HudShownState } from '../Topbar/hudShown';

const FLY_FROM_Y = -70;
/** The header chip this line mirrors (ExploreScreen's Ticket pill, flyTarget "tickets"). */
const TICKETS_TARGET = 'tickets';

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
  // Fix pass w5 (W4-SMOKE-3b): the number is the header chip's (hudShown), so the card and the header move together:
  // both hold while the Tickets fly and change on the frame they land. No JS timer counts it up any more (the
  // old count-up rewound to 0 after the wallet already said 10, then crawled up on a busy JS thread, 4 s behind).
  // With no header chip on screen, the line follows the wallet on its own.
  const [own, setOwn] = useState<HudShownState>({ value: tickets, prev: tickets, stream: null, key: 0 });
  useEffect(() => {
    setOwn(cur => (cur.value === tickets ? cur : { value: tickets, prev: cur.value, stream: null, key: cur.key + 1 }));
  }, [tickets]);
  const chip = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeHudShown(TICKETS_TARGET, listener), []),
    () => hudShownNow(TICKETS_TARGET),
  );
  const shown = mirrorShown(chip, own, tickets);
  // The flying pictures only (UI-thread motion); they are invisible once landed, so a late unmount is never seen.
  const [flying, setFlying] = useState<number | null>(null);
  const played = useRef<number | null>(null);
  const plan = claimed ? claimFlightPlan(claimed.amount) : null;
  useEffect(() => {
    if (!claimed || played.current === claimed.id || !plan || reduced) return undefined;
    played.current = claimed.id;
    setFlying(claimed.id);
    t.value = 0;
    t.value = withTiming(1, { duration: plan.flightMs, easing: Easing.out(Easing.cubic) });
    bump.value = withDelay(plan.flightMs - 80, withSequence(withTiming(1.25, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 260 })));
    const done = setTimeout(() => setFlying(null), plan.flightMs + 200);
    return () => { clearTimeout(done); cancelAnimation(t); cancelAnimation(bump); setFlying(null); };
  }, [claimed?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const n = shown.value;
  return (
    <View style={styles.row} accessible accessibilityLabel={`You have ${tickets} ticket${tickets === 1 ? '' : 's'}`}>
      <Animated.View style={bumpStyle}><GameIcon name="ticket" size={24} /></Animated.View>
      {/* A plain number, set on the commit the chip starts its roll: an animated digit here would be reset to its
          first-render digit by every commit of this busy card (commitHeal.ts), the stale "0 Tickets" of the w5 repro. */}
      <Text style={styles.count}>{n} {n === 1 ? 'Ticket' : 'Tickets'}</Text>
      {plan && flying != null && Array.from({ length: plan.pictures }, (_, i) => <FlyingTicket key={`${claimed?.id}-${i}`} t={t} index={i} count={plan.pictures} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 },
  count: { color: '#ffffff', fontFamily: 'Shark', fontSize: 18, textShadowColor: '#05346e',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  fly: { position: 'absolute', left: '50%', marginLeft: -40, top: 0 },
});
