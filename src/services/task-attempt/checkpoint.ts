import type { GroupKind } from '../lineplay/lineGroup';
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
  /** TRY AGAIN after a loss: the lost attempt, so the server deals the same game (core loop 5.3). */
  retryOf?: number | null;
  /** "Picture games only" was on when this try started: never trivia. */
  pictureOnly?: boolean;
  /** Who is playing (the LinePlay crew) when this try started, for the trivia deck (T199). */
  crew?: GroupKind;
  /**
   * The coin this try is for, as its card shows it (fix W3 T033): if the win's answer is lost and the card closes,
   * the map can open this coin's win card again from the checkpoint alone, even after the coin has left the map.
   */
  card?: CheckpointCard;
}

export interface CheckpointCard {
  readonly name: string;
  readonly coin_url?: string | null;
  readonly coins?: number;
  readonly experience?: number;
}

function cleanCard(card: unknown): CheckpointCard | null {
  const c = card as Partial<CheckpointCard> | null | undefined;
  if (!c || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 200) return null;
  return {
    name: c.name,
    ...(typeof c.coin_url === 'string' && c.coin_url.length < 2000 ? { coin_url: c.coin_url } : {}),
    ...(Number.isFinite(c.coins) ? { coins: c.coins } : {}),
    ...(Number.isFinite(c.experience) ? { experience: c.experience } : {}),
  };
}

const KEY_PATTERN = /^task_attempt_checkpoint_v1_(\d+)_(task|secret_task)_(\d+)$/;

/** The player, coin type and coin id a checkpoint key names, or null for any other key. */
export function parseTaskAttemptCheckpointKey(key: string): { playerId: number; taskType: TaskAttemptCheckpoint['taskType']; taskId: number } | null {
  const m = KEY_PATTERN.exec(key);
  if (!m) return null;
  return { playerId: Number(m[1]), taskType: m[2] as TaskAttemptCheckpoint['taskType'], taskId: Number(m[3]) };
}

/** Every saved try of this player (any coin), newest first. A broken one is skipped. */
export async function listTaskAttemptCheckpoints(playerId: number, nowMs = Date.now()): Promise<TaskAttemptCheckpoint[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter(key => parseTaskAttemptCheckpointKey(key)?.playerId === playerId);
  if (keys.length === 0) return [];
  const pairs = await AsyncStorage.multiGet(keys);
  const out: TaskAttemptCheckpoint[] = [];
  for (const [key, raw] of pairs) {
    const at = parseTaskAttemptCheckpointKey(key);
    const value = at ? parseTaskAttemptCheckpoint(raw, at.playerId, at.taskType, at.taskId, nowMs) : null;
    if (value) out.push(value);
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
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
    // Optional extras: a broken one is dropped, never the paid request itself.
    const { retryOf, pictureOnly, crew, card, ...paid } = value;
    const coinCard = cleanCard(card);
    return {
      ...paid,
      ...(Number.isInteger(retryOf) && (retryOf as number) > 0 ? { retryOf } : {}),
      ...(pictureOnly === true ? { pictureOnly: true } : {}),
      ...(crew === 'solo' || crew === 'couple' || crew === 'family' || crew === 'friends' ? { crew } : {}),
      ...(coinCard ? { card: coinCard } : {}),
    };
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
