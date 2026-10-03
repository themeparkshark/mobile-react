/**
 * Offline queue for haunt enter/done and reef finds (H1, H6, F1). Pure, unit
 * tested. Haunt buildings block the signal, so every write is queued with the
 * fix time it was made at and retried with backoff until the server answers.
 *
 * - One pending action per (kind, key): a newer one replaces the older.
 * - A clear server "no" (too far, not open, unknown spot...) drops the action.
 * - A network failure, "throttled" or "too_soon" retries later.
 * - An entry older than the server's 20-minute `at` bound is dropped; a done
 *   older than the 4-hour dwell cap is dropped.
 */
import type { FrightFix } from '../../api/endpoints/fright';
import type { FrightActionResult, FrightSide } from '../../api/endpoints/fright/types';
import { FRIGHT_DEFAULTS } from './config';

export type QueuedKind = 'enter' | 'done' | 'found';

export interface QueuedAction {
  readonly id: string;
  readonly kind: QueuedKind;
  readonly key: string;
  /** Event night the action belongs to (dropped once the night is over). */
  readonly nightOn: string;
  /** Server-corrected ms of the fix / tap. */
  readonly at: number;
  readonly fix?: FrightFix | null;
  readonly fixes?: readonly FrightFix[] | null;
  readonly side?: FrightSide | null;
  readonly tries: number;
  readonly nextAt: number;
}

const RETRY_ERRORS = new Set(['throttled', 'too_soon']);

export function actionId(kind: QueuedKind, key: string, nightOn: string): string {
  return `${kind}:${key}:${nightOn}`;
}

export function enqueue(queue: readonly QueuedAction[],
  action: Omit<QueuedAction, 'id' | 'tries' | 'nextAt'>, now: number): QueuedAction[] {
  const id = actionId(action.kind, action.key, action.nightOn);
  return [...queue.filter(item => item.id !== id), { ...action, id, tries: 0, nextAt: now }];
}

/** Retry delay after `tries` failures: 15 s, 30 s, 60 s ... capped at 5 min. */
export function backoffMs(tries: number): number {
  return Math.min(5 * 60_000, 15_000 * 2 ** Math.max(0, tries - 1));
}

function expired(action: QueuedAction, now: number): boolean {
  if (action.kind === 'enter') return now - action.at > FRIGHT_DEFAULTS.enterMaxAgeMs;
  return now - action.at > FRIGHT_DEFAULTS.runMaxMs;
}

/** Actions to send now, in order (an enter always goes before its done). Expired ones are pruned first. */
export function dueActions(queue: readonly QueuedAction[], now: number): QueuedAction[] {
  const order: Record<QueuedKind, number> = { enter: 0, done: 1, found: 2 };
  return queue.filter(item => !expired(item, now) && item.nextAt <= now)
    .sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind]);
}

export function pruneQueue(queue: readonly QueuedAction[], now: number, nightOn?: string | null): QueuedAction[] {
  return queue.filter(item => !expired(item, now) && (!nightOn || item.nightOn === nightOn));
}

export type QueueOutcome = 'sent' | 'dropped' | 'retry';

export function outcomeOf(result: FrightActionResult | null | undefined): QueueOutcome {
  if (result?.ok) return 'sent';
  if (!result || !result.error || RETRY_ERRORS.has(result.error)) return 'retry';
  return 'dropped';
}

/** Apply a send result to the queue. */
export function settle(queue: readonly QueuedAction[], id: string, result: FrightActionResult | null | undefined,
  now: number): { queue: QueuedAction[]; outcome: QueueOutcome } {
  const outcome = outcomeOf(result);
  if (outcome !== 'retry') return { queue: queue.filter(item => item.id !== id), outcome };
  return {
    outcome,
    queue: queue.map(item => item.id === id ? { ...item, tries: item.tries + 1, nextAt: now + backoffMs(item.tries + 1) } : item),
  };
}

/** Parse a stored queue defensively (AsyncStorage may hold anything). */
export function parseQueue(raw: string | null | undefined): QueuedAction[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string'
      && typeof item.key === 'string' && typeof item.at === 'number' && ['enter', 'done', 'found'].includes(item.kind)) : [];
  } catch {
    return [];
  }
}
