/**
 * The recap's last beat: one honest next step for tomorrow, from the Daily 3
 * streak ("Come back tomorrow for Day 5!", or the next milestone prize when it
 * is one day away). Nothing when Daily 3 is off on this server or the read
 * fails: never a made-up goal, never a timer.
 */
import { useEffect, useState } from 'react';
import { getDailyThree } from '../../api/endpoints/retention';
import { loadRetentionFlagsFresh } from '../../services/retention/flags';
import { tomorrowLine } from '../../services/retention/logic';

/** Tomorrow as a picture: the flame with its next day number, and a gift when that day holds a prize. */
export interface RecapTomorrowInfo {
  readonly line: string;
  /** Tomorrow's streak day (the number on the flame), or null when there is no flame yet. */
  readonly nextDay: number | null;
  /** Tomorrow's day holds a milestone prize. */
  readonly prize: boolean;
}

export default function useRecapTomorrow(enabled: boolean): RecapTomorrowInfo | null {
  const [line, setLine] = useState<RecapTomorrowInfo | null>(null);
  useEffect(() => {
    if (!enabled) { setLine(null); return undefined; }
    let active = true;
    void loadRetentionFlagsFresh().then(flags => {
      if (!active || !flags?.dailyThree) return undefined;
      return getDailyThree(4000).then(state => {
        if (!active || !state.enabled) return;
        setLine({
          line: tomorrowLine(state),
          nextDay: state.streak.days > 0 ? state.streak.days + 1 : null,
          prize: state.streak.next_milestone?.days_away === 1,
        });
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [enabled]);
  return line;
}
