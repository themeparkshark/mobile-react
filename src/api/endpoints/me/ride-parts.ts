import client from '../../client';

export interface RidePartsEntry {
  task_id: number;
  task_name: string;
  amount: number;
}

/**
 * Get all ride parts for the current player.
 * Returns a map of task_id -> amount.
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
 * Get ride parts for a specific task.
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
