import { useEffect, useRef } from 'react';
import { Image } from 'expo-image';
import { Animated, StyleSheet, Text, View } from 'react-native';

/** A visible path from home finds to the next park-day Ticket. */
export default function HomeTicketProgress({ findsUntilTicket, streakCurrent = 0,
  streakMultiplier = 1, streakAtRisk = false }: {
  readonly findsUntilTicket: number;
  readonly streakCurrent?: number;
  readonly streakMultiplier?: number;
  readonly streakAtRisk?: boolean;
}) {
  const remaining = Math.max(1, Math.min(3, Math.round(findsUntilTicket)));
  const filled = 3 - remaining;
  const streak = Math.max(0, Math.floor(streakCurrent));
  const streakLabel = streakAtRisk
    ? `FIND TODAY FOR DAY ${streak + 1}`
    : streakMultiplier > 1 ? `DAY ${streak} · ${streakMultiplier.toFixed(1)}× ENERGY + XP`
      : `DAY ${streak} HUNT STREAK`;
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
    accessibilityLabel={`You get a ticket within ${remaining} ${remaining === 1 ? 'find' : 'finds'}${streak > 0 ? `. ${streakAtRisk ? `Your ${streak}-day hunt streak needs a find today` : `${streak}-day hunt streak`}` : ''}`}>
    <Animated.View style={[styles.ticketIcon, { transform: [{ scale: ticketScale }] }]}>
      <Image source={require('../../../assets/images/ticket-icon.png')}
        style={styles.ticketImage} contentFit="contain" />
    </Animated.View>
    <View style={styles.copy}>
      <Text style={styles.kicker}>A TICKET IS COMING</Text>
      <Text style={styles.headline}>WITHIN {remaining} {remaining === 1 ? 'FIND' : 'FINDS'}</Text>
      <View style={styles.pips} accessibilityElementsHidden>
        {[0, 1, 2].map(index => <View key={index}
          style={[styles.pip, index < filled && styles.pipFilled]} />)}
      </View>
      {streak > 0 && <Text numberOfLines={1} style={[styles.streak, streakAtRisk && styles.streakAtRisk]}>
        {streakLabel}
      </Text>}
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
