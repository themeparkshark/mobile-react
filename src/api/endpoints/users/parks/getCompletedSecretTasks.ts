import { ApiResponseType } from '../../../../models/api-response-type';
import { SecretTaskType } from '../../../../models/secret-task-type';
import client from '../../../client';

export default async function getCompletedSecretTasks(
  park: number,
  user: number
): Promise<SecretTaskType[]> {
  const { data } = await client.get<ApiResponseType<SecretTaskType[]>>(
    `/users/${user}/parks/${park}/secret-tasks`
  );

  return data.data;
}
