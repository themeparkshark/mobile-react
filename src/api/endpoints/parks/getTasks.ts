import client from '../../client';
import { ParkType } from '../../../models/park-type';
import { TaskType } from '../../../models/task-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function getTasks(park: ParkType): Promise<TaskType[]> {
  const { data } = await client.get<ApiResponseType<TaskType[]>>(
    `/me/parks/${park.id}/tasks`
  );

  return data.data;
}
