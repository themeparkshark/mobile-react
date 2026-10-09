/**
 * useLivePoll: a repeating refresh that sleeps while nobody can see it.
 *
 * Replaces `setInterval(load, ms)`. The poll pauses while the app is in the
 * background (unless `backgroundMs` asks for a slower background rate) and
 * while its screen is out of focus, then catches up once on return if a
 * refresh came due. Changing `key` (a new park, a new player) starts over and
 * runs right away. See livePollPolicy.ts for the rules.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { pollDelay, pollIntervalFor } from './livePollPolicy';
import { usePowerBudget } from '../power';

let appStateNow: AppStateStatus | undefined = AppState.currentState;
const appStateListeners = new Set<() => void>();
let appStateSubscription: { remove: () => void } | null = null;

function subscribeAppState(listener: () => void): () => void {
  appStateListeners.add(listener);
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', state => {
      if (state === appStateNow) return;
      appStateNow = state;
      appStateListeners.forEach(fn => fn());
    });
  }
  return () => {
    appStateListeners.delete(listener);
    if (!appStateListeners.size && appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
  };
}

/** 'inactive' (Control Center, an incoming call banner) still counts as on screen. */
const isActive = () => appStateNow !== 'background';

/** True while the app is in the foreground. One shared AppState listener for every caller. */
export function useAppActive(): boolean {
  return useSyncExternalStore(subscribeAppState, isActive, isActive);
}

export interface LivePollOptions {
  /** False pauses the poll (no park, no player). Default true. */
  readonly enabled?: boolean;
  /** The screen showing this data is focused. Default true. */
  readonly focused?: boolean;
  /** Keep polling in the background at this slower rate. Default: pause. */
  readonly backgroundMs?: number | null;
  /** A new key resets the schedule and runs immediately. */
  readonly key?: string | number | null;
  /** Run as soon as the poll starts (default). False waits one interval first. */
  readonly immediate?: boolean;
}

export default function useLivePoll(run: () => unknown, intervalMs: number, options: LivePollOptions = {}): void {
  const { enabled = true, focused = true, backgroundMs = null, key = null, immediate = true } = options;
  const appActive = useAppActive();
  // Battery Saver stretches every live poll. Only Saver: idle slow-down is
  // already applied by callers (idlePollInterval), so the two never stack.
  const { lowPower, pollMultiplier } = usePowerBudget();
  const scaled = lowPower && Number.isFinite(pollMultiplier) ? Math.round(intervalMs * Math.max(1, pollMultiplier)) : intervalMs;
  const runRef = useRef(run);
  runRef.current = run;
  const lastRunAt = useRef<number | null>(immediate ? null : Date.now());
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    lastRunAt.current = immediate ? null : Date.now();
  }

  useEffect(() => {
    const interval = pollIntervalFor({ enabled, appActive, focused }, scaled, backgroundMs);
    if (interval === null) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      lastRunAt.current = Date.now();
      try {
        const result = runRef.current();
        if (result && typeof (result as Promise<unknown>).catch === 'function') {
          (result as Promise<unknown>).catch(() => undefined);
        }
      } catch {
        // A failed refresh keeps the last data; the next tick retries.
      }
      if (!stopped) timer = setTimeout(tick, interval);
    };
    const delay = pollDelay(lastRunAt.current, Date.now(), interval);
    // Due now (first run, new key, overdue on return): run inside this effect,
    // in order with the caller's other effects, like the setInterval it replaced.
    if (delay === 0) tick();
    else timer = setTimeout(tick, delay);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, appActive, focused, scaled, backgroundMs, key]);
}
