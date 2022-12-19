import client from '../../../client';
import { TaskType } from '../../../../models/task-type';
import { ApiResponseType } from '../../../../models/api-response-type';

export default async function completeTask(task: TaskType): Promise<TaskType> {
  const { data } = await client.post<ApiResponseType<TaskType>>(
    `/tasks/${task.id}/complete`
  );

  return data.data;
}
