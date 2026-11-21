/**
 * A server-granted win always shows its win card (fix round W3, T033).
 *
 * The win is the server's, but its answer can be lost (no signal, a slow
 * server, the app closed mid-resolve) and the card that would have shown it
 * can be gone by then. The try's checkpoint stays on the phone until a card
 * has shown how the try ended, so the map asks here: any saved try the server
 * says was won comes back as its win card. A try the server says was lost is
 * cleared quietly (its card is old news). A try that ran out because the app
 * was closed mid game is cleared too, but what it cost came back (the Ticket,
 * the free try or the extra try), so the coin's card says so once, in one line,
 * the next time it opens (fix pass w5, SAFETY-shutdown-extra-try). A try still
 * being played stays (PLAY! at that ride picks it up). Pure apart from the
 * storage and the one read per saved try. No em dashes.
 */
import { getTaskAttempt, type TaskAttempt } from '../../api/endpoints/me/task-attempts';
import {
  listTaskAttemptCheckpoints, removeTaskAttemptCheckpoint, type TaskAttemptCheckpoint,
} from './checkpoint';

/** Wins whose card has shown in this run of the app: never shown twice while their checkpoint is being cleared. */
const shownWins = new Set<number>();
export function markWinShown(attemptId: number | null | undefined): void {
  if (typeof attemptId === 'number') shownWins.add(attemptId);
}

export interface PendingWin {
  readonly checkpoint: TaskAttemptCheckpoint & { card: NonNullable<TaskAttemptCheckpoint['card']> };
  readonly attempt: TaskAttempt;
}

/**
 * The one line a coin card shows after a try at that ride ran out unplayed (the app was shut mid game): what it cost
 * came back. The server gives it back once (core_loop.expired_try_back on the target; a Ticket always comes back).
 * Null for anything but an expired try.
 */
export function returnedTryLine(attempt: Pick<TaskAttempt, 'status' | 'ticket_cost' | 'rescue_pass' | 'rescue_source'>): string | null {
  if (attempt.status !== 'expired') return null;
  if (attempt.ticket_cost > 0) return 'Game not finished. Your Ticket came back.';
  if (!attempt.rescue_pass) return null;
  return attempt.rescue_source === 'held' || attempt.rescue_source === 'held_retry'
    ? 'Game not finished. Your extra try came back.'
    : 'Game not finished. Your free try came back.';
}

/** Lines waiting for their coin's card, in this run of the app (key: task type and id). Each shows once. */
const returnedTries = new Map<string, string>();
const tryKey = (taskType: string, taskId: number) => `${taskType}:${taskId}`;

export function noteReturnedTry(taskType: string, taskId: number, line: string | null): void {
  if (line) returnedTries.set(tryKey(taskType, taskId), line);
}

/** The card for this coin opened: its waiting line, once (the next card at this coin is a normal one). */
export function takeReturnedTry(taskType: string | null | undefined, taskId: number | null | undefined): string | null {
  if (!taskType || taskId == null) return null;
  const key = tryKey(taskType, taskId);
  const line = returnedTries.get(key) ?? null;
  returnedTries.delete(key);
  return line;
}

/** What to do with one saved try, from the server's answer. */
export function pendingTryAction(status: string | null | undefined): 'show_win' | 'clear' | 'keep' {
  if (status === 'won') return 'show_win';
  if (status === 'lost' || status === 'expired') return 'clear';
  return 'keep';
}

/**
 * P19 (bug 8): a won try's card comes back only on the map of the park that started it, so it always shows its own
 * park's numbers and opens its own shelf. A card with no park (saved by an older build) cannot prove where it belongs
 * and stays put. `here` undefined means the caller does not filter (tests of the older rule).
 */
export function winBelongsHere(cardParkId: number | null | undefined, here: number | null | undefined): boolean {
  if (here === undefined) return true;
  return typeof cardParkId === 'number' && here != null && cardParkId === here;
}

/**
 * The newest saved try the server says was won and that still carries its coin's card, or null. Every read is
 * best effort: a failed one keeps the checkpoint for the next look (`unsure` says so, so the map can look again).
 * A win from another park is kept for that park's map (it ages out with its checkpoint).
 */
export async function findPendingWin(playerId: number | null | undefined, skipTaskIds: ReadonlySet<number> = new Set(),
  parkId?: number | null): Promise<{ win: PendingWin | null; unsure: boolean }> {
  if (playerId == null) return { win: null, unsure: false };
  let unsure = false;
  let saved: TaskAttemptCheckpoint[];
  try { saved = await listTaskAttemptCheckpoints(playerId); } catch { return { win: null, unsure: true }; }
  for (const checkpoint of saved) {
    if (checkpoint.attemptId == null || skipTaskIds.has(checkpoint.taskId)) continue;
    if (checkpoint.card && !winBelongsHere(checkpoint.card.park_id, parkId)) continue;
    if (shownWins.has(checkpoint.attemptId)) {
      await removeTaskAttemptCheckpoint(checkpoint.playerId, checkpoint.taskType, checkpoint.taskId).catch(() => undefined);
      continue;
    }
    let attempt: TaskAttempt;
    try { attempt = (await getTaskAttempt(checkpoint.attemptId)).attempt; } catch { unsure = true; continue; }
    const action = pendingTryAction(attempt.status);
    if (action === 'clear') {
      noteReturnedTry(checkpoint.taskType, checkpoint.taskId, returnedTryLine(attempt));
      await removeTaskAttemptCheckpoint(checkpoint.playerId, checkpoint.taskType, checkpoint.taskId).catch(() => undefined);
    } else if (action === 'show_win' && checkpoint.card) {
      return { win: { checkpoint: checkpoint as PendingWin['checkpoint'], attempt }, unsure };
    }
  }
  return { win: null, unsure };
}

/** The card's coin, rebuilt from the checkpoint, for the map to open its win card with. */
export function pendingWinRedeemable(win: PendingWin): { type: 'task' | 'secret_task'; model: Record<string, unknown> } {
  const card = win.checkpoint.card;
  return {
    type: win.checkpoint.taskType,
    model: { id: win.checkpoint.taskId, name: card.name, coin_url: card.coin_url ?? null, coins: card.coins ?? 0,
      experience: card.experience ?? 0, ticket_cost: win.attempt.ticket_cost, times_completed: 1,
      ...(typeof card.park_id === 'number' ? { park_id: card.park_id } : {}) },
  };
}
