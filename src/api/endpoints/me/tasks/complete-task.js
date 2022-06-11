import client from '../../../client';

export default async function completeTask(task) {
  const response = await client.post(`/tasks/${task.id}/complete`);

  return response.data;
}
