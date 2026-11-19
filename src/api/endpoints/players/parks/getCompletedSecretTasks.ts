import { ApiResponseType } from '../../../../models/api-response-type';
import { SecretTaskType } from '../../../../models/secret-task-type';
import { withPlainNames } from '../../../../helpers/plainRideName';
import client from '../../../client';

export default async function getCompletedSecretTasks(
  park: number,
  player: number
): Promise<SecretTaskType[]> {
  const { data } = await client.get<ApiResponseType<SecretTaskType[]>>(
    `/players/${player}/parks/${park}/secret-tasks`
  );

  // One display name per ride (fix w3 T122), like every other ride list.
  return Array.isArray(data.data) ? withPlainNames(data.data) : data.data;
}
