import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { borderRadius, shadows, spacing } from '../../../design-system';
import { SoundEffectContext } from '../../../context/SoundEffectProvider';
import HapticPatterns from '../../../helpers/hapticPatterns';
import type { LinePlayChapter } from '../../../services/lineplay/chapters';
import { fetchRideTrivia, type TriviaQuestion } from '../../../services/lineplay/content';
import {
  answerCrewTrivia,
  chooseCrewObservation,
  chooseCrewRoute,
  chooseCrewSize,
  crewRelayRoleNumber,
  crewRelayScore,
  hideCrewMemory,
  pickCrewMemory,
  readyForCrewTurn,
  undoCrewMemory,
  type CrewRelayProgress,
  type CrewObservation,
  type CrewRoute,
} from '../../../services/lineplay/crewRelay';
import { BRAND, GameIcon, SharkLoader, type GameIconName } from '../../../ui';
import CrewStoryPayoff from './CrewStoryPayoff';

/**
 * Signal symbols are drawn art tiles, never emoji or dingbats: kit icons for
 * shapes and sounds (his art and the approved GPT Image 2.5 set) and plain
 * colour chips for colours, each with its name for colour-blind players.
 */
const MEMORY_ICONS: Record<'shape' | 'sound', readonly GameIconName[]> = {
  shape: ['sparkle', 'crown', 'fin', 'dice'],
  sound: ['bell', 'timer', 'ride', 'camera'],
};
const MEMORY_COLORS = ['#ef4a3c', '#1e8ae0', '#ffcf3b', '#3cb85c'] as const;
const MEMORY_SYMBOL_NAMES: Record<CrewObservation, readonly string[]> = {
  shape: ['Star', 'Crown', 'Fin', 'Dice'],
  color: ['Red', 'Blue', 'Yellow', 'Green'],
  sound: ['Bell', 'Tick', 'Rumble', 'Click'],
};

function SymbolTile({ kind, symbol, size = 44 }: { kind: CrewObservation; symbol: number; size?: number }) {
  if (kind === 'color') return <View style={[styles.colorChip, { width: size, height: size,
    backgroundColor: MEMORY_COLORS[symbol] }]}><View style={styles.colorShine} /></View>;
  return <GameIcon name={MEMORY_ICONS[kind][symbol]} size={size} />;
}
const ROLE_NAMES = {
  trivia: 'Navigator',
  observation: 'Lookout',
  'memory-preview': 'Decoder',
  'memory-recall': 'Decoder',
  route: 'Captain',
};

interface Props {
  readonly chapter: LinePlayChapter;
  readonly progress: CrewRelayProgress;
  readonly paused: boolean;
  readonly onChange: (progress: CrewRelayProgress) => void;
}

export default function CrewRelayCard({ chapter, progress, paused, onChange }: Props) {
  const [question, setQuestion] = useState<TriviaQuestion | null>(null);
  const { playSound } = useContext(SoundEffectContext);
  const playSoundRef = useRef(playSound);
  playSoundRef.current = playSound;
  const turnPulse = useRef(new Animated.Value(1)).current;
  const previousStep = useRef(progress.step);
  useEffect(() => {
    if (previousStep.current === progress.step) return;
    previousStep.current = progress.step;
    turnPulse.stopAnimation();
    turnPulse.setValue(1);
    Animated.sequence([
      Animated.spring(turnPulse, { toValue: 1.18, friction: 5, useNativeDriver: true }),
      Animated.spring(turnPulse, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    if (progress.step === 'complete') {
      HapticPatterns.success();
      void playSoundRef.current?.(require('../../../../assets/sounds/reward.mp3'));
    }
  }, [progress.step, turnPulse]);
  useEffect(() => () => turnPulse.stopAnimation(), [turnPulse]);
  useEffect(() => {
    let alive = true;
    const clueSeed = chapter.adaptive && chapter.trivia.length
      ? progress.seed % chapter.trivia.length : progress.seed;
    void fetchRideTrivia(undefined, undefined, clueSeed, chapter.id)
      .then(value => { if (alive) setQuestion(value); });
    return () => { alive = false; };
  }, [chapter.id, progress.seed]);

  const role = ROLE_NAMES[progress.step as keyof typeof ROLE_NAMES] ?? 'Crew';
  const signalKind = progress.observation ?? 'shape';
  const symbolNames = MEMORY_SYMBOL_NAMES[signalKind];
  const playerNumber = crewRelayRoleNumber(progress);
  const turnLabel = progress.crewSize === 1 ? `Your ${role} turn` : `Player ${playerNumber} · ${role}`;
  const stepNumber = progress.step === 'trivia' ? 1 : progress.step === 'observation' ? 2 :
    progress.step === 'memory-preview' || progress.step === 'memory-recall' ? 3 :
    progress.step === 'route' ? 4 : 0;

  const option = (label: string, onPress: () => void, key = label, accessibilityLabel = label) => (
    <Pressable key={key} accessibilityRole="button" accessibilityLabel={accessibilityLabel} disabled={paused}
      style={({ pressed }) => [styles.option, (pressed || paused) && styles.optionDim]}
      onPress={() => { HapticPatterns.buttonTap(); onPress(); }}>
      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.card}>
      <ImageBackground source={require('../../../../assets/images/screens/lineplay/crew-relay-hero-v1.png')}
        resizeMode="cover" style={styles.hero} imageStyle={styles.heroImage}>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>ONE PHONE · SOLO OR CREW</Text>
          <Text style={styles.title}>{chapter.relay.title}</Text>
        </View>
      </ImageBackground>
      <View style={styles.turnTrack} accessibilityLabel={`${progress.step === 'complete' ? 4 : stepNumber} of 4 crew turns`}>
        {[1, 2, 3, 4].map(turn => <Animated.View key={turn}
          style={[styles.turnDot, (turn <= stepNumber || progress.step === 'complete') && styles.turnDotActive,
            turn === (progress.step === 'complete' ? 4 : stepNumber) && { transform: [{ scale: turnPulse }] }]}>
          <Text style={[styles.turnDotText, (turn <= stepNumber || progress.step === 'complete') && styles.turnDotTextActive]}>{turn}</Text>
        </Animated.View>)}
      </View>
      {progress.step === 'setup' && <Text style={styles.story}>{chapter.relay.setupStory}</Text>}
      {paused && <Text style={styles.paused}>Paused. This turn is saved.</Text>}

      {progress.step === 'setup' ? (
        <View>
          <Text style={styles.heading}>How many players?</Text>
          <Text style={styles.body}>Solo works too. With a group, each person takes a different role; players can take more than one turn.</Text>
          <View style={styles.grid}>
            {[1, 2, 3, 4].map(count => option(count === 1 ? 'Just me' : `${count} players`,
              () => onChange(chooseCrewSize(progress, count)), String(count)))}
          </View>
        </View>
      ) : progress.step === 'complete' ? (
        <View>
          <CrewStoryPayoff progress={progress} routeNames={chapter.relay.routeNames} />
          <Text style={styles.heading}>{crewRelayScore(progress) === 2 ? chapter.relay.perfectResult : chapter.relay.otherResult}</Text>
          <Text style={styles.body}>
            {progress.route === 'alpha' ? chapter.relay.alphaResult : chapter.relay.omegaResult}
          </Text>
          <Text style={styles.result}>{chapter.relay.scoreNoun}: {crewRelayScore(progress)}/2</Text>
          {progress.observation && <Text style={styles.body}>
            Your {progress.observation} pick changed the Decoder&apos;s code and the next round.
          </Text>}
          <Text style={styles.body}>{chapter.relay.completionNote}</Text>
        </View>
      ) : !progress.ready ? (
        <View>
          <Text style={styles.progress}>TURN {stepNumber} OF 4</Text>
          <Text style={styles.heading}>{turnLabel}</Text>
          {progress.step === 'observation' && progress.triviaCorrect !== null &&
            <Text style={styles.body}>{progress.triviaCorrect ? chapter.relay.firstClueFound : chapter.relay.missedClue}</Text>}
          {progress.step === 'memory-preview' && progress.observation &&
            <Text style={styles.body}>The Lookout chose a {progress.observation} signal. It changed the Decoder&apos;s code.</Text>}
          <Text style={styles.body}>{progress.crewSize === 1
            ? 'Take your next turn when you are ready.'
            : stepNumber === 1
              ? 'Player 1 takes the first turn. Each turn is one quick tap or two.'
              : `Pass the phone to Player ${playerNumber}.`}</Text>
          {option('Ready for my turn', () => onChange(readyForCrewTurn(progress)))}
        </View>
      ) : progress.step === 'trivia' ? (
        <View>
          <Text style={styles.progress}>TURN 1 OF 4 · {turnLabel}</Text>
          <Text style={styles.heading}>{chapter.relay.firstTurnTitle}</Text>
          {question ? <>
            <Text style={styles.body}>{question.question}</Text>
            {question.choices.map((choice, index) => option(choice,
              () => onChange(answerCrewTrivia(progress, index, question.correctIndex)), String(index)))}
          </> : <SharkLoader compact message="Finding your crew's clue" />}
        </View>
      ) : progress.step === 'observation' ? (
        <View>
          <Text style={styles.progress}>TURN 2 OF 4 · {turnLabel}</Text>
          <Text style={styles.heading}>Find a safe signal</Text>
          <Text style={styles.body}>From where you stand, choose one detail to remember. Tell the crew what you noticed; no photo or walking around is needed.</Text>
          {([['shape', 'A shape'], ['color', 'A color'], ['sound', 'A sound']] as const).map(([value, label]) =>
            option(label, () => onChange(chooseCrewObservation(progress, value as CrewObservation)), value))}
        </View>
      ) : progress.step === 'memory-preview' ? (
        <View>
          <Text style={styles.progress}>TURN 3 OF 4 · {turnLabel}</Text>
          <Text style={styles.heading}>Remember the signal</Text>
          <Text style={styles.body}>Your {signalKind} signal set this code. Study its five symbols, then rebuild the same order.</Text>
          <View style={styles.symbolRow}>
            {progress.memorySequence.map((symbol, index) => <View key={index} style={styles.symbol} accessible
              accessibilityLabel={`Signal symbol ${index + 1}: ${symbolNames[symbol]}`}>
              <SymbolTile kind={signalKind} symbol={symbol} size={40} />
            </View>)}
          </View>
          {option('Hide the signal', () => onChange(hideCrewMemory(progress)))}
        </View>
      ) : progress.step === 'memory-recall' ? (
        <View>
          <Text style={styles.progress}>TURN 3 OF 4 · {turnLabel}</Text>
          <Text style={styles.heading}>Rebuild the signal</Text>
          <Text style={styles.body}>Tap the five symbols in the order you saw them. A wrong tap does not stop the crew.</Text>
          <View style={styles.symbolRow} accessible
            accessibilityLabel={`${progress.memoryPicks.length} of 5 symbols placed`}>
            {[0, 1, 2, 3, 4].map(slot => <View key={slot} style={[styles.symbol, progress.memoryPicks[slot] == null && styles.symbolEmpty]}>
              {progress.memoryPicks[slot] != null && <SymbolTile kind={signalKind} symbol={progress.memoryPicks[slot]} size={40} />}
            </View>)}
          </View>
          <View style={styles.grid}>
            {symbolNames.map((name, index) => <Pressable key={index} accessibilityRole="button"
              accessibilityLabel={`${name} symbol`} disabled={paused}
              style={({ pressed }) => [styles.symbolButton, (pressed || paused) && styles.optionDim]}
              onPress={() => { HapticPatterns.buttonTap(); onChange(pickCrewMemory(progress, index)); }}>
              <SymbolTile kind={signalKind} symbol={index} size={52} />
              <Text style={styles.symbolName}>{name}</Text>
            </Pressable>)}
          </View>
          {progress.memoryPicks.length > 0 && option('Undo last tap', () => onChange(undoCrewMemory(progress)))}
        </View>
      ) : (
        <View>
          <Text style={styles.progress}>TURN 4 OF 4 · {turnLabel}</Text>
          <Text style={styles.heading}>{chapter.relay.routeTitle}</Text>
          <Text style={styles.body}>Your Navigator and Decoder solved {crewRelayScore(progress)} of 2 signals. The Captain chooses the ending for this crew.</Text>
          {([['alpha', chapter.relay.routeOptions[0]], ['omega', chapter.relay.routeOptions[1]]] as const).map(([value, label]) =>
            option(label, () => onChange(chooseCrewRoute(progress, value as CrewRoute)), value))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#83d5f9' },
  card: { margin: spacing.md, padding: spacing.md, borderRadius: borderRadius.xxl,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#d9f4ff', ...shadows.lg },
  hero: { height: 110, justifyContent: 'center', overflow: 'hidden',
    margin: -6, marginBottom: spacing.md, borderRadius: 16, paddingLeft: 14, backgroundColor: '#0875c9' },
  heroImage: { borderRadius: 16 },
  heroCopy: { width: '58%' },
  kicker: { color: '#c8efff', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1 },
  title: { color: '#fff', fontFamily: 'Shark', fontSize: 23, lineHeight: 27, marginTop: 5,
    textShadowColor: '#034471', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  turnTrack: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md,
    paddingHorizontal: 14 },
  turnDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff',
    backgroundColor: '#a7d5e9', alignItems: 'center', justifyContent: 'center' },
  turnDotActive: { backgroundColor: '#ffca30' },
  turnDotText: { color: '#376888', fontFamily: 'Knockout', fontSize: 18 },
  turnDotTextActive: { color: '#093d77' },
  story: { color: '#244d70', fontFamily: 'Knockout', fontSize: 15, lineHeight: 20, marginBottom: spacing.md },
  progress: { color: '#0875c9', fontFamily: 'Knockout', fontSize: 14, letterSpacing: 0.5, marginBottom: spacing.sm },
  heading: { color: '#093d77', fontFamily: 'Shark', fontSize: 20, marginBottom: spacing.sm },
  body: { color: '#244d70', fontFamily: 'Knockout', fontSize: 15, lineHeight: 21, marginBottom: spacing.md },
  option: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg, borderWidth: 2, borderColor: '#fff',
    backgroundColor: '#ffca30', marginBottom: spacing.sm, ...shadows.md },
  optionDim: { opacity: 0.55 },
  optionText: { color: '#093d77', fontFamily: 'Knockout', fontSize: 17, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  symbolRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: spacing.md },
  symbol: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
    borderWidth: 3, borderColor: BRAND.gold, borderRadius: 12 },
  symbolEmpty: { borderStyle: 'dashed', borderColor: '#8fc3e0', backgroundColor: '#eef9ff' },
  symbolButton: { width: '48%', minHeight: 92, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
    borderRadius: borderRadius.lg, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.cream, ...shadows.md },
  symbolName: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 15, marginTop: 2 },
  colorChip: { borderRadius: 12, borderWidth: 3, borderColor: BRAND.navy, overflow: 'hidden' },
  colorShine: { position: 'absolute', left: 5, top: 4, width: '45%', height: 7, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.6)' },
  result: { color: '#a86500', fontFamily: 'Knockout', fontSize: 19, marginBottom: spacing.md },
  paused: { color: '#a86500', fontFamily: 'Knockout', fontSize: 15, marginBottom: spacing.md },
});
