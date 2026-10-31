import { useEffect, useRef } from 'react';
import { Image } from 'expo-image';
import { Animated, StyleSheet, Text, View } from 'react-native';

/**
 * A visible path from treats to the next park-day Ticket. Treats only: the flame on the Rewards
 * button is the one streak (core loop 4.5), so no second streak shows here. The streak props stay
 * for old callers and are ignored.
 */
export default function HomeTicketProgress({ findsUntilTicket }: {
  readonly findsUntilTicket: number;
  readonly streakCurrent?: number;
  readonly streakMultiplier?: number;
  readonly streakAtRisk?: boolean;
}) {
  const remaining = Math.max(1, Math.min(3, Math.round(findsUntilTicket)));
  const filled = 3 - remaining;
  const ticketScale = useRef(new Animated.Value(1)).current;
  const previousRemaining = useRef(remaining);

  useEffect(() => {
    if (previousRemaining.current !== remaining) {
      ticketScale.setValue(0.75);
      Animated.spring(ticketScale, { toValue: 1, friction: 4,
        tension: 180, useNativeDriver: true }).start();
      previousRemaining.current = remaining;
    }
  }, [remaining, ticketScale]);

  return <View style={styles.card} accessible accessibilityRole="text"
    accessibilityLabel={`${remaining} more ${remaining === 1 ? 'treat' : 'treats'} = 1 Ticket`}>
    <Animated.View style={[styles.ticketIcon, { transform: [{ scale: ticketScale }] }]}>
      <Image source={require('../../../assets/images/ticket-icon.png')}
        style={styles.ticketImage} contentFit="contain" />
    </Animated.View>
    <View style={styles.copy}>
      <Text style={styles.kicker}>A TICKET IS COMING</Text>
      <Text style={styles.headline}>{remaining} MORE {remaining === 1 ? 'TREAT' : 'TREATS'}</Text>
      <View style={styles.pips} accessibilityElementsHidden>
        {[0, 1, 2].map(index => <View key={index}
          style={[styles.pip, index < filled && styles.pipFilled]} />)}
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { position: 'absolute', bottom: 35, alignSelf: 'center', zIndex: 10,
    flexDirection: 'row', alignItems: 'center', width: 250, minHeight: 60,
    paddingHorizontal: 9, borderRadius: 16, borderWidth: 3, borderColor: '#fff',
    backgroundColor: '#0879ca', shadowColor: '#003c7a', shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 4, elevation: 5 },
  ticketIcon: { width: 48, height: 48, marginRight: 7, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffca30',
    borderWidth: 2, borderColor: '#07569e' },
  ticketImage: { width: 37, height: 37 },
  copy: { flex: 1, minWidth: 0 },
  kicker: { color: '#ffe06c', fontFamily: 'Knockout', fontSize: 12,
    letterSpacing: 0.45 },
  headline: { color: '#fff', fontFamily: 'Shark', fontSize: 18, marginTop: 1 },
  pips: { flexDirection: 'row', gap: 4, marginTop: 3 },
  pip: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#79bee9' },
  pipFilled: { backgroundColor: '#ffca30' },
  streak: { color: '#e4f5ff', fontFamily: 'Knockout', fontSize: 12,
    letterSpacing: 0.2, marginTop: 5 },
  streakAtRisk: { color: '#ffca30' },
});
