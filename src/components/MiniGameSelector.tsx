import { useEffect, useState, useCallback } from 'react';
import TapChallengeMiniGame from './TapChallengeMiniGame';
import TimingMiniGame from './TimingMiniGame';
import MemoryMatchMiniGame from './MemoryMatchMiniGame';
import TriviaMiniGame from './TriviaMiniGame';

type MiniGameType = 'tap' | 'timing' | 'memory' | 'trivia';

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

    const allGames: MiniGameType[] = ['tap', 'timing', 'memory', 'trivia'];
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

  if (!visible || !selectedGame) return null;

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
    default:
      return null;
  }
}
