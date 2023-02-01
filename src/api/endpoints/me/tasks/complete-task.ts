import { ApiResponseType } from '../../../../models/api-response-type';
import { TaskType } from '../../../../models/task-type';
import client from '../../../client';

export default async function completeTask(
  task: TaskType,
  doubleXP: boolean,
  doubleCoins: boolean
): Promise<TaskType> {
  const { data } = await client.post<ApiResponseType<TaskType>>(
    `/tasks/${task.id}/complete`,
    {
      double_xp: doubleXP,
      double_coins: doubleCoins,
    }
  );

  return data.data;
}
