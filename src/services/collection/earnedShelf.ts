import type { TaskAttempt } from '../../api/endpoints/me/task-attempts';
import type { TaskType } from '../../models/task-type';
import type { SecretTaskType } from '../../models/secret-task-type';

export interface EarnedShelfArrival {
  readonly attemptId: number;
  readonly assetId: number;
  readonly taskId: number;
  readonly taskType: 'task' | 'secret_task';
  readonly firstCollection: boolean;
}
export type ShelfSection = 'normal' | 'secret' | 'archived';
export interface EarnedShelfSlot {
  readonly section: ShelfSection;
  readonly task: TaskType | SecretTaskType;
  readonly row: number;
  readonly column: number;
}
const positiveId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export function isEarnedShelfArrival(value: unknown): value is EarnedShelfArrival {
  if (!value || typeof value !== 'object') return false;
  const request = value as EarnedShelfArrival;
  return positiveId(request.attemptId) && positiveId(request.assetId) &&
    positiveId(request.taskId) && (request.taskType === 'task' || request.taskType === 'secret_task') &&
    typeof request.firstCollection === 'boolean';
}

/** A resolved server win supplies identity; client score/artwork never chooses a slot. */
export function createEarnedShelfArrival(attempt: TaskAttempt | null): EarnedShelfArrival | null {
  if (!attempt || attempt.status !== 'won' || !positiveId(attempt.rewards?.coin_asset_id) ||
      !positiveId(attempt.id) || !positiveId(attempt.task_id) ||
      !positiveId(attempt.rewards?.coin_times_collected)) return null;
  const request = { attemptId: attempt.id, taskId: attempt.task_id,
    assetId: attempt.rewards.coin_asset_id, taskType: attempt.task_type,
    firstCollection: attempt.rewards.coin_times_collected === 1 };
  return isEarnedShelfArrival(request) ? request : null;
}

/** Use the same catalog order and five-slot rows as the existing park shelves. */
export function resolveEarnedShelfSlot(request: unknown, lists: {
  normal: readonly TaskType[]; normalCompleted: readonly TaskType[];
  secret: readonly SecretTaskType[]; secretCompleted: readonly SecretTaskType[];
  archived: readonly TaskType[]; archivedCompleted: readonly TaskType[];
}): EarnedShelfSlot | null {
  if (!isEarnedShelfArrival(request)) return null;
  const sections: ShelfSection[] = request.taskType === 'secret_task' ? ['secret'] : ['normal', 'archived'];
  for (const section of sections) {
    const tasks = lists[section];
    const completed = lists[`${section}Completed` as 'normalCompleted' | 'secretCompleted' | 'archivedCompleted'];
    const index = tasks.findIndex(task => task.id === request.taskId && task.asset_id === request.assetId);
    if (index < 0 || !completed.some(task => task.id === request.taskId &&
        (task.asset_id === undefined || task.asset_id === request.assetId) && (task.times_completed ?? 0) > 0)) continue;
    return { section, task: tasks[index], row: Math.floor(index / 5), column: index % 5 };
  }
  return null;
}
