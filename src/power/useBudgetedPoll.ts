/**
 * useBudgetedPoll: a repeating refresh on the app's one poll clock.
 * Pauses in the background (unless backgroundMs), slows while idle or on
 * Battery Saver. Runs right away on mount and whenever `key` changes (a new
 * park); other changes (enabled toggling, a new interval) keep the schedule,
 * so they never cost an extra fetch.
 */
import { useEffect, useRef } from 'react';
import { pollCoordinator } from './pollCoordinator';

let seq = 0;

export interface BudgetedPollOptions {
  readonly enabled?: boolean;
  readonly backgroundMs?: number | null;
  readonly immediate?: boolean;
  /** A new key (park id, player id) starts over and runs at once. */
  readonly key?: string | number | null;
}

/** The coordinator id for a hook instance and key. Exported for tests. */
export function pollId(instance: string, key: string | number | null | undefined): string {
  return key === null || key === undefined ? instance : `${instance}:${key}`;
}

export default function useBudgetedPoll(run: () => unknown, intervalMs: number, options: BudgetedPollOptions = {}): void {
  const { enabled = true, backgroundMs = null, immediate = true, key = null } = options;
  const runRef = useRef(run);
  runRef.current = run;
  const instance = useRef<string>('');
  if (!instance.current) instance.current = `poll-${++seq}`;
  const started = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!enabled || !(intervalMs > 0)) return undefined;
    const id = pollId(instance.current, key);
    const first = !started.current.has(id);
    started.current.add(id);
    return pollCoordinator.register({ id, run: () => runRef.current(), intervalMs, backgroundMs }, first && immediate);
  }, [enabled, intervalMs, backgroundMs, immediate, key]);
}
