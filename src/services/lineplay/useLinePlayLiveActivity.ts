import { useEffect, useRef } from 'react';
import { LinePlayActivity, type LinePlayActivityState } from '../../../modules/lineplay-activity';
import { partCountdown } from './partCountdown';

interface Input {
  readonly rideName: string;
  readonly state: string; // session state: active | paused | ending | complete ...
  readonly rewardTracking: boolean;
  readonly creditedParts: number | null;
  readonly verifiedEligibleSeconds: number;
  readonly verifiedPresenceAt: number | null;
  readonly partIntervalSeconds: number;
  readonly sessionPartCap: number;
  readonly partsRemainingToday: number | null;
}

/**
 * Mirrors the Ride Part meter onto the Lock Screen and Dynamic Island so a
 * guest can pocket the phone and still watch the next Part arrive. Only runs
 * while server-verified queue rewards are live; the system animates the
 * countdown, so updates are sent only when something meaningful changes.
 */
export function useLinePlayLiveActivity(input: Input) {
  const started = useRef(false);
  const lastSent = useRef<LinePlayActivityState | null>(null);

  const interval = Math.max(1, input.partIntervalSeconds);
  const now = Date.now();
  const countdown = partCountdown(input.verifiedEligibleSeconds, input.verifiedPresenceAt, now, interval);
  const potential = Math.floor(input.verifiedEligibleSeconds / interval);
  const capped = potential >= input.sessionPartCap || input.partsRemainingToday === 0;
  const paused = input.state === 'paused';
  const checking = countdown.needsCheck || countdown.checking;
  const next: LinePlayActivityState = {
    parts: input.creditedParts ?? 0,
    nextPartAtMs: capped || paused || checking ? null : now + countdown.remainingSeconds * 1000,
    intervalSeconds: interval,
    status: capped ? 'Max Parts today' : paused ? 'Paused'
      : countdown.needsCheck ? 'Checking you’re in line' : countdown.checking ? 'Part on the way' : '',
    paused,
  };
  const live = input.rewardTracking && (input.state === 'active' || input.state === 'paused');

  useEffect(() => {
    if (!live) return;
    const prev = lastSent.current;
    const drift = prev?.nextPartAtMs != null && next.nextPartAtMs != null
      ? Math.abs(prev.nextPartAtMs - next.nextPartAtMs) : 0;
    const changed = !prev || prev.parts !== next.parts || prev.paused !== next.paused ||
      prev.status !== next.status || (prev.nextPartAtMs == null) !== (next.nextPartAtMs == null) || drift > 20_000;
    if (!changed) return;
    lastSent.current = next;
    if (!started.current) {
      started.current = true;
      void LinePlayActivity.start(input.rideName, next).then((ok) => { if (!ok) started.current = false; });
    } else {
      void LinePlayActivity.update(next);
    }
  });

  // End on completion, on leaving LinePlay, or when rewards stop being tracked.
  useEffect(() => {
    if (live || !started.current) return;
    started.current = false;
    void LinePlayActivity.end(lastSent.current ? { ...lastSent.current, nextPartAtMs: null,
      status: `${lastSent.current.parts} Ride Part${lastSent.current.parts === 1 ? '' : 's'} earned`, paused: false } : null);
    lastSent.current = null;
  }, [live]);
  useEffect(() => () => {
    if (!started.current) return;
    started.current = false;
    void LinePlayActivity.end(lastSent.current ? { ...lastSent.current, nextPartAtMs: null,
      status: `${lastSent.current.parts} Ride Part${lastSent.current.parts === 1 ? '' : 's'} earned`, paused: false } : null);
  }, []);
}
