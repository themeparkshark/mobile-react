import client from '../../client';
import { TaskType } from '../../../models/task-type';

/**
 * Mark a task as failed (mini-game lost).
 * Task is removed from available tasks but no rewards given.
 */
export default async function failTask(task: TaskType): Promise<void> {
  try {
    await client.post(`/tasks/${task.id}/fail`);
    console.log('🎮 Task marked as failed:', task.id, task.name);
  } catch (error: any) {
    console.error('🎮 Failed to mark task as failed:', error?.response?.data || error.message);
    // Don't throw - task removal is non-critical
  }
}
