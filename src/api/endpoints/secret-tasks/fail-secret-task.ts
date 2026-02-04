import client from '../../client';
import { SecretTaskType } from '../../../models/secret-task-type';

/**
 * Mark a secret task as failed (mini-game lost).
 * Task is removed from available tasks but no rewards given.
 */
export default async function failSecretTask(secretTask: SecretTaskType): Promise<void> {
  try {
    await client.post(`/secret-tasks/${secretTask.id}/fail`);
    console.log('🎮 Secret task marked as failed:', secretTask.id, secretTask.name);
  } catch (error: any) {
    console.error('🎮 Failed to mark secret task as failed:', error?.response?.data || error.message);
    // Don't throw - task removal is non-critical
  }
}
