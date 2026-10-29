/**
 * ActivitySlot: renders one item from the LinePlay activity playlist.
 *
 * A 'minigame' item launches a real GameKit round. trivia/lore/prediction items
 * render real (lightweight) interactive content sourced from the content
 * loaders. Everything is one-thumb and portrait.
 */

import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { studioMoment } from '../../../gamekit/audio/playMoment';
import HapticPatterns from '../../../helpers/hapticPatterns';
import NavigationPanelCard from './NavigationPanelCard';
import PageScroll, { PageHeightContext } from './PageScroll';
import { heroSlim, quizCompact } from '../../../services/lineplay/lineLayout';
import type { NavigationPanelProgress } from '../../../services/lineplay/navigationPanel';
import type { CircuitTheme } from '../../../services/lineplay/circuitTheme';
import { factSourceLine } from '../../../services/lineplay/labels';
import { BRAND, GameButton, GameIcon, SharkLoader } from '../../../ui';
import { SPACE_NAVIGATOR_ART } from '../spaceNavigatorArt';

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
  readonly navigationPanel?: boolean;
  readonly navigationProgress?: NavigationPanelProgress;
  readonly onNavigationTurn?: (index: number) => void;
  readonly onNavigationReplay?: () => void;
  readonly onNavigationNext?: () => void;
  /** Details is open: a page too short for the whole board offers a PLAY strip, which closes Details (and resumes a paused game). */
  readonly onNavigationMakeRoom?: () => void;
  /** The chapter's name for its board mission ("Fix the signal"), so PLAY NOW, the rail and the board say one phrase. */
  readonly navigationTitle?: string;
  /** A chapter clue page's own mission name (clues 1 to 3), so PLAY, the bubble, the rail and the page say one name. */
  readonly missionTitle?: string;
  /** The board page's height once the crew row lends its room (an iPhone SE), so the board starts at its final size. */
  readonly navigationTargetHeight?: number;
  /** Ride-themed dressing for free-play circuit rounds. */
  readonly circuitTheme?: CircuitTheme;
  /** Name of the page after this one, for a circuit's next button. */
  readonly nextLabel?: string;
  /** Best stars earned in this game during the wait, or undefined when never played. */
  readonly bestStars?: number;
  /** A queue game this account has never played (the arcade's NEW rule). */
  readonly newGame?: boolean;
}

const GAME_LABELS: Record<string, string> = {
  tap: 'Whack-a-Shark',
  timing: 'Parade Beat',
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
  memory: 'Match pairs before time runs out. Your crew can call out the pairs.',
  trivia: 'Answer a short round of park questions.',
  shark: 'Guide your shark through a fast swim challenge.',
  banana: 'Catch the good snacks and dodge the bad ones.',
  current: 'Guide your shark through three changing routes. Collect pearls and find the treasure.',
  showdown: 'Challenge Captain Gill to a three-question ride trivia duel. Play solo or take turns with your crew.',
};

function ActivityHero({ kicker, title, teacher = false, navigator = false }: { kicker: string; title: string; teacher?: boolean; navigator?: boolean }) {
  const [artFailed, setArtFailed] = useState(false);
  // A short window (iPhone SE): one slim row with the name and a small shark, so what to do shows below it.
  const slim = heroSlim(useContext(PageHeightContext));
  return <View style={[styles.hero, slim && styles.heroSlim]}>
    <View style={styles.heroCopy}>
      {!slim && <Text style={styles.heroKicker}>{kicker}</Text>}
      <Text style={[styles.heroTitle, slim && styles.heroTitleSlim]} numberOfLines={slim ? 1 : undefined}
        adjustsFontSizeToFit={slim} minimumFontScale={0.85}>{title}</Text>
    </View>
    <Image source={navigator && !artFailed ? SPACE_NAVIGATOR_ART : teacher
      ? require('../../../../assets/images/tutorial/teacher-shark.png')
      : require('../../../../assets/images/screens/pin-collections/shark.png')}
      resizeMode="contain" onError={() => setArtFailed(true)} style={[styles.shark, slim && styles.sharkSlim]}
      accessibilityLabel={navigator ? 'Your shark navigator' : 'Theme Park Shark mascot'} />
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
  navigationPanel = false,
  navigationProgress,
  onNavigationTurn,
  onNavigationReplay,
  onNavigationNext,
  onNavigationMakeRoom,
  navigationTitle,
  missionTitle,
  navigationTargetHeight,
  circuitTheme,
  nextLabel,
  bestStars,
  newGame,
}: ActivitySlotProps) {
  switch (item.kind) {
    case 'minigame':
      return <MiniGameSlot title={missionTitle} item={item} navigator={navigationPanel && item.id === `${chapterId}-star-chart`} completed={completed} paused={paused}
        currentQuestBonusStatus={currentQuestBonusStatus} bestStars={bestStars} newGame={newGame} onPlayGame={onPlayGame} />;
    case 'circuit':
      if (!onNavigationTurn || !onNavigationReplay || !onNavigationNext) return null;
      return <NavigationPanelCard mode="free" theme={circuitTheme} nextLabel={nextLabel} seed={item.seed}
        targetHeight={navigationTargetHeight}
        progress={navigationProgress} completed={completed} paused={paused}
        onTurn={onNavigationTurn} onNewRound={onNavigationReplay} onNext={onNavigationNext} onMakeRoom={onNavigationMakeRoom} />;
    case 'trivia':
      if (navigationPanel && item.id === `${chapterId}-trivia` && onNavigationTurn && onNavigationReplay && onNavigationNext)
        return <NavigationPanelCard seed={item.seed} title={navigationTitle} targetHeight={navigationTargetHeight}
          progress={navigationProgress} completed={completed} paused={paused}
          onTurn={onNavigationTurn} onNewRound={onNavigationReplay} onNext={onNavigationNext} onMakeRoom={onNavigationMakeRoom} />;
      return <TriviaSlot title={missionTitle} rideId={rideId} parkId={parkId} chapterId={chapterId} seed={item.seed} completed={completed} paused={paused} onAnswered={() => onActivityCompleted(item.id)} />;
    case 'lore':
      return <LoreSlot title={missionTitle} navigator={navigationPanel && item.id === `${chapterId}-field-note`} rideId={rideId} parkId={parkId} chapterId={chapterId} seed={item.seed}
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

/**
 * The game page's PLAY, right under the banner. Inside the page window (it reads the window's height), so a
 * short window (iPhone SE) gets a compact PLAY under the slim banner and all of it sits above the fade.
 */
function PlayFirst({ label, icon, paused, onPress, accessibilityLabel, newTag }: {
  label: string; icon: 'play' | 'retry'; paused: boolean; onPress: () => void; accessibilityLabel: string; newTag: boolean;
}) {
  const short = heroSlim(useContext(PageHeightContext));
  return <View testID="lineplay-play" style={[styles.playFirst, short && styles.playFirstShort]}>
    <View>
      <GameButton label={label} icon={icon} disabled={paused} fullWidth={!short} size={short ? 'compact' : 'regular'}
        onPress={onPress} accessibilityLabel={accessibilityLabel} />
      {newTag && <View pointerEvents="none" style={[styles.newPill, styles.newCorner]}>
        <Text style={styles.newPillText}>NEW</Text></View>}
    </View>
  </View>;
}

function MiniGameSlot({
  item,
  navigator,
  completed,
  paused,
  currentQuestBonusStatus,
  bestStars,
  newGame = false,
  onPlayGame,
  title,
}: {
  item: Extract<ActivityItem, { kind: 'minigame' }>;
  navigator: boolean;
  /** The chapter's clue 3 mission name, so the page says what its bubble and PLAY say. */
  title?: string;
  completed: boolean;
  paused: boolean;
  currentQuestBonusStatus: 'available' | 'pending' | 'verified' | null;
  bestStars?: number;
  newGame?: boolean;
  onPlayGame: (item: Extract<ActivityItem, { kind: 'minigame' }>) => void;
}) {
  const isStarChart = item.id.endsWith('-star-chart');
  const label = title ?? item.title ?? (isStarChart ? 'Rebuild the Star Chart' : GAME_LABELS[item.gameId] ?? item.gameId);
  // A story clue (its mission name came in) says STORY; every free round says GAMES (the two LinePlay tabs).
  const kicker = title != null || isStarChart ? 'STORY' : 'GAMES';
  const playLabel = completed && item.gameId === 'showdown' ? 'Rematch' : completed ? 'Play again' : 'Play';
  return (
    <PageScroll fill={CARD_FILL}>
      {/* PLAY comes right under the banner on every phone, so the one thing to press is on the first screen
          of the page (never below the fold or behind the rail on a 375 or 402 pt phone). What the game is
          and the best stars follow it. */}
      <ActivityHero kicker={kicker} title={label} navigator={navigator} />
      <PlayFirst label={playLabel} icon={completed ? 'retry' : 'play'} paused={paused} onPress={() => onPlayGame(item)}
        accessibilityLabel={`${playLabel}: ${label}${newGame && bestStars == null && !completed ? '. New game' : ''}`}
        newTag={newGame && bestStars == null && !completed} />
      {bestStars != null && <View style={styles.bestRow} accessible
        accessibilityLabel={`Best this wait: ${bestStars} of 3 stars`}>
        {[1, 2, 3].map(slot => <GameIcon key={slot} name="star" size={24}
          mono={slot <= bestStars ? undefined : '#b7cfe2'} />)}
        <Text style={styles.bestLabel}>Your best this wait</Text>
      </View>}
      <View style={styles.gamePlaceholder}>
        <Text style={styles.gamePlaceholderText}>
          {item.preview ?? (isStarChart
            ? 'Match space symbols to restore your shark’s missing chart. Race solo or let your crew call out the pairs.'
            : GAME_PREVIEWS[item.gameId] ?? 'Play a quick round while you wait.')}
        </Text>
      </View>
      {item.gameId === 'current' && currentQuestBonusStatus && (
        <Text style={styles.note}>
          {currentQuestBonusStatus === 'verified'
            ? 'Quest done! Your bonus Part counts once you have 10 minutes in line.'
            : currentQuestBonusStatus === 'pending'
              ? 'Quest played. We are still checking it. No bonus yet.'
              : 'Finish this once. You can get a bonus Part after 10 minutes in line.'}
        </Text>
      )}
    </PageScroll>
  );
}

// -- trivia ------------------------------------------------------------------

function TriviaSlot({
  title,
  rideId,
  parkId,
  chapterId,
  seed,
  completed,
  paused,
  onAnswered,
}: {
  title?: string;
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
    if (!(correct ? studioMoment('game.correct') : studioMoment('game.nearMiss', { volume: 0.7 }))) {
      void playSound?.(correct
        ? require('../../../../assets/sounds/success.mp3')
        : require('../../../../assets/sounds/tap.mp3'));
    }
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
    <PageScroll fill={CARD_FILL}>
      {/* A page window too short for the banner, the question and four stacked answers (every phone in a wait,
          SE and 17 Pro alike): no banner (the Story tab and the PLAY the guest just pressed say what this is),
          and the answers sit two by two under a smaller question, so every choice shows without scrolling. */}
      <WhenQuizCompact>{short => <>
      {!short && <ActivityHero kicker={title != null ? 'STORY' : 'GAMES'} title={title ?? 'Shark Trivia'} teacher />}
      <Text style={[styles.question, short && styles.questionShort]}>{q.question}</Text>
      {picked != null && <Animated.Text style={[styles.answerFeedback,
        picked === q.correctIndex ? styles.feedbackCorrect : styles.feedbackWrong, {
          opacity: answerReveal,
          transform: [{ translateY: answerReveal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        }]}>{picked === q.correctIndex
          ? 'Correct! Your crew found the answer.'
          : `The answer is ${q.choices[q.correctIndex]}. Pick your next clue.`}</Animated.Text>}
      <View style={[styles.choices, short && styles.choicesGrid]}>
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
                short && styles.choiceShort,
                paused && styles.disabled,
                state === 'correct' && styles.choiceCorrect,
                state === 'wrong' && styles.choiceWrong,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.choiceText, short && styles.choiceTextShort]}
                numberOfLines={short ? 2 : undefined} adjustsFontSizeToFit={short} minimumFontScale={0.8}>{choice}</Text>
            </Pressable>
          );
        })}
      </View>
      </>}</WhenQuizCompact>
      {revealed && q.fact && (
        <View style={styles.factBox}>
          <Text style={styles.factKicker}>{picked == null ? 'THE ANSWER' : picked === q.correctIndex ? 'CORRECT · FAN FACT' : 'FAN FACT'}</Text>
          <Text style={styles.factText}>{q.fact}</Text>
          {factSourceLine(q.source) && <Text style={styles.factSource}>{factSourceLine(q.source)}</Text>}
        </View>
      )}
      {completed && picked == null ? <Text style={styles.note}>You already answered this one</Text> : null}
    </PageScroll>
  );
}

// -- lore --------------------------------------------------------------------

/**
 * A page's first screen: on a short window (iPhone SE) what to do (the prompt and its first choice) comes right
 * under the slim banner, before the story, so a non-reader sees an action without scrolling. Taller windows
 * keep the story first.
 */
type Slot = ReactNode | ((short: boolean) => ReactNode);
/** Reads the page window inside PageScroll: is it too short for a full clue page (quizCompact)? */
function WhenQuizCompact({ children }: { children: (compact: boolean) => ReactNode }) {
  return <>{children(quizCompact(useContext(PageHeightContext)))}</>;
}
/** Reads the page window inside PageScroll: is this a short window (iPhone SE)? */
function WhenShort({ children }: { children: (short: boolean) => ReactNode }) {
  return <>{children(heroSlim(useContext(PageHeightContext)))}</>;
}
function ActionFirstWhenShort({ hero, story, action }: { hero: ReactNode; story: Slot; action: Slot }) {
  const short = heroSlim(useContext(PageHeightContext));
  const s = typeof story === 'function' ? story(short) : story;
  const a = typeof action === 'function' ? action(short) : action;
  return <>{hero}{short ? <><View style={styles.actionFirst}>{a}</View>{s}</> : <>{s}{a}</>}</>;
}

function LoreSlot({
  title,
  navigator,
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
  title?: string;
  navigator: boolean;
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

  if (!lore) return <SkeletonCard label="Story clue" />;

  return (
    <PageScroll fill={CARD_FILL}>
      <ActionFirstWhenShort
        hero={<ActivityHero kicker={title != null || navigator ? 'STORY' : 'GAMES'} title={title ?? (navigator ? 'Spot the clue' : 'Field Note')} navigator={navigator} />}
        story={<>
          <Text style={styles.loreTitle}>{lore.title}</Text>
          <Text style={styles.loreBody}>{lore.body}</Text>
          {factSourceLine(lore.source) ? <Text style={styles.loreSource}>{factSourceLine(lore.source)}</Text> : null}
        </>}
        action={short => <>
          {lore.challenge && !completed && selectedClue == null && (
            <View style={[styles.clueChallenge, short && styles.clueChallengeShort]}>
              <Text style={[styles.cluePrompt, short && styles.cluePromptShort]}>{lore.challenge.prompt}</Text>
              {/* A slim page (iPhone SE): the choices sit side by side, so every one is in view at once. */}
              <View style={short && styles.clueRow}>
                {lore.challenge.options.map((option, index) => (
                  <Pressable key={`${lore.id}-${index}`} accessibilityRole="button" accessibilityLabel={option.label}
                    disabled={paused} onPress={() => onChoose(index)}
                    style={[styles.choice, short ? styles.clueChoiceSide : styles.clueChoice, paused && styles.disabled]}>
                    <Text style={[styles.choiceText, short && styles.choiceTextSide]} numberOfLines={2}
                      adjustsFontSizeToFit={short} minimumFontScale={0.85}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
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
        </>} />
    </PageScroll>
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
    <PageScroll fill={CARD_FILL}>
      <ActivityHero kicker="MAKE YOUR GUESS" title="Wait Guess" />
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
          <Text style={styles.predictBtnText}>Beat it</Text>
          <Text style={styles.predictBtnHint}>faster than posted</Text>
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
          <Text style={styles.predictBtnText}>Miss it</Text>
          <Text style={styles.predictBtnHint}>slower than posted</Text>
        </Pressable>
      </View>
      {lockedGuess ? (
        <Text style={styles.predictHint}>Locked in. You find out when your wait ends.</Text>
      ) : null}
    </PageScroll>
  );
}

// -- skeleton ----------------------------------------------------------------

function SkeletonCard({ label }: { label: string }) {
  return (
    <PageScroll fill={CARD_FILL}>
      <ActivityHero kicker="LOADING THE NEXT ROUND" title={label} />
      <SharkLoader compact message="Dealing your next round" />
    </PageScroll>
  );
}

/** Every activity card's light frame (PageScroll fades into exactly this color above the rail). */
const CARD_FILL = '#d9f4ff';

const styles = StyleSheet.create({
  hero: { height: 110, flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    margin: -6, marginBottom: spacing.md, borderRadius: 16, paddingLeft: 14, backgroundColor: '#0875c9' },
  heroCopy: { flex: 1, zIndex: 1 },
  shark: { width: 110, height: 110, marginRight: -7 },
  heroSlim: { height: 46, marginBottom: spacing.sm },
  actionFirst: { marginBottom: spacing.md },
  playFirst: { marginBottom: spacing.sm },
  playFirstShort: { alignItems: 'center', marginTop: -2 },
  heroTitleSlim: { fontSize: 19, lineHeight: 23, marginTop: 2 },
  sharkSlim: { width: 52, height: 52, marginRight: -2 },
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
  questionShort: { fontSize: 17, lineHeight: 22, marginTop: 0 },
  choicesGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm, gap: 6 },
  choiceShort: { width: '48.5%', minHeight: 44, paddingVertical: 4, paddingHorizontal: 6 },
  choiceTextShort: { fontSize: 15 },
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
  clueChallengeShort: { marginTop: 0 },
  cluePromptShort: { fontSize: 16, marginBottom: 6 },
  clueRow: { flexDirection: 'row', gap: 6 },
  clueChoiceSide: { flex: 1, minHeight: 52, paddingHorizontal: 6, paddingVertical: 4 },
  choiceTextSide: { fontSize: 15, lineHeight: 17 },
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
  bestRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: -2 },
  bestLabel: { color: BRAND.navySoft, fontFamily: 'Knockout', fontSize: 14, marginLeft: 6 },
  newPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: BRAND.gold,
    borderWidth: 2, borderColor: BRAND.navy },
  newPillText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 14 },
  // NEW on PLAY's top-right corner (slim page).
  newCorner: { position: 'absolute', top: -8, right: -4 },
  predictBtnHint: { color: BRAND.navySoft, fontFamily: 'Knockout', fontSize: 13, marginTop: 2 },
  disabled: { opacity: 0.45 },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
