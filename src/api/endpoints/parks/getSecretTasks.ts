import client from '../../client';
import { ParkType } from '../../../models/park-type';
import { TaskType } from '../../../models/task-type';
import { ApiResponseType } from '../../../models/api-response-type';
import {SecretTaskType} from '../../../models/secret-task-type';

export default async function getSecretTasks(park: number): Promise<SecretTaskType[]> {
  const { data } = await client.get<ApiResponseType<SecretTaskType[]>>(
    `/parks/${park}/secret-tasks`
  );

  return data.data;
}
