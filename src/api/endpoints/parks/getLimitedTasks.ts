import { ApiResponseType } from '../../../models/api-response-type';
import { TaskType } from '../../../models/task-type';
import client from '../../client';

/** Every limited coin at a park, in rotation or not (Coin Map 2.0). */
export default async function getLimitedTasks(park: number): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/parks/${park}/limited-tasks`
  );

  return data.data;
}
