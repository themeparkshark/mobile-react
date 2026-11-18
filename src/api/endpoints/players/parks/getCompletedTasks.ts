import { ApiResponseType } from '../../../../models/api-response-type';
import { TaskType } from '../../../../models/task-type';
import { withPlainNames } from '../../../../helpers/plainRideName';
import client from '../../../client';

export default async function getCompletedTasks(
  park: number,
  player: number
): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/players/${player}/parks/${park}/tasks`
  );

  // One display name per ride (fix w3 T122), like every other ride list.
  return Array.isArray(data.data) ? withPlainNames(data.data) : data.data;
}
