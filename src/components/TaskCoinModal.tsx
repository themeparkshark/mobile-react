import { Image } from 'expo-image';
import { useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Haptics from '../helpers/haptics';
import Button from '../components/Button';
import CoinUpgradeDemo from './CoinUpgradeDemo';
import CoinLevelingModal from './CoinLevelingModal';
import { AuthContext } from '../context/AuthProvider';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import { getRideParts } from '../api/endpoints/me/ride-parts';

/**
 * Converts a TaskType into a RideCoinLevelType for the leveling modal.
 */
function taskToRideCoin(
  task: TaskType | SecretTaskType,
  timesCompleted: number,
  isSecretTask: boolean,
  playerLevel: number
): RideCoinLevelType {
  const level = Math.min(Math.max(Math.floor(timesCompleted / 3), 1), 5);
  const isMax = level >= 5;
  const requiredLevel = 'experience' in task ? Math.max(1, Math.floor(task.experience / 20)) : 1;

  return {
    id: task.id,
    ride_id: task.id,
    ride_name: task.name,
    coin_url: task.coin_url,
    current_level: level,
    max_level: 5,
    times_collected: timesCompleted,
    energy_to_next_level: isMax ? 0 : (level + 1) * 10,
    parts_to_next_level: isMax ? 0 : (level + 1) * 5,
    required_parts: [],
    player_level_required: requiredLevel,
    is_unlocked: playerLevel >= requiredLevel,
    current_perks: level > 1
      ? [
          {
            id: 1,
            name: 'Tier Upgrade',
            description: `${['Silver', 'Gold', 'Prismatic', 'Legendary'][Math.min(level - 2, 3)]} coin appearance`,
            icon_url: '',
            type: 'cosmetic' as const,
            value: level,
          },
        ]
      : [],
    next_level_perks: !isMax
      ? [
          {
            id: 2,
            name: 'Next Tier',
            description: `${['Silver', 'Gold', 'Prismatic', 'Legendary'][Math.min(level - 1, 3)]} coin appearance`,
            icon_url: '',
            type: 'cosmetic' as const,
            value: level + 1,
          },
          ...(level + 1 >= 3
            ? [
                {
                  id: 3,
                  name: 'Bonus Parts',
                  description: `+${level} ride part drop bonus`,
                  icon_url: '',
                  type: 'bonus_parts' as const,
                  value: level,
                },
              ]
            : []),
          ...(level + 1 >= 5
            ? [
                {
                  id: 4,
                  name: 'Boss Access',
                  description: 'Boss challenge unlocked',
                  icon_url: '',
                  type: 'boss_access' as const,
                  value: 1,
                },
              ]
            : []),
        ]
      : [],
    current_frame_url: '',
    next_frame_url: '',
  };
}

export default function TaskCoinModal({
  task,
  isSecretTask = false,
  timesCompleted = 0,
}: {
  readonly isSecretTask?: boolean;
  readonly task: TaskType | SecretTaskType;
  readonly timesCompleted?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [taskRideParts, setTaskRideParts] = useState(0);
  const { player } = useContext(AuthContext);

  const level = Math.min(Math.max(Math.floor(timesCompleted / 3), 1), 5);
  const rideCoin = taskToRideCoin(
    task,
    timesCompleted,
    isSecretTask,
    player?.level ?? 1
  );

  // Fetch ride parts for this specific task when modal opens
  const loadRideParts = useCallback(async () => {
    try {
      const allParts = await getRideParts();
      // Find parts for this task (regular or secret)
      const entry = allParts.find((p) =>
        isSecretTask ? p.secret_task_id === task.id : p.task_id === task.id
      );
      setTaskRideParts(entry?.amount ?? 0);
    } catch (err) {
      console.warn('Failed to load ride parts:', err);
      setTaskRideParts(0);
    }
  }, [task.id, isSecretTask]);

  useEffect(() => {
    if (visible) {
      loadRideParts();
    }
  }, [visible, loadRideParts]);

  const handleOpen = () => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setVisible(true);
  };

  return (
    <>
      <Button onPress={handleOpen}>
        <Image
          source={task.coin_url}
          style={{
            width: 60,
            height: 60,
            borderWidth: level >= 4 ? 3 : 2,
            borderColor:
              level >= 5 ? '#fb923c' :
              level >= 4 ? '#c4b5fd' :
              level >= 3 ? '#fbbf24' :
              level >= 2 ? '#cbd5e1' : '#fff',
            borderRadius: 50,
            ...(Platform.OS === 'ios' && level >= 3 ? {
              shadowColor:
                level >= 5 ? '#fb923c' :
                level >= 4 ? '#c4b5fd' : '#fbbf24',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 6,
            } : {}),
          }}
        />
      </Button>

      <CoinLevelingModal
        visible={visible}
        rideCoin={rideCoin}
        playerEnergy={player?.energy ?? 0}
        playerParts={taskRideParts}
        onClose={() => setVisible(false)}
        onLevelUp={async (id) => {
          // TODO: API call to level up coin
          await new Promise((r) => setTimeout(r, 1800));
          return true;
        }}
      />
    </>
  );
}
