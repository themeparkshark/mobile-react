import { ApiResponseType } from '../../../models/api-response-type';
import { TaskType } from '../../../models/task-type';
import client from '../../client';
import { withPlainNames } from '../../../helpers/plainRideName';

export default async function getTasks(park: number): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/parks/${park}/tasks`
  );

  // Plain ride names (no trademark marks), like every other ride list.
  return Array.isArray(data.data) ? withPlainNames(data.data) : data.data;
}
