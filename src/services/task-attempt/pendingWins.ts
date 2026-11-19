/**
 * A server-granted win always shows its win card (fix round W3, T033).
 *
 * The win is the server's, but its answer can be lost (no signal, a slow
 * server, the app closed mid-resolve) and the card that would have shown it
 * can be gone by then. The try's checkpoint stays on the phone until a card
 * has shown how the try ended, so the map asks here: any saved try the server
 * says was won comes back as its win card. A try the server says was lost or
 * ran out is cleared quietly (its card is old news); a try still being played
 * stays (PLAY! at that ride picks it up). Pure apart from the storage and the
 * one read per saved try. No em dashes.
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

/** What to do with one saved try, from the server's answer. */
export function pendingTryAction(status: string | null | undefined): 'show_win' | 'clear' | 'keep' {
  if (status === 'won') return 'show_win';
  if (status === 'lost' || status === 'expired') return 'clear';
  return 'keep';
}

/**
 * The newest saved try the server says was won and that still carries its coin's card, or null. Every read is
 * best effort: a failed one keeps the checkpoint for the next look (`unsure` says so, so the map can look again).
 */
export async function findPendingWin(playerId: number | null | undefined, skipTaskIds: ReadonlySet<number> = new Set()):
  Promise<{ win: PendingWin | null; unsure: boolean }> {
  if (playerId == null) return { win: null, unsure: false };
  let unsure = false;
  let saved: TaskAttemptCheckpoint[];
  try { saved = await listTaskAttemptCheckpoints(playerId); } catch { return { win: null, unsure: true }; }
  for (const checkpoint of saved) {
    if (checkpoint.attemptId == null || skipTaskIds.has(checkpoint.taskId)) continue;
    if (shownWins.has(checkpoint.attemptId)) {
      await removeTaskAttemptCheckpoint(checkpoint.playerId, checkpoint.taskType, checkpoint.taskId).catch(() => undefined);
      continue;
    }
    let attempt: TaskAttempt;
    try { attempt = (await getTaskAttempt(checkpoint.attemptId)).attempt; } catch { unsure = true; continue; }
    const action = pendingTryAction(attempt.status);
    if (action === 'clear') {
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
      experience: card.experience ?? 0, ticket_cost: 1, times_completed: 1 },
  };
}
