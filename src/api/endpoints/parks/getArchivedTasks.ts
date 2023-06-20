import { ApiResponseType } from '../../../models/api-response-type';
import { TaskType } from '../../../models/task-type';
import client from '../../client';

export default async function getArchivedTasks(
  park: number
): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/parks/${park}/archived-tasks`
  );

  return data.data;
}
