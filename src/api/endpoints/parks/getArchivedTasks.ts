import { ApiResponseType } from '../../../models/api-response-type';
import { SecretTaskType } from '../../../models/secret-task-type';
import client from '../../client';
import {TaskType} from '../../../models/task-type';

export default async function getArchivedTasks(
  park: number
): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/parks/${park}/archived-tasks`
  );

  return data.data;
}
