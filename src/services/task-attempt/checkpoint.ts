import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'task_attempt_checkpoint_v1_';
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export interface TaskAttemptCheckpoint {
  version: 1;
  playerId: number;
  taskType: 'task' | 'secret_task';
  taskId: number;
  requestId: string;
  attemptId: number | null;
  latitude: number;
  longitude: number;
  savedAt: number;
}

export function taskAttemptCheckpointKey(
  playerId: number,
  taskType: TaskAttemptCheckpoint['taskType'],
  taskId: number,
): string {
  return `${PREFIX}${playerId}_${taskType}_${taskId}`;
}

export function parseTaskAttemptCheckpoint(
  raw: string | null,
  playerId: number,
  taskType: TaskAttemptCheckpoint['taskType'],
  taskId: number,
  nowMs = Date.now(),
): TaskAttemptCheckpoint | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as TaskAttemptCheckpoint;
    if (value?.version !== 1 || value.playerId !== playerId || value.taskType !== taskType ||
      value.taskId !== taskId || !/^[A-Za-z0-9-]{16,80}$/.test(value.requestId) ||
      (value.attemptId !== null && (!Number.isInteger(value.attemptId) || value.attemptId <= 0)) ||
      !Number.isFinite(value.latitude) || value.latitude < -90 || value.latitude > 90 ||
      !Number.isFinite(value.longitude) || value.longitude < -180 || value.longitude > 180 ||
      !Number.isFinite(value.savedAt) || value.savedAt > nowMs + 60_000 ||
      nowMs - value.savedAt > MAX_AGE_MS) return null;
    return value;
  } catch {
    return null;
  }
}

export async function readTaskAttemptCheckpoint(
  playerId: number,
  taskType: TaskAttemptCheckpoint['taskType'],
  taskId: number,
): Promise<TaskAttemptCheckpoint | null> {
  const raw = await AsyncStorage.getItem(taskAttemptCheckpointKey(playerId, taskType, taskId));
  return parseTaskAttemptCheckpoint(raw, playerId, taskType, taskId);
}

export async function writeTaskAttemptCheckpoint(value: TaskAttemptCheckpoint): Promise<void> {
  await AsyncStorage.setItem(
    taskAttemptCheckpointKey(value.playerId, value.taskType, value.taskId),
    JSON.stringify(value),
  );
}

export async function removeTaskAttemptCheckpoint(
  playerId: number,
  taskType: TaskAttemptCheckpoint['taskType'],
  taskId: number,
): Promise<void> {
  await AsyncStorage.removeItem(taskAttemptCheckpointKey(playerId, taskType, taskId));
}
