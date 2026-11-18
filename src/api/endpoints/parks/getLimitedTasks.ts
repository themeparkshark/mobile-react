import { ApiResponseType } from '../../../models/api-response-type';
import { TaskType } from '../../../models/task-type';
import { withPlainNames } from '../../../helpers/plainRideName';
import client from '../../client';

/** Every limited coin at a park, in rotation or not (Coin Map 2.0). */
export default async function getLimitedTasks(park: number): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/parks/${park}/limited-tasks`
  );

  // One display name per ride (fix w3 T122), like every other ride list.
  return Array.isArray(data.data) ? withPlainNames(data.data) : data.data;
}
