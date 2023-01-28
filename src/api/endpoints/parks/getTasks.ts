import client from '../../client';
import { TaskType } from '../../../models/task-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function getTasks(park: number): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/parks/${park}/tasks`
  );

  return data.data;
}
