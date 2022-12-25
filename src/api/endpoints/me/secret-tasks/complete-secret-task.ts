import client from '../../../client';
import { TaskType } from '../../../../models/task-type';
import { ApiResponseType } from '../../../../models/api-response-type';
import {SecretTaskType} from '../../../../models/secret-task-type';

export default async function completeSecretTask(secretTask: SecretTaskType): Promise<SecretTaskType> {
  const { data } = await client.post<ApiResponseType<SecretTaskType>>(
    `/secret-tasks/${secretTask.id}/complete`
  );

  return data.data;
}
