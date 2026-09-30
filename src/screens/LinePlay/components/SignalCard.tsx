import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LineSignalSummary } from '../../../api/endpoints/me/inline-timer/types';
import { borderRadius, shadows, spacing } from '../../../design-system';
import { BRAND, GameButton, GameIcon } from '../../../ui';

interface Props {
  readonly signal: LineSignalSummary;
  readonly pending: boolean;
  readonly paused: boolean;
  readonly error: string | null;
  readonly onChoose: (route: 'route_a' | 'route_b') => void;
  readonly onPlayUnlocked: (route: 'route_a' | 'route_b') => void;
}

const ROUTES = {
  route_a: { name: 'Shadow Trail', game: 'Memory Match', prompt: 'Spot one easy-to-miss queue detail. Let someone else find it before you point it out.' },
  route_b: { name: 'Starlight Route', game: 'Whack-a-Shark', prompt: 'Watch for a light cue that repeats. Tap the starlight sharks as they surface and skip the decoys.' },
} as const;

export default function SignalCard({ signal, pending, paused, error, onChoose, onPlayUnlocked }: Props) {
  const shared = signal.unlocked_route;
  const active = shared ?? signal.solo_route;
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.card}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>FANS CHANGE THE WAIT</Text>
          <Text style={styles.heroTitle}>CREW{'\n'}ROUTE</Text>
        </View>
        <Image source={require('../../../../assets/images/screens/pin-collections/shark.png')}
          resizeMode="contain" style={styles.shark} accessibilityLabel="Theme Park Shark mascot" />
      </View>
      <Text style={styles.day}>TODAY AT THIS RIDE · {signal.park_day}</Text>
      <Text style={styles.title}>{active ? `${ROUTES[active].name} is open` : 'Choose the crew’s next route'}</Text>
      <Text style={styles.body}>
        {shared
          ? `${signal.participants} players at this ride opened a shared chapter. Their choice unlocked ${ROUTES[shared].game} for everyone playing LinePlay here.`
          : active
            ? `Your personal chapter is open. ${ROUTES[active].game} is next; other players can still open a shared route.`
            : 'After one verified minute near this ride, choose a signal. Three different guests voting today open a shared round. Playing alone? Your chosen route opens after three eligible minutes.'}
      </Text>

      <View style={styles.meter}>
        <Text style={styles.meterCount}>{signal.participants}/{signal.community_target}</Text>
        <View style={styles.meterCopy}>
          <Text style={styles.meterTitle}>CREW SIGNALS</Text>
          <Text style={styles.meterText}>{signal.route_a_count} shadow · {signal.route_b_count} starlight</Text>
        </View>
      </View>

      {signal.player_choice ? (
        <Text style={styles.note}>
          You chose {ROUTES[signal.player_choice].name}.
          {!active && (signal.seconds_until_solo > 0
            ? ` Your solo route opens after ${Math.ceil(signal.seconds_until_solo / 60)} more eligible minute${signal.seconds_until_solo > 60 ? 's' : ''}; a shared route may open sooner.`
            : ' Your solo route opens when the next verified nearby update arrives.')}
        </Text>
      ) : (
        <View style={styles.choices}>
          {(['route_a', 'route_b'] as const).map((route) => (
            <Pressable
              key={route}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${ROUTES[route].name}`}
              disabled={!signal.can_choose || pending || paused}
              onPress={() => onChoose(route)}
              style={[styles.choice, route === 'route_b' && styles.choiceB,
                (!signal.can_choose || pending || paused) && styles.disabled]}
            >
              <GameIcon name={route === 'route_a' ? 'search' : 'sparkle'} size={40} />
              <Text style={[styles.choiceText, route === 'route_b' && styles.choiceLight]}>{ROUTES[route].name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {!signal.player_choice && !signal.can_choose && (
        <Text style={styles.note}>
          {signal.seconds_until_eligible > 0
            ? `${signal.seconds_until_eligible}s of eligible nearby time until you can choose.`
            : 'Waiting for a current nearby location sample.'}
        </Text>
      )}
      {active && (
        <>
          <Text style={styles.prompt}>{ROUTES[active].prompt} Pass the phone or play solo.</Text>
          <GameButton label={`Play ${ROUTES[active].game}`} icon="play" disabled={paused} fullWidth
            onPress={() => onPlayUnlocked(active)} style={styles.playButton} />
        </>
      )}
      {paused && <Text style={styles.note}>Paused. Tap play on the wait card to jump back in.</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#80d4fb' },
  card: { margin: spacing.md, padding: spacing.md, borderRadius: borderRadius.xxl,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#d8f4ff', ...shadows.lg },
  hero: { height: 112, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0875c9',
    borderRadius: 16, margin: -6, marginBottom: spacing.md, overflow: 'hidden', paddingLeft: 14 },
  heroCopy: { flex: 1, zIndex: 1 },
  shark: { width: 112, height: 112, marginRight: -8 },
  kicker: { color: '#bfeaff', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1 },
  heroTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 28, lineHeight: 31, marginTop: 4,
    textShadowColor: '#034471', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  day: { color: '#0875c9', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.5 },
  title: { color: '#153e67', fontFamily: 'Shark', fontSize: 21, marginTop: spacing.sm },
  body: { color: '#244d70', fontFamily: 'Knockout', fontSize: 15, lineHeight: 20, marginTop: spacing.sm },
  meter: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md,
    padding: spacing.md, borderRadius: borderRadius.lg, borderWidth: 2, borderColor: '#fff',
    backgroundColor: '#bcecff' },
  meterCount: { color: '#075d9f', fontFamily: 'Shark', fontSize: 27, marginRight: spacing.md },
  meterCopy: { flex: 1 },
  meterTitle: { color: '#075d9f', fontFamily: 'Knockout', fontSize: 18 },
  meterText: { color: '#244d70', fontFamily: 'Knockout', fontSize: 14, marginTop: 2 },
  choices: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  choice: { flex: 1, minHeight: 82, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg, borderWidth: 3, borderColor: '#fff',
    backgroundColor: '#ffca30', alignItems: 'center', justifyContent: 'center', ...shadows.md },
  choiceB: { backgroundColor: BRAND.blueBright },
  choiceLight: { color: '#fff' },
  disabled: { opacity: 0.45 },
  choiceText: { color: '#093d77', fontFamily: 'Knockout', fontSize: 17, textAlign: 'center' },
  note: { color: '#376888', fontFamily: 'Knockout', fontSize: 14, marginTop: spacing.md },
  prompt: { color: '#153e67', fontFamily: 'Knockout', fontSize: 15, lineHeight: 21, marginTop: spacing.lg },
  playButton: { marginTop: spacing.md, alignSelf: 'center' },
  error: { color: '#b72333', fontFamily: 'Knockout', fontSize: 14, marginTop: spacing.md },
});
