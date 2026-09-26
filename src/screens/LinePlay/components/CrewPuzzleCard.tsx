import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CrewPuzzleSummary } from '../../../api/endpoints/me/inline-timer/types';
import { borderRadius, shadows, spacing } from '../../../design-system';

const SYMBOLS = ['FIN', 'STAR', 'WAVE', 'MOON'] as const;

interface Props {
  readonly puzzle: CrewPuzzleSummary | null;
  readonly route: 'route_a' | 'route_b' | null;
  readonly pending: boolean;
  readonly retryPending: boolean;
  readonly retrySymbols: readonly number[] | null;
  readonly paused: boolean;
  readonly bonusAvailable?: boolean;
  readonly partIntervalSeconds?: number;
  readonly error: string | null;
  readonly onGuess: (symbols: readonly number[]) => void;
}

export default function CrewPuzzleCard({ puzzle, route, pending, retryPending, retrySymbols, paused, bonusAvailable = false, partIntervalSeconds = 600, error, onGuess }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => {
    setSelected(retrySymbols ? [...retrySymbols] : []);
  }, [puzzle?.stage, puzzle?.last_result?.client_request_id, retrySymbols]);

  const addSymbol = (symbol: number) => {
    if (selected.length < 3 && !selected.includes(symbol) && !retryPending && !pending && !paused) {
      setSelected((current) => [...current, symbol]);
    }
  };
  const removeSymbol = (index: number) => {
    if (!retryPending && !pending && !paused) setSelected((current) => current.filter((_, position) => position !== index));
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.card}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>EVERY GUESS HELPS THE LINE</Text>
          <Text style={styles.title}>{puzzle?.completed ? 'Signal cracked!' : 'Crew Codebreaker'}</Text>
        </View>
        <Image source={require('../../../../assets/images/screens/pin-collections/shark.png')}
          resizeMode="contain" style={styles.shark} accessibilityLabel="Theme Park Shark mascot" />
      </View>
      {puzzle && <View style={styles.gates} accessibilityLabel={`${puzzle.completed ? puzzle.total_stages : puzzle.stage - 1} of ${puzzle.total_stages} gates open`}>
        {Array.from({ length: puzzle.total_stages }, (_, index) => (
          <View key={index} style={[styles.gate, (puzzle.completed || index < puzzle.stage - 1) && styles.gateOpen]}>
            <Text style={[styles.gateText, (puzzle.completed || index < puzzle.stage - 1) && styles.gateTextOpen]}>{index + 1}</Text>
          </View>
        ))}
      </View>}
      <Text style={styles.heading}>{puzzle?.completed ? 'All gates open' : puzzle ? `Gate ${puzzle.stage} of ${puzzle.total_stages}` : 'A shared mystery is waiting'}</Text>
      <Text style={styles.body}>
        {!puzzle
          ? 'Three crew signals at this ride open a code the whole line can solve together.'
          : route === 'route_a'
            ? 'The Shadow Trail has three sealed gates. Combine the clues from everyone’s guesses to open the next one.'
            : 'The Starlight beacon has three frequencies. Use the crew’s shared clues to align them.'}
      </Text>
      {bonusAvailable && !puzzle?.completed && <Text style={styles.bonus}>
        🎁 Send a codebreaker guess, then stay near the ride for {Math.ceil(partIntervalSeconds / 60)} verified minutes to earn 1 bonus Ride Part. Once per ride coin each park day.
      </Text>}

      {puzzle && (
        <>
          <View style={styles.progress}>
            <Text style={styles.progressText}>{puzzle.participants} crew members · {puzzle.total_guesses} guesses</Text>
            <Text style={styles.progressText}>{puzzle.completed ? 'All gates open' : `${puzzle.stage - 1}/${puzzle.total_stages} gates open`}</Text>
          </View>

          {puzzle.last_result && (
            <Text style={styles.lastResult}>
              {puzzle.last_result.solved_stage
                ? 'Your last guess opened a gate!'
                : `Your last clue: ${puzzle.last_result.exact} exact, ${puzzle.last_result.misplaced} in another spot.`}
            </Text>
          )}

          {!puzzle.completed && (
            <>
              <Text style={styles.instructions}>Choose three different symbols. Exact means the right symbol in the right spot; elsewhere means the right symbol in another spot.</Text>
              <View style={styles.slots}>
                {[0, 1, 2].map((position) => (
                  <Pressable key={position} accessibilityRole="button"
                    accessibilityLabel={selected[position] == null ? `Code slot ${position + 1}, empty` : `Remove ${SYMBOLS[selected[position]]} from slot ${position + 1}`}
                    disabled={paused || pending || retryPending || selected[position] == null}
                    onPress={() => removeSymbol(position)} style={styles.slot}>
                    <Text style={styles.slotText}>{selected[position] == null ? '?' : SYMBOLS[selected[position]]}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.palette}>
                {SYMBOLS.map((label, symbol) => (
                  <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Choose ${label}`}
                    onPress={() => addSymbol(symbol)}
                    disabled={paused || pending || selected.includes(symbol) || selected.length >= 3 || retryPending}
                    style={[styles.symbol, (paused || pending || selected.includes(symbol) || selected.length >= 3 || retryPending) && styles.disabled]}>
                    <Text style={styles.symbolText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => onGuess(selected)}
                disabled={selected.length !== 3 || pending || paused || (!retryPending && !puzzle.can_guess)}
                style={[styles.submit, (selected.length !== 3 || pending || paused || (!retryPending && !puzzle.can_guess)) && styles.disabled]}
              >
                <Text style={styles.submitText}>{pending ? 'Checking...' : retryPending ? 'Retry this guess' : 'Send clue to crew'}</Text>
              </Pressable>
              {paused && <Text style={styles.note}>Line moving. Resume when you can look at the screen.</Text>}
              {!paused && !puzzle.can_guess && !retryPending && (
                <Text style={styles.note}>
                  {puzzle.needs_nearby_sample
                    ? 'Waiting for a current nearby location sample.'
                    : `Next guess opens after about ${Math.ceil(puzzle.seconds_until_guess / 60)} more minute${puzzle.seconds_until_guess > 60 ? 's' : ''} of nearby time.`}
                </Text>
              )}
            </>
          )}

          {puzzle.recent_guesses.length > 0 && (
            <View style={styles.clues}>
              <Text style={styles.clueTitle}>CREW CLUES · GATE {puzzle.stage}</Text>
              {puzzle.recent_guesses.map((guess, index) => (
                <Text key={`${index}-${guess.symbols.join('-')}`} style={styles.clueText}>
                  {guess.symbols.map((symbol) => SYMBOLS[symbol]).join(' · ')}  →  {guess.exact} exact, {guess.misplaced} elsewhere
                </Text>
              ))}
            </View>
          )}
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#83d5f9' },
  card: { margin: spacing.md, padding: spacing.md, borderRadius: borderRadius.xxl,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#d9f4ff', ...shadows.lg },
  hero: { height: 110, flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    margin: -6, marginBottom: spacing.md, borderRadius: 16, paddingLeft: 14, backgroundColor: '#0875c9' },
  heroCopy: { flex: 1, zIndex: 1 },
  shark: { width: 110, height: 110, marginRight: -7 },
  kicker: { color: '#c8efff', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1 },
  title: { color: '#fff', fontFamily: 'Shark', fontSize: 23, lineHeight: 27, marginTop: 5,
    textShadowColor: '#034471', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  gates: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginBottom: spacing.md },
  gate: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff',
    backgroundColor: '#a7d5e9', alignItems: 'center', justifyContent: 'center' },
  gateOpen: { backgroundColor: '#ffca30' },
  gateText: { color: '#376888', fontFamily: 'Knockout', fontSize: 18 },
  gateTextOpen: { color: '#093d77' },
  heading: { color: '#093d77', fontFamily: 'Shark', fontSize: 20, marginBottom: spacing.sm },
  body: { color: '#244d70', fontSize: 14, lineHeight: 21, marginBottom: spacing.md },
  bonus: { color: '#8b5900', fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: spacing.sm },
  progress: { marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#fff', backgroundColor: '#b9e8fc' },
  progressText: { color: '#244d70', fontSize: 13, marginBottom: 3 },
  lastResult: { color: '#8b5900', fontSize: 14, marginTop: spacing.md, fontWeight: '700' },
  instructions: { color: '#244d70', fontSize: 13, lineHeight: 19, marginTop: spacing.lg },
  slots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  slot: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#ffca30', backgroundColor: '#fff' },
  slotText: { color: '#093d77', fontFamily: 'Knockout', fontSize: 17 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.md },
  symbol: { width: '47%', minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#fff', backgroundColor: '#ffca30', ...shadows.md },
  symbolText: { color: '#093d77', fontFamily: 'Knockout', fontSize: 17 },
  submit: { marginTop: spacing.lg, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#fff', backgroundColor: '#0875c9', alignItems: 'center', ...shadows.md },
  submitText: { color: '#fff', fontFamily: 'Knockout', fontSize: 17 },
  disabled: { opacity: 0.4 },
  note: { color: '#244d70', fontSize: 13, marginTop: spacing.md },
  clues: { marginTop: spacing.lg, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#fff', backgroundColor: '#b9e8fc' },
  clueTitle: { color: '#0875c9', fontFamily: 'Knockout', fontSize: 14, marginBottom: spacing.sm },
  clueText: { color: '#244d70', fontSize: 13, lineHeight: 20 },
  error: { color: '#a83030', fontSize: 13, marginTop: spacing.md },
});
