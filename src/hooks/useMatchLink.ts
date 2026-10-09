/**
 * useMatchLink: React wiring for MatchLinkController (services/match/matchLink).
 *
 * The screen keeps its own poll; it reports each result with `ok()` or
 * `fail(error)`. While the link is down this hook retries with backoff,
 * pauses in the background, retries at once on return, and exposes the
 * phase the screen shows: live, "Reconnecting...", or lost (offer to leave).
 * A new `key` (another park, another player) starts clean.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MatchLinkController, type LinkPhase } from '../services/match/matchLink';
import { useAppActive } from './appActive';

const clock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface MatchLink {
  readonly phase: LinkPhase;
  readonly ok: () => void;
  readonly fail: (error?: unknown) => void;
  /** "Try again": a fresh window and an immediate retry. */
  readonly retryNow: () => void;
}

/** `enabled` false (screen out of focus, nothing to load) pauses retries like the background does. */
export default function useMatchLink(retry: () => void, key: string | number | null = null, enabled = true): MatchLink {
  const appActive = useAppActive();
  const retryRef = useRef(retry);
  retryRef.current = retry;
  const [phase, setPhase] = useState<LinkPhase>('live');
  const controller = useRef<MatchLinkController | null>(null);
  if (!controller.current) {
    controller.current = new MatchLinkController(() => retryRef.current(), setPhase, clock);
  }

  useEffect(() => {
    controller.current?.revive();
    return () => controller.current?.dispose();
  }, []);
  const firstKey = useRef(true);
  useEffect(() => {
    if (firstKey.current) { firstKey.current = false; return; }
    controller.current?.reset();
  }, [key]);
  useEffect(() => { controller.current?.setActive(appActive && enabled); }, [appActive, enabled]);

  const ok = useCallback(() => controller.current?.ok(), []);
  const fail = useCallback((error?: unknown) => controller.current?.fail(error), []);
  const retryNow = useCallback(() => controller.current?.retryNow(), []);
  return { phase, ok, fail, retryNow };
}
