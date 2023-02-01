import { ApiResponseType } from '../../../../models/api-response-type';
import { TaskType } from '../../../../models/task-type';
import client from '../../../client';

export default async function getCompletedTasks(
  park: number,
  user: number
): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/users/${user}/parks/${park}/tasks`
  );

  return data.data;
}
