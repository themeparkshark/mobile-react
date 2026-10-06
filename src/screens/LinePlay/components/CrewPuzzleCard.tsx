import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CrewPuzzleSummary } from '../../../api/endpoints/me/inline-timer/types';
import { borderRadius, shadows, spacing } from '../../../design-system';
import { BRAND, GameIcon, type GameIconName } from '../../../ui';

/** Server symbols are indexes 0-3; the client draws them with his art. */
const SYMBOL_ICONS: readonly GameIconName[] = ['fin', 'star', 'crown', 'gift'];
const SYMBOLS = ['Fin', 'Star', 'Crown', 'Gift'] as const;

/** "2 exact, 1 elsewhere" as icon chips a player can read at a glance. */
function ClueChips({ exact, misplaced }: { exact: number; misplaced: number }) {
  return <View style={styles.chips} accessible accessibilityLabel={`${exact} exact, ${misplaced} elsewhere`}>
    <View style={[styles.chip, styles.chipExact]}><GameIcon name="check" size={18} /><Text style={styles.chipText}>{exact}</Text></View>
    <View style={[styles.chip, styles.chipMoved]}><GameIcon name="retry" size={18} /><Text style={styles.chipText}>{misplaced}</Text></View>
  </View>;
}

/** Echo sharks: fully synthetic flavor names, never a real player (the app has minors). */
const ECHO_WORDS = ['Reef', 'Tide', 'Wave', 'Coral', 'Kelp', 'Drift', 'Splash', 'Lagoon'] as const;

export function echoNames(seed: number, count: number): string[] {
  const names: string[] = [];
  let state = (Math.abs(Math.floor(seed)) * 2654435761) >>> 0;
  while (names.length < Math.min(2, Math.max(0, count))) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const name = `Echo ${ECHO_WORDS[state % ECHO_WORDS.length]}`;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Seats (queue-bonus.md 6.2): Captain Fin sits in seat 1 of a lonely round,
 * and up to 2 Echo sharks fill the rest at 55% with an ECHO tag. Echoes never
 * guess, never type and are never counted: the count is live players only.
 */
function CrewSeats({ puzzle }: { puzzle: CrewPuzzleSummary }) {
  const live = Math.max(0, puzzle.live_players ?? 0);
  const echoes = puzzle.lonely ? echoNames((puzzle.generation ?? 1) * 7 + puzzle.stage, 2 - Math.min(2, live)) : [];
  return <View style={styles.seats}>
    {puzzle.lonely && <View style={styles.seat} accessibilityLabel="Captain Fin is on your crew">
      <GameIcon name="fin" size={30} /><Text style={styles.seatName}>Captain Fin</Text>
    </View>}
    {echoes.map(name => <View key={name} style={[styles.seat, styles.echoSeat]} accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Image source={require('../../../../assets/images/screens/pin-collections/shark.png')}
        resizeMode="contain" style={styles.echoShark} />
      <Text style={styles.seatName}>{name}</Text>
      <Text style={styles.echoTag}>ECHO</Text>
    </View>)}
    <Text style={styles.liveCount}>
      {live > 0 ? `${live} shark${live === 1 ? '' : 's'} cracking` : 'Crack it with Captain Fin'}
    </Text>
  </View>;
}

function nextCodeLine(puzzle: CrewPuzzleSummary, now: number): string | null {
  if (!puzzle.completed || !puzzle.next_code_at) return null;
  const at = Date.parse(puzzle.next_code_at);
  if (!Number.isFinite(at)) return null;
  const left = Math.max(0, Math.floor((at - now) / 1000));
  return `NEXT CODE IN ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

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
      {puzzle && puzzle.lonely !== undefined && <CrewSeats puzzle={puzzle} />}
      <Text style={styles.heading}>{puzzle?.completed ? nextCodeLine(puzzle, Date.now()) ?? 'All gates open'
        : puzzle ? `Gate ${puzzle.stage} of ${puzzle.total_stages}` : 'A shared mystery is waiting'}</Text>
      {puzzle?.fin_hint && !puzzle.completed && <View style={styles.bonusRow}
        accessibilityLabel={`Captain Fin's hint: ${SYMBOLS[puzzle.fin_hint.symbol] ?? ''} in slot ${puzzle.fin_hint.position + 1}`}>
        <GameIcon name="fin" size={24} />
        <Text style={styles.bonus}>Captain Fin: slot {puzzle.fin_hint.position + 1} is</Text>
        <GameIcon name={SYMBOL_ICONS[puzzle.fin_hint.symbol] ?? 'star'} size={24} />
      </View>}
      <Text style={styles.body}>
        {!puzzle
          ? 'Everyone in line at this ride can crack this code together. It works even in a quiet line.'
          : route === 'route_a'
            ? 'The Shadow Trail has three locked gates. Use clues from everyone’s guesses to open the next one.'
            : 'The Starlight beacon has three locks. Use your crew’s clues to open them.'}
      </Text>
      {bonusAvailable && puzzle?.lonely === undefined && !puzzle?.completed && <View style={styles.bonusRow}>
        <GameIcon name="gift" size={28} />
        <Text style={styles.bonus}>
          Send a guess. Then stay near the ride for {Math.ceil(partIntervalSeconds / 60)} minutes to get 1 bonus Ride Part. You can do this once per ride each day.
        </Text>
      </View>}

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
              <View style={styles.legend}>
                <Text style={styles.instructions}>Pick 3 symbols.</Text>
                <GameIcon name="check" size={18} /><Text style={styles.instructions}>right spot</Text>
                <GameIcon name="retry" size={18} /><Text style={styles.instructions}>wrong spot</Text>
              </View>
              <View style={styles.slots}>
                {[0, 1, 2].map((position) => (
                  <Pressable key={position} accessibilityRole="button"
                    accessibilityLabel={selected[position] == null ? `Code slot ${position + 1}, empty` : `Remove ${SYMBOLS[selected[position]]} from slot ${position + 1}`}
                    disabled={paused || pending || retryPending || selected[position] == null}
                    onPress={() => removeSymbol(position)} style={[styles.slot, selected[position] == null && styles.slotEmpty]}>
                    {selected[position] == null ? <Text style={styles.slotText}>{position + 1}</Text>
                      : <GameIcon name={SYMBOL_ICONS[selected[position]]} size={40} />}
                  </Pressable>
                ))}
              </View>
              <View style={styles.palette}>
                {SYMBOLS.map((label, symbol) => (
                  <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Choose ${label}`}
                    onPress={() => addSymbol(symbol)}
                    disabled={paused || pending || selected.includes(symbol) || selected.length >= 3 || retryPending}
                    style={[styles.symbol, (paused || pending || selected.includes(symbol) || selected.length >= 3 || retryPending) && styles.disabled]}>
                    <GameIcon name={SYMBOL_ICONS[symbol]} size={44} />
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
              {paused && <Text style={styles.note}>Paused. Your guess is saved.</Text>}
              {!paused && !puzzle.can_guess && !retryPending && (
                <Text style={styles.note}>
                  {puzzle.needs_nearby_sample
                    ? 'Checking that you are near the ride…'
                    : `Stay near the ride about ${Math.ceil(puzzle.seconds_until_guess / 60)} more minute${puzzle.seconds_until_guess > 60 ? 's' : ''}. Then you can guess again.`}
                </Text>
              )}
            </>
          )}

          {puzzle.recent_guesses.length > 0 && (
            <View style={styles.clues}>
              <Text style={styles.clueTitle}>CREW CLUES · GATE {puzzle.stage}</Text>
              {puzzle.recent_guesses.map((guess, index) => (
                <View key={`${index}-${guess.symbols.join('-')}`} style={styles.clueRow} accessible
                  accessibilityLabel={`${guess.symbols.map(symbol => SYMBOLS[symbol]).join(', ')}: ${guess.exact} exact, ${guess.misplaced} elsewhere`}>
                  <View style={styles.clueSymbols}>
                    {guess.symbols.map((symbol, position) => <GameIcon key={position} name={SYMBOL_ICONS[symbol]} size={30} />)}
                  </View>
                  <ClueChips exact={guess.exact} misplaced={guess.misplaced} />
                </View>
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
  seats: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  seat: { alignItems: 'center', minWidth: 64 },
  echoSeat: { opacity: 0.55 },
  echoShark: { width: 30, height: 30, tintColor: '#9fb4c4' },
  seatName: { fontFamily: 'Knockout', fontSize: 11, color: '#083f7c', marginTop: 2 },
  echoTag: { fontFamily: 'Knockout', fontSize: 9, color: '#5f7f99', letterSpacing: 1 },
  liveCount: { fontFamily: 'Knockout', fontSize: 13, color: '#083f7c', marginLeft: 4 },
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
  body: { color: '#244d70', fontFamily: 'Knockout', fontSize: 15, lineHeight: 21, marginBottom: spacing.md },
  bonusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  bonus: { flex: 1, color: '#8b5900', fontFamily: 'Knockout', fontSize: 14, lineHeight: 19 },
  progress: { marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#fff', backgroundColor: '#b9e8fc' },
  progressText: { color: '#244d70', fontFamily: 'Knockout', fontSize: 14, marginBottom: 3 },
  lastResult: { color: '#8b5900', fontFamily: 'Knockout', fontSize: 15, marginTop: spacing.md },
  legend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: spacing.lg },
  instructions: { color: '#244d70', fontFamily: 'Knockout', fontSize: 15, lineHeight: 19 },
  slots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  slot: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.lg,
    borderWidth: 3, borderColor: BRAND.gold, backgroundColor: '#fff' },
  slotEmpty: { borderStyle: 'dashed', borderColor: '#8fc3e0', backgroundColor: '#eef9ff' },
  slotText: { color: '#8fb4cc', fontFamily: 'Shark', fontSize: 20 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.md },
  symbol: { width: '47%', minHeight: 84, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.lg,
    borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.cream, ...shadows.md },
  symbolText: { color: '#093d77', fontFamily: 'Knockout', fontSize: 15, marginTop: 2 },
  submit: { marginTop: spacing.lg, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#fff', backgroundColor: '#0875c9', alignItems: 'center', ...shadows.md },
  submitText: { color: '#fff', fontFamily: 'Knockout', fontSize: 17 },
  disabled: { opacity: 0.4 },
  note: { color: '#244d70', fontFamily: 'Knockout', fontSize: 14, marginTop: spacing.md },
  clues: { marginTop: spacing.lg, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#fff', backgroundColor: '#b9e8fc' },
  clueTitle: { color: '#0875c9', fontFamily: 'Knockout', fontSize: 14, marginBottom: spacing.sm },
  clueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  clueSymbols: { flexDirection: 'row', gap: 4 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999, borderWidth: 2, borderColor: BRAND.navy },
  chipExact: { backgroundColor: '#dff6e3' },
  chipMoved: { backgroundColor: '#fff3c4' },
  chipText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 15 },
  error: { color: '#a83030', fontFamily: 'Knockout', fontSize: 14, marginTop: spacing.md },
});
