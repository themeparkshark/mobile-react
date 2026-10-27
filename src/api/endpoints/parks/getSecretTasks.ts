import { ApiResponseType } from '../../../models/api-response-type';
import { SecretTaskType } from '../../../models/secret-task-type';
import client from '../../client';
import { withPlainNames } from '../../../helpers/plainRideName';

export default async function getSecretTasks(
  park: number
): Promise<SecretTaskType[]> {
  const { data } = await client.get<ApiResponseType<SecretTaskType[]>>(
    `/parks/${park}/secret-tasks`
  );

  // Plain ride names (no trademark marks), like every other ride list.
  return Array.isArray(data.data) ? withPlainNames(data.data) : data.data;
}
