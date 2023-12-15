import { ApiResponseType } from '../../../../models/api-response-type';
import { TaskType } from '../../../../models/task-type';
import client from '../../../client';

export default async function getCompletedTasks(
  park: number,
  player: number
): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/players/${player}/parks/${park}/tasks`
  );

  return data.data;
}
