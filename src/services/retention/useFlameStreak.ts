import { useEffect, useRef, useState } from 'react';
import { getDailyThree } from '../../api/endpoints/retention';
import { loadRetentionFlags, retentionFlagsNow, streakOwner } from './flags';
import { ownStreakOf } from './useOwnStreak';
import { useRung } from '../reveal/revealLadder';

/**
 * The one flame number (see streakOwner): the Daily 3 streak while Daily 3 is
 * on. The daily chest's day ladder is never a streak (core loop 4.5), so a
 * 'chest' owner (an older caller) shows nothing. Null while unknown, so the
 * row waits instead of showing a number that disagrees with the Daily 3 button.
 */
export function flameStreak(owner: 'daily3' | 'chest' | null, chest: number | null | undefined, daily3: number | null): number | null {
  void chest;
  if (owner === 'daily3') return daily3;
  return null;
}

/**
 * Reads the flags (cached per run) and, while Daily 3 is on, its streak: once
 * when the map mounts, so the menu's Day streak row is decided before the
 * first open (the menu never grows after it opens), then again each time
 * `active` turns true. Closing the menu reads nothing.
 */
export default function useFlameStreak(chest: number | null | undefined, active: boolean) {
  // The flame arrives with Daily 3 (rung 4): before that there is no streak number anywhere.
  const dailyOpen = useRung('daily').open;
  const [owner, setOwner] = useState(() => streakOwner(retentionFlagsNow()));
  const [daily3, setDaily3] = useState<number | null>(null);
  const warmed = useRef(false);
  useEffect(() => {
    if (!active && warmed.current) return undefined;
    warmed.current = true;
    let live = true;
    void loadRetentionFlags().then(flags => {
      if (!live || !flags) return;
      const next = streakOwner(flags);
      setOwner(next);
      if (next !== 'daily3') return;
      void getDailyThree().then(p => { if (live) setDaily3(ownStreakOf(p)?.days ?? null); }).catch(() => undefined);
    });
    return () => { live = false; };
  }, [active]);
  return { owner, streak: dailyOpen ? flameStreak(owner, chest, daily3) : null };
}
