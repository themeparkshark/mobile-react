import { ApiResponseType } from '../../../models/api-response-type';
import { TaskType } from '../../../models/task-type';
import client from '../../client';

export default async function getTasks(park: number): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/parks/${park}/tasks`
  );

  return data.data;
}
