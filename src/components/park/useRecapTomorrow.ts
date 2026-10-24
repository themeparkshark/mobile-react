/**
 * The recap's last beat: one honest next step for tomorrow, from the Daily 3
 * streak ("Come back tomorrow for Day 5!", or the next milestone prize when it
 * is one day away). Nothing when Daily 3 is off on this server or the read
 * fails: never a made-up goal, never a timer.
 */
import { useEffect, useState } from 'react';
import { getDailyThree } from '../../api/endpoints/retention';
import { loadRetentionFlags } from '../../services/retention/flags';
import { tomorrowLine } from '../../services/retention/logic';

export default function useRecapTomorrow(enabled: boolean): string | null {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) { setLine(null); return undefined; }
    let active = true;
    void loadRetentionFlags().then(flags => {
      if (!active || !flags?.dailyThree) return undefined;
      return getDailyThree(4000).then(state => { if (active && state.enabled) setLine(tomorrowLine(state)); });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [enabled]);
  return line;
}
