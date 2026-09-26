import {
  getTaskAttempt,
  startTaskAttempt,
  type TaskAttemptResponse,
} from '../../api/endpoints/me/task-attempts';
import { writeTaskAttemptCheckpoint, type TaskAttemptCheckpoint } from './checkpoint';

/** Recover an existing paid challenge; never create a second request ID. */
export async function recoverTaskAttempt(checkpoint: TaskAttemptCheckpoint): Promise<TaskAttemptResponse> {
  const result = checkpoint.attemptId
    ? await getTaskAttempt(checkpoint.attemptId)
    : await startTaskAttempt(
      checkpoint.requestId,
      checkpoint.taskType,
      checkpoint.taskId,
      checkpoint.latitude,
      checkpoint.longitude,
    );

  if (!checkpoint.attemptId) {
    // The original request remains on disk if this write fails, so another
    // relaunch still replays the same idempotent server request.
    await writeTaskAttemptCheckpoint({ ...checkpoint, attemptId: result.attempt.id })
      .catch(error => console.warn('Could not save ride challenge ID:', error));
  }
  return result;
}
