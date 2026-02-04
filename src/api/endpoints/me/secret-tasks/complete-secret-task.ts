import { SecretTaskType } from '../../../../models/secret-task-type';
import client from '../../../client';

export interface CompleteSecretTaskRewards {
  coins_earned: number;
  xp_earned: number;
  energy_earned: number;
  ride_parts_earned: number;
  task_name: string;
}

export interface CompleteSecretTaskResponse {
  secret_task: SecretTaskType;
  rewards: CompleteSecretTaskRewards;
}

export default async function completeSecretTask(
  secretTask: SecretTaskType,
  doubleXP: boolean,
  doubleCoins: boolean
): Promise<CompleteSecretTaskResponse> {
  const { data } = await client.post<{ data: CompleteSecretTaskResponse }>(
    `/secret-tasks/${secretTask.id}/complete`,
    {
      double_xp: doubleXP,
      double_coins: doubleCoins,
    }
  );

  return data.data;
}
