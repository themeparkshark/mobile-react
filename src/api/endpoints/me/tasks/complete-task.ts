import { TaskType } from '../../../../models/task-type';
import client from '../../../client';

export interface CompleteTaskRewards {
  coins_earned: number;
  xp_earned: number;
  energy_earned: number;
  ride_parts_earned: number;
  task_name: string;
}

export interface CompleteTaskResponse {
  task: TaskType;
  rewards: CompleteTaskRewards;
}

export default async function completeTask(
  task: TaskType,
  doubleXP: boolean,
  doubleCoins: boolean
): Promise<CompleteTaskResponse> {
  const { data } = await client.post<{ data: CompleteTaskResponse }>(
    `/tasks/${task.id}/complete`,
    {
      double_xp: doubleXP,
      double_coins: doubleCoins,
    }
  );

  return data.data;
}
