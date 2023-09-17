import { ApiResponseType } from '../../../../models/api-response-type';
import { TaskType } from '../../../../models/task-type';
import client from '../../../client';

export default async function getCompletedArchivedTasks(
  park: number,
  user: number
): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/users/${user}/parks/${park}/archived-tasks`
  );

  return data.data;
}
