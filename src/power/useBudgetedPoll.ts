/**
 * useBudgetedPoll: a repeating refresh on the app's one poll clock.
 * Pauses in the background (unless backgroundMs), slows while idle or on
 * Battery Saver, and runs right away on mount. Drop-in for setInterval.
 */
import { useEffect, useRef } from 'react';
import { pollCoordinator } from './pollCoordinator';

let seq = 0;

export interface BudgetedPollOptions {
  readonly enabled?: boolean;
  readonly backgroundMs?: number | null;
  readonly immediate?: boolean;
}

export default function useBudgetedPoll(run: () => unknown, intervalMs: number, options: BudgetedPollOptions = {}): void {
  const { enabled = true, backgroundMs = null, immediate = true } = options;
  const runRef = useRef(run);
  runRef.current = run;
  const idRef = useRef<string>('');
  if (!idRef.current) idRef.current = `poll-${++seq}`;
  useEffect(() => {
    if (!enabled || !(intervalMs > 0)) return undefined;
    return pollCoordinator.register({ id: idRef.current, run: () => runRef.current(), intervalMs, backgroundMs }, immediate);
  }, [enabled, intervalMs, backgroundMs, immediate]);
}
