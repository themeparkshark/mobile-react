import { useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Haptics from '../helpers/haptics';
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
  preferredGame?: MiniGameType; // Force a specific game type
  excludeGames?: MiniGameType[]; // Exclude certain game types
  onClose: () => void;
  onComplete: (multiplier: number, rewards: { coins: number; xp: number }) => void;
}

/**
 * Mini-game selector that randomly picks a game type for variety.
 * 
 * Game selection is based on:
 * - Random chance with equal weight
 * - Exclusions based on ride type
 * - Player preferences (future)
 * 
 * This keeps gameplay fresh and unpredictable!
 */
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
  const [gameConfig, setGameConfig] = useState<{
    tapTarget?: number;
    tapTime?: number;
    timingRounds?: number;
    memoryDifficulty?: 'easy' | 'medium' | 'hard';
    memoryTime?: number;
  }>({});

  // Select a random game when modal opens
  useEffect(() => {
    if (!visible) {
      setSelectedGame(null);
      return;
    }

    // Available games
    const allGames: MiniGameType[] = ['tap', 'timing', 'memory', 'trivia'];
    
    // Use preferred game if specified
    if (preferredGame && !excludeGames.includes(preferredGame)) {
      selectGame(preferredGame);
      return;
    }
    
    // Filter out excluded games
    const availableGames = allGames.filter(g => !excludeGames.includes(g));
    
    if (availableGames.length === 0) {
      // Fall back to trivia if all games excluded
      selectGame('trivia');
      return;
    }

    // Random selection with slight weight adjustments
    // Trivia is slightly more common since it has ride-specific content
    const weights: Record<MiniGameType, number> = {
      tap: 1,
      timing: 1,
      memory: 1,
      trivia: 1.5,
    };

    const totalWeight = availableGames.reduce((sum, g) => sum + weights[g], 0);
    let random = Math.random() * totalWeight;
    
    for (const game of availableGames) {
      random -= weights[game];
      if (random <= 0) {
        selectGame(game);
        return;
      }
    }
    
    // Fallback
    selectGame(availableGames[0]);
  }, [visible, preferredGame, excludeGames]);

  // Configure game parameters based on task
  const selectGame = useCallback((game: MiniGameType) => {
    // Generate game-specific config
    // These could be fetched from the API based on task difficulty
    const config: typeof gameConfig = {};
    
    switch (game) {
      case 'tap':
        // Random tap targets between 30-50
        config.tapTarget = 30 + Math.floor(Math.random() * 20);
        config.tapTime = 10;
        break;
      case 'timing':
        // 3-5 rounds
        config.timingRounds = 3 + Math.floor(Math.random() * 3);
        break;
      case 'memory':
        // Random difficulty
        const difficulties: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
        config.memoryDifficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
        config.memoryTime = config.memoryDifficulty === 'easy' ? 30 :
                          config.memoryDifficulty === 'medium' ? 45 : 60;
        break;
    }
    
    setGameConfig(config);
    setSelectedGame(game);
    
    // Haptic for game selection
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  // Handle game completion
  const handleComplete = (multiplier: number, extra: any) => {
    // Convert extra data to standard rewards format
    // In production, this would calculate based on task base rewards * multiplier
    const baseCoins = 10;
    const baseXP = 25;
    
    const rewards = {
      coins: Math.round(baseCoins * multiplier),
      xp: Math.round(baseXP * multiplier),
    };
    
    onComplete(multiplier, rewards);
  };

  // Render selected game
  if (!visible || !selectedGame) return null;

  switch (selectedGame) {
    case 'tap':
      return (
        <TapChallengeMiniGame
          visible={visible}
          taskName={taskName}
          targetTaps={gameConfig.tapTarget || 40}
          timeLimitSeconds={gameConfig.tapTime || 10}
          onClose={onClose}
          onComplete={(multiplier, taps) => handleComplete(multiplier, { taps })}
        />
      );
    
    case 'timing':
      return (
        <TimingMiniGame
          visible={visible}
          taskName={taskName}
          rounds={gameConfig.timingRounds || 4}
          onClose={onClose}
          onComplete={(multiplier, perfects) => handleComplete(multiplier, { perfects })}
        />
      );
    
    case 'memory':
      return (
        <MemoryMatchMiniGame
          visible={visible}
          taskName={taskName}
          difficulty={gameConfig.memoryDifficulty || 'medium'}
          timeLimitSeconds={gameConfig.memoryTime || 45}
          onClose={onClose}
          onComplete={(multiplier, timeBonus) => handleComplete(multiplier, { timeBonus })}
        />
      );
    
    case 'trivia':
      return (
        <TriviaMiniGame
          visible={visible}
          taskId={taskId}
          taskName={taskName}
          coinImageUrl={coinImageUrl}
          onClose={onClose}
          onComplete={handleComplete}
        />
      );
    
    default:
      return null;
  }
}

/**
 * Utility to get recommended game type for a ride category
 */
export function getRecommendedGame(rideType: string): MiniGameType {
  const recommendations: Record<string, MiniGameType> = {
    thrill: 'tap',        // High energy rides = tap challenge
    dark: 'memory',       // Dark rides = memory matching
    show: 'trivia',       // Shows = trivia
    classic: 'timing',    // Classic rides = timing precision
    kids: 'memory',       // Kids rides = memory (easier)
    water: 'tap',         // Water rides = tap challenge
  };
  
  return recommendations[rideType] || 'trivia';
}

/**
 * Utility to get excluded games for certain conditions
 */
export function getExcludedGames(conditions: {
  inQueue?: boolean;
  lowBattery?: boolean;
  accessibility?: boolean;
}): MiniGameType[] {
  const excluded: MiniGameType[] = [];
  
  // In queue - exclude memory (takes too long)
  if (conditions.inQueue) {
    excluded.push('memory');
  }
  
  // Low battery - exclude tap (intensive)
  if (conditions.lowBattery) {
    excluded.push('tap');
  }
  
  // Accessibility mode - exclude timing (requires precise control)
  if (conditions.accessibility) {
    excluded.push('timing');
  }
  
  return excluded;
}
