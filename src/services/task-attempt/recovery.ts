import {
  getTaskAttempt,
  resolveTaskAttempt,
  startTaskAttempt,
  type TaskAttemptResponse,
} from '../../api/endpoints/me/task-attempts';
import { writeTaskAttemptCheckpoint, type TaskAttemptCheckpoint } from './checkpoint';
import type { GroupKind } from '../lineplay/lineGroup';
import { beganHere, flushBegan } from './began';

/**
 * The core-loop extras of a start (the same game on TRY AGAIN, picture games
 * only), or nothing at all, so a plain start sends exactly the old request.
 */
export function startExtras(checkpoint: Pick<TaskAttemptCheckpoint, 'retryOf' | 'pictureOnly' | 'crew'>):
  [] | [{ retry_of?: number; picture_only?: boolean; crew?: GroupKind }] {
  const retryOf = Number.isInteger(checkpoint.retryOf) && (checkpoint.retryOf as number) > 0 ? checkpoint.retryOf as number : null;
  const pictureOnly = checkpoint.pictureOnly === true;
  const crew = checkpoint.crew ?? null;
  if (!retryOf && !pictureOnly && !crew) return [];
  return [{ ...(retryOf ? { retry_of: retryOf } : {}), ...(pictureOnly ? { picture_only: true } : {}), ...(crew ? { crew } : {}) }];
}

/** Recover an existing paid challenge; never create a second request ID. */
export async function recoverTaskAttempt(checkpoint: TaskAttemptCheckpoint): Promise<TaskAttemptResponse> {
  // T6 (arcade plan): a began mark saved before a crash or a dead zone lands first, so the server reads this try as
  // played before anything reopens it (never a free replay).
  await flushBegan().catch(() => undefined);
  const known = checkpoint.attemptId ? await getTaskAttempt(checkpoint.attemptId) : null;
  // T6 (arcade plan): a saved try whose round 1 already started is a played game. Reopened (after a force-quit, a
  // dead phone or a closed card) it is settled as a loss, its Parts paid, never handed back as a free replay. A try
  // that never began (shut on the how-to card) resumes for free. Today's server sends no began_at: only this run's
  // own mark counts there.
  if (known && known.attempt.status === 'started' && (!!known.attempt.began_at || beganHere(known.attempt.id))) {
    return resolveTaskAttempt(known.attempt.id, 'loss');
  }
  const result = known ?? await startTaskAttempt(
      checkpoint.requestId,
      checkpoint.taskType,
      checkpoint.taskId,
      checkpoint.latitude,
      checkpoint.longitude,
      ...startExtras(checkpoint),
    );

  if (!checkpoint.attemptId) {
    // The original request remains on disk if this write fails, so another
    // relaunch still replays the same idempotent server request.
    await writeTaskAttemptCheckpoint({ ...checkpoint, attemptId: result.attempt.id })
      .catch(error => console.warn('Could not save ride challenge ID:', error));
  }
  return result;
}
