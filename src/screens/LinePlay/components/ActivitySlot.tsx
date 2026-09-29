/**
 * ActivitySlot — renders one item from the LinePlay activity playlist.
 *
 * A 'minigame' item launches a real GameKit round. trivia/lore/prediction items
 * render real (lightweight) interactive content sourced from the content
 * loaders. Everything is one-thumb and portrait.
 */

import { useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  spacing,
  borderRadius,
  shadows,
} from '../../../design-system';
import type { ActivityItem } from '../../../services/lineplay/LinePlaySession';
import {
  fetchRideLore,
  fetchRideTrivia,
  LoreCard,
  PredictionCard,
  TriviaQuestion,
} from '../../../services/lineplay/content';
import { SoundEffectContext } from '../../../context/SoundEffectProvider';
import HapticPatterns from '../../../helpers/hapticPatterns';

export interface ActivitySlotProps {
  readonly item: ActivityItem;
  readonly rideId?: number;
  readonly parkId?: number;
  readonly chapterId?: string;
  readonly completed?: boolean;
  readonly paused?: boolean;
  readonly savedPrediction?: 'beat' | 'miss' | null;
  readonly savedLoreChoice?: number | null;
  readonly currentQuestBonusStatus?: 'available' | 'pending' | 'verified' | null;
  /** Called when a minigame slot's "Play" is pressed. */
  readonly onPlayGame: (item: Extract<ActivityItem, { kind: 'minigame' }>) => void;
  /** Called when a prediction is locked in. */
  readonly onPredict: (card: PredictionCard, guess: 'beat' | 'miss') => void;
  readonly onChooseLore?: (id: string, choice: number) => void;
  readonly onActivityCompleted: (id: string) => void;
}

const GAME_LABELS: Record<string, string> = {
  tap: 'Whack-a-Shark',
  timing: 'Rhythm Tap',
  memory: 'Memory Match+',
  trivia: 'Ride Trivia',
  shark: 'Sharky Swim',
  banana: 'Banana Basket',
  current: 'Current Quest',
  showdown: 'Shark Showdown',
};

const GAME_PREVIEWS: Record<string, string> = {
  tap: 'Find the shark, avoid the decoy, and chase a quick combo.',
  timing: 'Tap in rhythm as the pattern speeds up.',
  memory: 'Match pairs before time runs out. Pass the phone for turns.',
  trivia: 'Answer a short round of park questions.',
  shark: 'Guide your shark through a fast swim challenge.',
  banana: 'Catch the good snacks and dodge the bad ones.',
  current: 'Guide your shark through three changing routes. Collect pearls and find the treasure.',
  showdown: 'Challenge Captain Fin to a three-question ride trivia duel. Play solo or take turns with your crew.',
};

function ActivityHero({ kicker, title, teacher = false }: { kicker: string; title: string; teacher?: boolean }) {
  return <View style={styles.hero}>
    <View style={styles.heroCopy}>
      <Text style={styles.heroKicker}>{kicker}</Text>
      <Text style={styles.heroTitle}>{title}</Text>
    </View>
    <Image source={teacher
      ? require('../../../../assets/images/tutorial/teacher-shark.png')
      : require('../../../../assets/images/screens/pin-collections/shark.png')}
      resizeMode="contain" style={styles.shark} accessibilityLabel="Theme Park Shark mascot" />
  </View>;
}

export default function ActivitySlot({
  item,
  rideId,
  parkId,
  chapterId,
  completed = false,
  paused = false,
  savedPrediction = null,
  savedLoreChoice = null,
  currentQuestBonusStatus = null,
  onPlayGame,
  onPredict,
  onChooseLore,
  onActivityCompleted,
}: ActivitySlotProps) {
  switch (item.kind) {
    case 'minigame':
      return <MiniGameSlot item={item} completed={completed} paused={paused}
        currentQuestBonusStatus={currentQuestBonusStatus} onPlayGame={onPlayGame} />;
    case 'trivia':
      return <TriviaSlot rideId={rideId} parkId={parkId} chapterId={chapterId} seed={item.seed} completed={completed} paused={paused} onAnswered={() => onActivityCompleted(item.id)} />;
    case 'lore':
      return <LoreSlot rideId={rideId} parkId={parkId} chapterId={chapterId} seed={item.seed}
        selectedClue={savedLoreChoice} completed={completed} paused={paused}
        onChoose={(choice) => onChooseLore?.(item.id, choice)}
        onCompleted={() => onActivityCompleted(item.id)} />;
    case 'prediction':
      return <PredictionSlot card={item.card} savedGuess={savedPrediction} paused={paused} onPredict={onPredict} onLocked={() => onActivityCompleted(item.id)} />;
    default:
      return null;
  }
}

// -- minigame launch card ----------------------------------------------------

function MiniGameSlot({
  item,
  completed,
  paused,
  currentQuestBonusStatus,
  onPlayGame,
}: {
  item: Extract<ActivityItem, { kind: 'minigame' }>;
  completed: boolean;
  paused: boolean;
  currentQuestBonusStatus: 'available' | 'pending' | 'verified' | null;
  onPlayGame: (item: Extract<ActivityItem, { kind: 'minigame' }>) => void;
}) {
  const isStarChart = item.id.endsWith('-star-chart');
  const label = item.title ?? (isStarChart ? 'Rebuild the Star Chart' : GAME_LABELS[item.gameId] ?? item.gameId);
  return (
    <View style={styles.card}>
      <ActivityHero kicker="QUEUE ARCADE" title={label} />
      <View style={styles.gamePlaceholder}>
        <Text style={styles.gamePlaceholderText}>
          {item.preview ?? (isStarChart
            ? 'Match space symbols to restore your shark’s missing chart. Take turns with your crew or race solo.'
            : GAME_PREVIEWS[item.gameId] ?? 'Play a quick round while you wait.')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={paused}
        onPress={() => onPlayGame(item)}
        style={({ pressed }) => [styles.primaryBtn, paused && styles.disabled, pressed && styles.pressed]}
      >
        <Text style={styles.primaryBtnText}>{completed && item.gameId === 'showdown'
          ? 'Rematch' : completed ? 'Play again' : 'Play'}</Text>
      </Pressable>
      {item.gameId === 'current' && currentQuestBonusStatus && (
        <Text style={styles.note}>
          {currentQuestBonusStatus === 'verified'
            ? 'Route verified · bonus Part can settle with an eligible wait.'
            : currentQuestBonusStatus === 'pending'
              ? 'Route played · verification pending. No bonus counted yet.'
              : 'Complete once for a possible bonus Part after 10 eligible minutes.'}
        </Text>
      )}
    </View>
  );
}

// -- trivia ------------------------------------------------------------------

function TriviaSlot({
  rideId,
  parkId,
  chapterId,
  seed,
  completed,
  paused,
  onAnswered,
}: {
  rideId?: number;
  parkId?: number;
  chapterId?: string;
  seed: number;
  completed: boolean;
  paused: boolean;
  onAnswered: () => void;
}) {
  const [q, setQ] = useState<TriviaQuestion | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const answerReveal = useRef(new Animated.Value(0)).current;
  const { playSound } = useContext(SoundEffectContext);

  useEffect(() => {
    let alive = true;
    setQ(null);
    setPicked(null);
    answerReveal.setValue(0);
    fetchRideTrivia(rideId, parkId, seed, chapterId).then((res) => {
      if (alive) setQ(res);
    });
    return () => {
      alive = false;
      answerReveal.stopAnimation();
    };
  }, [rideId, parkId, chapterId, seed, answerReveal]);

  const answer = (index: number) => {
    if (!q || picked != null || completed || paused) return;
    const correct = index === q.correctIndex;
    setPicked(index);
    onAnswered();
    if (correct) HapticPatterns.success();
    else HapticPatterns.selection();
    void playSound?.(correct
      ? require('../../../../assets/sounds/success.mp3')
      : require('../../../../assets/sounds/tap.mp3'));
    void AccessibilityInfo.announceForAccessibility(correct
      ? 'Correct answer.' : `Good try. The answer is ${q.choices[q.correctIndex]}.`);
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (reduced) {
        answerReveal.setValue(1);
      } else {
        Animated.timing(answerReveal, { toValue: 1, duration: 220,
          useNativeDriver: true }).start();
      }
    }).catch(() => answerReveal.setValue(1));
  };

  if (!q) return <SkeletonCard label="TRIVIA" />;
  const revealed = picked != null || completed;

  return (
    <ScrollView style={styles.cardScroll} contentContainerStyle={styles.card}>
      <ActivityHero kicker={chapterId ? 'RIDE MISSION' : 'PARK CHALLENGE'} title="Shark Trivia" teacher />
      <Text style={styles.question}>{q.question}</Text>
      {picked != null && <Animated.Text style={[styles.answerFeedback,
        picked === q.correctIndex ? styles.feedbackCorrect : styles.feedbackWrong, {
          opacity: answerReveal,
          transform: [{ translateY: answerReveal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        }]}>{picked === q.correctIndex
          ? '✓  Correct! Your crew found the answer.'
          : `The answer is ${q.choices[q.correctIndex]}. Your next clue awaits.`}</Animated.Text>}
      <View style={styles.choices}>
        {q.choices.map((choice, i) => {
          const isPicked = picked === i;
          const isCorrect = i === q.correctIndex;
          const state =
            revealed && isCorrect
              ? 'correct'
              : revealed && isPicked && !isCorrect
                ? 'wrong'
                : 'default';
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityState={{ disabled: revealed || paused }}
              disabled={revealed || paused}
              onPress={() => answer(i)}
              style={({ pressed }) => [
                styles.choice,
                paused && styles.disabled,
                state === 'correct' && styles.choiceCorrect,
                state === 'wrong' && styles.choiceWrong,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.choiceText}>{choice}</Text>
            </Pressable>
          );
        })}
      </View>
      {revealed && q.fact && (
        <View style={styles.factBox}>
          <Text style={styles.factKicker}>{picked == null ? 'THE ANSWER' : picked === q.correctIndex ? 'CORRECT · FAN FACT' : 'FAN FACT'}</Text>
          <Text style={styles.factText}>{q.fact}</Text>
          {q.source && <Text style={styles.factSource}>Source: {q.source}</Text>}
        </View>
      )}
      {completed && picked == null ? <Text style={styles.note}>Answered earlier in this session</Text> : null}
    </ScrollView>
  );
}

// -- lore --------------------------------------------------------------------

function LoreSlot({
  rideId,
  parkId,
  chapterId,
  seed,
  selectedClue,
  completed,
  paused,
  onChoose,
  onCompleted,
}: {
  rideId?: number;
  parkId?: number;
  chapterId?: string;
  seed: number;
  selectedClue: number | null;
  completed: boolean;
  paused: boolean;
  onChoose: (choice: number) => void;
  onCompleted: () => void;
}) {
  const [lore, setLore] = useState<LoreCard | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRideLore(rideId, parkId, seed, chapterId).then((res) => {
      if (alive) setLore(res);
    });
    return () => {
      alive = false;
    };
  }, [rideId, parkId, chapterId, seed]);

  if (!lore) return <SkeletonCard label="QUEUE PROMPT" />;

  return (
    <ScrollView style={styles.cardScroll} contentContainerStyle={styles.card}>
      <ActivityHero kicker="QUEUE QUEST" title="Field Note" />
      <Text style={styles.loreTitle}>{lore.title}</Text>
      <Text style={styles.loreBody}>{lore.body}</Text>
      {lore.source ? <Text style={styles.loreSource}>— {lore.source}</Text> : null}
      {lore.challenge && !completed && selectedClue == null && (
        <View style={styles.clueChallenge}>
          <Text style={styles.cluePrompt}>{lore.challenge.prompt}</Text>
          {lore.challenge.options.map((option, index) => (
            <Pressable key={`${lore.id}-${index}`} accessibilityRole="button"
              disabled={paused} onPress={() => onChoose(index)}
              style={[styles.choice, styles.clueChoice, paused && styles.disabled]}>
              <Text style={styles.choiceText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {lore.challenge && selectedClue != null && (
        <View style={styles.clueChallenge}>
          <Text style={styles.cluePrompt}>{lore.challenge.options[selectedClue]?.label}</Text>
          <Text style={styles.loreBody}>{lore.challenge.options[selectedClue]?.task}</Text>
          <Text style={styles.clueFinish}>{lore.challenge.finish}</Text>
          {!completed && <>
            <Pressable accessibilityRole="button" disabled={paused} onPress={onCompleted}
              style={[styles.primaryBtn, paused && styles.disabled]}>
              <Text style={styles.primaryBtnText}>Clue found</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={paused} onPress={() => onChoose(-1)}
              style={[styles.clueBack, paused && styles.disabled]}>
              <Text style={styles.clueBackText}>Choose another clue</Text>
            </Pressable>
          </>}
        </View>
      )}
      {(!lore.challenge || completed) && (
        <Pressable accessibilityRole="button"
          disabled={completed || paused} onPress={onCompleted}
          style={[styles.primaryBtn, (completed || paused) && styles.disabled]}>
          <Text style={styles.primaryBtnText}>{completed ? 'Clue logged' : 'Clue explored'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// -- prediction --------------------------------------------------------------

function PredictionSlot({
  card,
  savedGuess,
  paused,
  onPredict,
  onLocked,
}: {
  card: PredictionCard;
  savedGuess: 'beat' | 'miss' | null;
  paused: boolean;
  onPredict: (card: PredictionCard, guess: 'beat' | 'miss') => void;
  onLocked: () => void;
}) {
  const [guess, setGuess] = useState<'beat' | 'miss' | null>(null);
  const lockedGuess = savedGuess ?? guess;

  const lockIn = (g: 'beat' | 'miss') => {
    if (lockedGuess) return;
    setGuess(g);
    onPredict(card, g);
    onLocked();
  };

  return (
    <View style={styles.card}>
      <ActivityHero kicker="MAKE YOUR CALL" title="Wait Prediction" />
      <Text style={styles.question}>{card.prompt}</Text>
      <View style={styles.predictRow}>
        <Pressable
          accessibilityRole="button"
          disabled={!!lockedGuess || paused}
          onPress={() => lockIn('beat')}
          style={({ pressed }) => [
            styles.predictBtn,
            paused && styles.disabled,
            lockedGuess === 'beat' && styles.predictBtnActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.predictBtnText}>Beat it 🏁</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!!lockedGuess || paused}
          onPress={() => lockIn('miss')}
          style={({ pressed }) => [
            styles.predictBtn,
            paused && styles.disabled,
            lockedGuess === 'miss' && styles.predictBtnActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.predictBtnText}>Miss it 🐌</Text>
        </Pressable>
      </View>
      {lockedGuess ? (
        <Text style={styles.predictHint}>Locked in. Resolves when your session ends.</Text>
      ) : null}
    </View>
  );
}

// -- skeleton ----------------------------------------------------------------

function SkeletonCard({ label }: { label: string }) {
  return (
    <View style={[styles.card, styles.skeleton]}>
      <ActivityHero kicker="LOADING THE NEXT ROUND" title={label} />
      <ActivityIndicator color="#0875c9" style={{ marginTop: spacing.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  cardScroll: { flex: 1 },
  card: {
    backgroundColor: '#d9f4ff',
    borderRadius: borderRadius.xxl,
    borderWidth: 3,
    borderColor: '#fff',
    padding: spacing.md,
    ...shadows.lg,
    minHeight: 220,
  },
  skeleton: {
    justifyContent: 'flex-start',
  },
  hero: { height: 110, flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    margin: -6, marginBottom: spacing.md, borderRadius: 16, paddingLeft: 14, backgroundColor: '#0875c9' },
  heroCopy: { flex: 1, zIndex: 1 },
  shark: { width: 110, height: 110, marginRight: -7 },
  heroKicker: { color: '#c8efff', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1 },
  heroTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 22, lineHeight: 27, marginTop: 5,
    textShadowColor: '#034471', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  gamePlaceholder: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#b9e8fc',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
    padding: spacing.md,
  },
  gamePlaceholderText: {
    color: '#244d70',
    fontFamily: 'Knockout', fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  question: {
    color: '#093d77',
    fontFamily: 'Shark',
    fontSize: 20,
    marginTop: spacing.sm,
    lineHeight: 27,
  },
  choices: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  choice: {
    backgroundColor: '#ffca30',
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: '#fff',
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadows.md,
  },
  choiceCorrect: {
    backgroundColor: '#9de4a9',
    borderColor: '#299246',
  },
  choiceWrong: {
    backgroundColor: '#ffb7a8',
    borderColor: '#bf563e',
  },
  choiceText: {
    color: '#093d77',
    fontFamily: 'Knockout',
    fontSize: 17,
    textAlign: 'center',
  },
  answerFeedback: { color: '#093d77', fontFamily: 'Knockout', fontSize: 15,
    lineHeight: 19, marginTop: spacing.sm, paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 11, borderWidth: 2 },
  feedbackCorrect: { backgroundColor: '#d9f4cb', borderColor: '#389759' },
  feedbackWrong: { backgroundColor: '#fff1cf', borderColor: '#d59827' },
  factBox: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: '#ffca30',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  factKicker: { color: '#0875c9', fontFamily: 'Knockout', fontSize: 14, letterSpacing: 0.8 },
  factText: { color: '#244d70', fontFamily: 'Knockout', fontSize: 14, lineHeight: 21, marginTop: spacing.xs },
  factSource: { color: '#376888', fontFamily: 'Knockout', fontSize: 11, marginTop: spacing.sm },
  loreTitle: {
    color: '#093d77',
    fontFamily: 'Shark',
    fontSize: 20,
    marginTop: spacing.sm,
  },
  loreBody: {
    color: '#244d70',
    fontFamily: 'Knockout', fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.md,
  },
  loreSource: {
    color: '#376888',
    fontFamily: 'Knockout', fontSize: 12,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  clueChallenge: { marginTop: spacing.lg },
  cluePrompt: { color: '#093d77', fontFamily: 'Knockout', fontSize: 17, marginBottom: spacing.sm },
  clueChoice: { marginTop: spacing.sm },
  clueFinish: { color: '#244d70', fontFamily: 'Knockout', fontSize: 13, lineHeight: 19,
    marginTop: spacing.md, marginBottom: spacing.lg },
  clueBack: { alignItems: 'center', paddingVertical: spacing.md },
  clueBackText: { color: '#0875c9', fontFamily: 'Knockout', fontSize: 15 },
  predictRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  predictBtn: {
    flex: 1,
    backgroundColor: '#ffca30',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    ...shadows.md,
  },
  predictBtnActive: {
    borderColor: '#0875c9',
    backgroundColor: '#b9e8fc',
  },
  predictBtnText: {
    color: '#093d77',
    fontFamily: 'Knockout',
    fontSize: 17,
  },
  predictHint: {
    color: '#244d70',
    fontFamily: 'Knockout', fontSize: 12,
    marginTop: spacing.md,
  },
  primaryBtn: {
    backgroundColor: '#ffca30',
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: '#fff',
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.md,
  },
  primaryBtnText: {
    color: '#093d77',
    fontFamily: 'Knockout',
    fontSize: 17,
  },
  note: { color: '#376888', fontFamily: 'Knockout', fontSize: 12, marginTop: spacing.md },
  disabled: { opacity: 0.45 },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
