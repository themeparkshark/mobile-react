import client from '../../../client';
import { TaskType } from '../../../../models/task-type';
import { ApiResponseType } from '../../../../models/api-response-type';

export default async function getCompletedTasks(park: number, user: number): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/users/${user}/parks/${park}/tasks`
  );

  return data.data;
}
