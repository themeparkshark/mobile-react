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
import { WhackAShark, type WhackFormat } from '../games/whack';
import WhackRushLab from '../games/whack/party/WhackRushLab';
import type { WhackTheme } from '../games/whack/assets';
import { SnapTheRide } from '../games/snap/SnapTheRide';
import { RhythmTapGame } from '../games/rhythm';
import { MemoryGame } from '../games/memory';
import { TriviaDuel } from '../games/trivia-duel';
import { SharkySwim } from '../games/sharky';
import { BananaBasketGame } from '../games/banana-basket';
import BananaLab from '../games/banana-basket/BananaLab';
import { CurrentQuestGame } from '../games/current-quest';
import { TaskAttemptGame, TaskGameProof } from '../api/endpoints/me/task-attempts';
import { getLinePlayChapter } from '../services/lineplay/chapters';
import { useHelp } from './help/HelpProvider';
import GameIntroCard from './help/GameIntroCard';
import { gameIntroTip } from '../services/help/helpTopics';

const USE_QUEUE_KIT_GAMES = true;

// Dev-only Whack-a-Shark bench overrides for the MiniGameTester (never read in release builds):
// EXPO_PUBLIC_WHACK_FORMAT=queue|daily|weekly|duel|raid, EXPO_PUBLIC_WHACK_UNLOCK=<lifetime Bursts>,
// EXPO_PUBLIC_WHACK_THEME=park|pirates|mansion|space|jungle|backlot.
const WHACK_DEV: { format?: WhackFormat; unlock?: number; theme?: WhackTheme } = __DEV__ ? {
  format: (process.env.EXPO_PUBLIC_WHACK_FORMAT as WhackFormat) || undefined,
  unlock: process.env.EXPO_PUBLIC_WHACK_UNLOCK ? Number(process.env.EXPO_PUBLIC_WHACK_UNLOCK) : undefined,
  theme: (process.env.EXPO_PUBLIC_WHACK_THEME as WhackTheme) || undefined,
} : {};

// 'current' is opt-in (preferredGame) until the ride pool's server verifier accepts its v3 proof (WS7).
type MiniGameType = 'tap' | 'timing' | 'memory' | 'trivia' | 'shark' | 'banana' | 'photo' | 'current';

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
  const [bananaLabClosed, setBananaLabClosed] = useState(false);
  const gameMountedAt = useRef(0);
  const exitPromptOpen = useRef(false);
  // First time a player meets each game type: a how-to card before it starts.
  const { tipsReady, hasSeenTip, markTipSeen } = useHelp();
  const [introGame, setIntroGame] = useState<MiniGameType | null>(null);
  const introChecked = useRef<MiniGameType | null>(null);
  if (visible && selectedGame && tipsReady && introChecked.current !== selectedGame) {
    introChecked.current = selectedGame;
    if (!hasSeenTip(gameIntroTip(selectedGame))) setIntroGame(selectedGame);
  }
  const showIntro = visible && !!selectedGame && introGame === selectedGame;

  const handleQuit = useCallback((resume: () => void) => {
    if (isPractice || rewardMode !== 'task-attempt') {
      onClose();
      return;
    }
    if (exitPromptOpen.current) return;
    exitPromptOpen.current = true;
    Alert.alert(
      'End ride challenge?',
      'If you quit now, it counts as a loss. Your ticket is already used.',
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
    if (visible && selectedGame && !showIntro) gameMountedAt.current = Date.now();
  }, [visible, selectedGame, showIntro]);
  useEffect(() => {
    if (showIntro && selectedGame) markTipSeen(gameIntroTip(selectedGame));
  }, [showIntro, selectedGame, markTipSeen]);

  useEffect(() => {
    console.log('🎮 MiniGameSelector useEffect:', { visible, preferredGame, selectedGame });
    if (!visible) {
      setSelectedGame(null);
      setIntroGame(null);
      introChecked.current = null;
      return;
    }

    if (preferredGame && !excludeGames.includes(preferredGame)) {
      console.log('🎮 Setting game to preferredGame:', preferredGame);
      setSelectedGame(preferredGame);
      return;
    }

    // Parade Beat ('timing') is queue-only until the server replays its proof
    // (WS7, rhythm SERVER_NOTE.md): a missing preferredGame never starts an
    // unprovable rhythm ride. TaskAttemptController::GAMES has no 'timing' either.
    const allGames: MiniGameType[] = rewardMode === 'task-attempt'
      ? ['tap', 'memory', 'trivia']
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
          ...(selectedGame === 'tap' && Number.isInteger(extra?.hits) ? { hits: extra.hits } : {}),
          // Current Quest: the full replayable v2 proof (TaskGameProofService 'current', design 15.3).
          ...(selectedGame === 'current' && extra?.proof ? { current: extra.proof, shells: extra.shells } : {}),
          ...(selectedGame === 'trivia' ? {
            correct_count: Number.isInteger(extra?.correctCount) ? extra.correctCount : 0,
            total_answered: Number.isInteger(extra?.totalAnswered) ? extra.totalAnswered : 0,
          } : {}),
          // Sharky Tide Run: the replayable swim proof (design 11.2). 'shark'
          // joins the paid pool only once WS7's Node swim verifier is live.
          ...(selectedGame === 'shark' && extra?.swimProof ? { swim: extra.swimProof } : {}),
        } as TaskGameProof
      : undefined;
    onComplete(multiplier, rewards, proof);
  }, [onComplete, rewardMode, selectedGame, attemptSeed]);

  // One deterministic seed per game mount so runs are replayable in telemetry.
  const seed = useMemo(() => Number.isInteger(attemptSeed) ? attemptSeed! :
    Math.floor(Math.random() * 0x7fffffff), [visible, selectedGame, attemptSeed]);
  // Trivia Duel builds its own deck from the park/ride chapter. The paid
  // ride challenge ("Beat the Buzzer", 3 questions, 2 right to win) and the
  // local tester use bundled questions; only the attempt result grants coins.
  const rideChapter = useMemo(() => parkId != null
    ? getLinePlayChapter(parkId, undefined, taskName) : null,
  [parkId, taskName]);

  // Dev lab (EXPO_PUBLIC_BANANA_LAB): opens Banana Basket's mode picker straight
  // from the tester. __DEV__-only, never in release builds.
  if (__DEV__ && process.env.EXPO_PUBLIC_BANANA_LAB && !bananaLabClosed) {
    return <BananaLab command={process.env.EXPO_PUBLIC_BANANA_LAB} onClose={() => setBananaLabClosed(true)} />;
  }

  if (!visible || !selectedGame) return null;

  if (showIntro) {
    return <GameIntroCard kind={selectedGame} onStart={() => setIntroGame(null)} />;
  }

  // A Ticket was already spent when the server created this attempt.
  // The attempt resolve call is the only path that awards its coin.
  if (selectedGame === 'trivia' && rewardMode === 'task-attempt') {
    return (
      <TriviaDuel
        visible={visible}
        mode="ride"
        seed={seed}
        title="Beat the Buzzer"
        subtitle="Ride Challenge: 2 of 3 to win"
        parkId={parkId}
        coinImage={coinImageUrl ?? null}
        chapterId={rideChapter?.id}
        onClose={onClose}
        onQuit={handleQuit}
        onComplete={(mult, meta) => handleComplete(mult, meta)}
      />
    );
  }

  if (selectedGame === 'photo') {
    return (
      <SnapTheRide visible={visible} seed={seed} taskName={taskName} onClose={onClose} onQuit={handleQuit}
        onComplete={(mult, meta) => handleComplete(mult, meta)} />
    );
  }

  if (USE_QUEUE_KIT_GAMES) {
    switch (selectedGame) {
      case 'tap':
        // Dev-only: EXPO_PUBLIC_WHACK_FORMAT=party opens a live Whack Rush Line Party against the house crew.
        if (__DEV__ && (WHACK_DEV.format as string) === 'party') {
          return <WhackRushLab visible={visible} onClose={onClose} autoplay={process.env.EXPO_PUBLIC_GAME_AUTOPLAY === '1'} />;
        }
        return (
          <WhackAShark visible={visible} seed={seed} taskName={taskName}
            format={WHACK_DEV.format ?? (rewardMode === 'task-attempt' ? 'ride' : 'queue')}
            unlockLevel={WHACK_DEV.unlock} theme={WHACK_DEV.theme}
            onClose={onClose} onQuit={handleQuit}
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
          <MemoryGame visible={visible} seed={seed} mode={rewardMode === 'task-attempt' ? 'ride' : undefined} difficulty={1} menu={rewardMode !== 'task-attempt'} taskName={taskName} onClose={onClose} onQuit={handleQuit}
            onComplete={(mult, meta) => handleComplete(mult, meta)} />
        );
      case 'trivia':
        return (
          <TriviaDuel
            visible={visible}
            mode={isPractice ? 'practice' : 'queue'}
            seed={seed}
            title="Trivia Duel"
            subtitle="Queue Duel"
            parkId={parkId}
            chapterId={rideChapter?.id}
            onClose={onClose}
            onQuit={handleQuit}
            onComplete={(mult, meta) => handleComplete(mult, meta)}
          />
        );
      case 'shark':
        return (
          <SharkySwim visible={visible} seed={seed} taskName={taskName} onClose={onClose} onQuit={handleQuit}
            mode={rewardMode === 'task-attempt' ? 'ride' : 'queue'}
            onComplete={(mult, meta) => handleComplete(mult, meta)} />
        );
      case 'current':
        return (
          <CurrentQuestGame visible={visible} seed={seed} context={rewardMode === 'task-attempt' ? 'ride' : 'quick'}
            onClose={onClose} onQuit={handleQuit} onComplete={(mult, meta) => handleComplete(mult, meta)} />
        );
      case 'banana':
        return (
          <BananaBasketGame visible={visible} seed={seed} onClose={onClose} rideName={taskName}
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
