import client from '../../client';

export interface RidePartsEntry {
  task_id: number | null;
  secret_task_id: number | null;
  task_name: string;
  amount: number;
  type: 'task' | 'secret_task';
}

/**
 * Get all ride parts for the current player.
 * Returns combined list of both regular task and secret task ride parts.
 */
export async function getRideParts(): Promise<RidePartsEntry[]> {
  try {
    const response = await client.get('/me/ride-parts');
    return response.data?.data ?? [];
  } catch (error) {
    console.warn('Failed to fetch ride parts:', error);
    return [];
  }
}

/**
 * Get ride parts for a specific task or secret task.
 */
export async function getRidePartsForTask(taskId: number): Promise<number> {
  try {
    const response = await client.get(`/me/ride-parts/${taskId}`);
    return response.data?.data?.amount ?? 0;
  } catch (error) {
    console.warn('Failed to fetch ride parts for task:', taskId, error);
    return 0;
  }
}
