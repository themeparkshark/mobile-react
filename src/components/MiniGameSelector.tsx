import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Alert } from 'react-native';
import TapChallengeMiniGame from './TapChallengeMiniGame';
import TimingMiniGame from './TimingMiniGame';
import MemoryMatchMiniGame from './MemoryMatchMiniGame';
import TriviaMiniGame from './TriviaMiniGame';
import SharkMiniGame from './SharkMiniGame';
// Queue Kit natives (2026-07-06 Wave 3): GameKit-based rebuilds. Legacy
// components above stay importable so USE_QUEUE_KIT_GAMES=false is a
// one-line rollback to the old games.
import { WhackAShark } from '../games/whack';
import { RhythmTapGame } from '../games/rhythm';
import { MemoryGame } from '../games/memory';
import { TriviaGame, createLinePlayTriviaSource } from '../games/trivia';
import { SharkySwim } from '../games/sharky';
import { BananaBasketGame } from '../games/banana-basket';
import { TaskAttemptGame, TaskGameProof } from '../api/endpoints/me/task-attempts';
import { getLinePlayChapter } from '../services/lineplay/chapters';

const USE_QUEUE_KIT_GAMES = true;

type MiniGameType = 'tap' | 'timing' | 'memory' | 'trivia' | 'shark' | 'banana';

interface Props {
  visible: boolean;
  taskId: number;
  taskName: string;
  coinImageUrl?: string;
  preferredGame?: MiniGameType;
  attemptSeed?: number;
  rewardMode?: 'legacy' | 'task-attempt';
  isPractice?: boolean;
  parkId?: number;
  excludeGames?: MiniGameType[];
  onClose: () => void;
  onComplete: (multiplier: number, rewards: { coins: number; xp: number }, proof?: TaskGameProof) => void;
}

// Paid ride attempts use the short GameKit formats; LinePlay keeps its longer
// rounds. The game shell reports a win only after at least one star.

export default function MiniGameSelector({
  visible,
  taskId,
  taskName,
  coinImageUrl,
  preferredGame,
  attemptSeed,
  rewardMode = 'legacy',
  isPractice = false,
  parkId,
  excludeGames = [],
  onClose,
  onComplete,
}: Props) {
  const [selectedGame, setSelectedGame] = useState<MiniGameType | null>(null);
  const gameMountedAt = useRef(0);
  const exitPromptOpen = useRef(false);

  const handleQuit = useCallback((resume: () => void) => {
    if (isPractice || rewardMode !== 'task-attempt') {
      onClose();
      return;
    }
    if (exitPromptOpen.current) return;
    exitPromptOpen.current = true;
    Alert.alert(
      'End ride challenge?',
      'Ending now counts as a loss. Your Ticket may be spent.',
      [
        { text: 'Keep playing', style: 'cancel', onPress: () => {
          exitPromptOpen.current = false;
          resume();
        } },
        { text: 'End challenge', style: 'destructive', onPress: () => {
          exitPromptOpen.current = false;
          onClose();
        } },
      ],
      { cancelable: false },
    );
  }, [isPractice, rewardMode, onClose]);

  useEffect(() => {
    if (visible && selectedGame) gameMountedAt.current = Date.now();
  }, [visible, selectedGame]);

  useEffect(() => {
    console.log('🎮 MiniGameSelector useEffect:', { visible, preferredGame, selectedGame });
    if (!visible) {
      setSelectedGame(null);
      return;
    }

    if (preferredGame && !excludeGames.includes(preferredGame)) {
      console.log('🎮 Setting game to preferredGame:', preferredGame);
      setSelectedGame(preferredGame);
      return;
    }

    const allGames: MiniGameType[] = rewardMode === 'task-attempt'
      ? ['tap', 'timing', 'memory', 'trivia']
      : USE_QUEUE_KIT_GAMES
        ? ['tap', 'timing', 'memory', 'trivia', 'shark', 'banana']
        : ['tap', 'timing', 'memory', 'trivia', 'shark'];
    const available = allGames.filter(g => !excludeGames.includes(g));
    if (available.length === 0) {
      setSelectedGame('trivia');
      return;
    }

    setSelectedGame(available[Math.floor(Math.random() * available.length)]);
  }, [visible, preferredGame, rewardMode]);

  const handleComplete = useCallback((multiplier: number, extra: any) => {
    const rewards = rewardMode === 'task-attempt'
      ? { coins: 0, xp: 0 } // Only the attempt response may award these.
      : { coins: Math.round(10 * multiplier), xp: Math.round(25 * multiplier) };
    const proof: TaskGameProof | undefined = rewardMode === 'task-attempt' && selectedGame
      ? {
          game: selectedGame as TaskAttemptGame,
          score: Number.isFinite(extra?.score) ? Math.floor(extra.score) : 0,
          elapsed_ms: Math.max(0, Date.now() - gameMountedAt.current),
          seed: Number.isInteger(attemptSeed) ? attemptSeed! :
            Number.isInteger(extra?.seed) ? extra.seed : 0,
          ...(selectedGame === 'trivia' ? {
            correct_count: Number.isInteger(extra?.correctCount) ? extra.correctCount : 0,
            total_answered: Number.isInteger(extra?.totalAnswered) ? extra.totalAnswered : 0,
          } : {}),
        }
      : undefined;
    onComplete(multiplier, rewards, proof);
  }, [onComplete, rewardMode, selectedGame, attemptSeed]);

  // One deterministic seed per game mount so runs are replayable in telemetry.
  const seed = useMemo(() => Number.isInteger(attemptSeed) ? attemptSeed! :
    Math.floor(Math.random() * 0x7fffffff), [visible, selectedGame, attemptSeed]);
  // The retired task trivia API could spend a second Ticket and award a coin
  // outside its attempt. Both the paid game and local tester use bundled
  // questions; only the attempt result can grant park rewards.
  const rideChapter = useMemo(() => parkId != null
    ? getLinePlayChapter(parkId, undefined, taskName) : null,
  [parkId, taskName]);
  const triviaSource = useMemo(
    () => createLinePlayTriviaSource({ parkId, chapterId: rideChapter?.id,
      seed, questionCount: 2, timeLimitSeconds: 10 }),
    [parkId, rideChapter?.id, seed],
  );

  if (!visible || !selectedGame) return null;

  // A Ticket was already spent when the server created this attempt.
  // The attempt resolve call is the only path that awards its coin.
  if (selectedGame === 'trivia' && rewardMode === 'task-attempt') {
    return (
      <TriviaGame
        visible={visible}
        seed={seed}
        title={rideChapter?.trivia.length ? 'Ride Trivia' : 'Park Trivia'}
        subtitle={`${taskName} · 2 questions`}
        source={triviaSource}
        onClose={onClose}
        onQuit={handleQuit}
        onComplete={(mult, meta) => handleComplete(mult, meta)}
      />
    );
  }

  if (USE_QUEUE_KIT_GAMES) {
    switch (selectedGame) {
      case 'tap':
        return (
          <WhackAShark visible={visible} seed={seed} format={rewardMode === 'task-attempt' ? 'ride' : 'queue'} onClose={onClose} onQuit={handleQuit}
            onComplete={(mult, meta) => handleComplete(mult, meta)} />
        );
      case 'timing':
        return (
          <RhythmTapGame visible={visible} seed={seed} difficulty={rewardMode === 'task-attempt' ? 1 : 2}
            format={rewardMode === 'task-attempt' ? 'ride' : 'queue'} onClose={onClose} onQuit={handleQuit}
            onComplete={(mult, meta) => handleComplete(mult, meta)} />
        );
      case 'memory':
        return (
          <MemoryGame visible={visible} seed={seed} difficulty={rewardMode === 'task-attempt' ? 0 : 1} taskName={taskName} onClose={onClose} onQuit={handleQuit}
            onComplete={(mult, meta) => handleComplete(mult, meta)} />
        );
      case 'trivia':
        return (
          <TriviaGame
            visible={visible}
            seed={seed}
            title={taskName}
            source={triviaSource}
            onClose={onClose}
            onQuit={handleQuit}
            onComplete={(mult, meta) => handleComplete(mult, meta)}
          />
        );
      case 'shark':
        return (
          <SharkySwim visible={visible} seed={seed} onClose={onClose}
            onComplete={(mult, meta) => handleComplete(mult, meta)} />
        );
      case 'banana':
        return (
          <BananaBasketGame visible={visible} seed={seed} onClose={onClose}
            onComplete={(mult, meta) => handleComplete(mult, meta)} />
        );
    }
  }

  switch (selectedGame) {
    case 'tap':
      return (
        <TapChallengeMiniGame
          visible={visible}
          taskName={taskName}
          requiredTaps={10}
          timeLimitSeconds={12}
          onClose={onClose}
          onComplete={(mult, taps) => handleComplete(mult, { taps })}
        />
      );
    case 'timing':
      return (
        <TimingMiniGame
          visible={visible}
          taskName={taskName}
          totalTargets={6}
          requiredHits={5}
          timeLimitSeconds={15}
          onClose={onClose}
          onComplete={(mult, perfects) => handleComplete(mult, { perfects })}
        />
      );
    case 'memory':
      return (
        <MemoryMatchMiniGame
          visible={visible}
          taskName={taskName}
          pairs={4}
          timeLimitSeconds={20}
          onClose={onClose}
          onComplete={(mult, timeBonus) => handleComplete(mult, { timeBonus })}
        />
      );
    case 'trivia':
      return (
        <TriviaMiniGame
          visible={visible}
          taskId={taskId}
          taskName={taskName}
          coinImageUrl={coinImageUrl}
          totalQuestions={3}
          timeLimitSeconds={15}
          onClose={onClose}
          onComplete={handleComplete}
        />
      );
    case 'shark':
      return (
        <SharkMiniGame
          visible={visible}
          taskName={taskName}
          targetScore={5}
          onClose={onClose}
          onComplete={(mult, payload) => handleComplete(mult, payload)}
        />
      );
    default:
      return null;
  }
}
