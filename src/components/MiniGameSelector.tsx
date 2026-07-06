import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { TriviaGame, createTaskTriviaSource } from '../games/trivia';
import { SharkySwim } from '../games/sharky';
import { BananaBasketGame } from '../games/banana-basket';

const USE_QUEUE_KIT_GAMES = true;

type MiniGameType = 'tap' | 'timing' | 'memory' | 'trivia' | 'shark' | 'banana';

interface Props {
  visible: boolean;
  taskId: number;
  taskName: string;
  coinImageUrl?: string;
  preferredGame?: MiniGameType;
  excludeGames?: MiniGameType[];
  onClose: () => void;
  onComplete: (multiplier: number, rewards: { coins: number; xp: number }) => void;
}

// Pass/Fail criteria for each game:
// - Tap Challenge: 12 seconds, tap 10 targets or FAIL
// - Timing: 15 seconds, hit 5/6 targets or FAIL
// - Memory: 20 seconds, match ALL 4 pairs or FAIL
// - Trivia: 15 seconds, get ALL 3 questions correct or FAIL (one wrong = instant fail)

export default function MiniGameSelector({
  visible,
  taskId,
  taskName,
  coinImageUrl,
  preferredGame,
  excludeGames = [],
  onClose,
  onComplete,
}: Props) {
  const [selectedGame, setSelectedGame] = useState<MiniGameType | null>(null);

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

    const allGames: MiniGameType[] = USE_QUEUE_KIT_GAMES
      ? ['tap', 'timing', 'memory', 'trivia', 'shark', 'banana']
      : ['tap', 'timing', 'memory', 'trivia', 'shark'];
    const available = allGames.filter(g => !excludeGames.includes(g));
    if (available.length === 0) {
      setSelectedGame('trivia');
      return;
    }

    setSelectedGame(available[Math.floor(Math.random() * available.length)]);
  }, [visible, preferredGame]);

  const handleComplete = useCallback((multiplier: number, extra: any) => {
    const rewards = { coins: Math.round(10 * multiplier), xp: Math.round(25 * multiplier) };
    onComplete(multiplier, rewards);
  }, [onComplete]);

  // One deterministic seed per game mount so runs are replayable in telemetry.
  const seed = useMemo(() => Math.floor(Math.random() * 0x7fffffff), [visible, selectedGame]);

  if (!visible || !selectedGame) return null;

  if (USE_QUEUE_KIT_GAMES) {
    switch (selectedGame) {
      case 'tap':
        return (
          <WhackAShark visible={visible} seed={seed} onClose={onClose}
            onComplete={(mult, meta) => handleComplete(mult, meta)} />
        );
      case 'timing':
        return (
          <RhythmTapGame visible={visible} onClose={onClose}
            onComplete={(mult, meta) => handleComplete(mult, meta)} />
        );
      case 'memory':
        return (
          <MemoryGame visible={visible} seed={seed} onClose={onClose}
            onComplete={(mult, meta) => handleComplete(mult, meta)} />
        );
      case 'trivia':
        return (
          <TriviaGame
            visible={visible}
            seed={seed}
            title={taskName}
            source={createTaskTriviaSource({ taskId })}
            onClose={onClose}
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
