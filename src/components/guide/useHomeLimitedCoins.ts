/**
 * The next park's limited coins, for the home guide's LIMITED COIN step (fix pass w4, T007). One light read
 * per park per 10 minutes (shared across remounts); a failed read just means no limited step, never an error.
 */
import { useEffect, useState } from 'react';
import getLimitedTasks from '../../api/endpoints/parks/getLimitedTasks';
import type { TaskType } from '../../models/task-type';

const FRESH_MS = 10 * 60_000;
const cache = new Map<number, { at: number; tasks: readonly TaskType[] }>();
const EMPTY: readonly TaskType[] = [];

export default function useHomeLimitedCoins(parkId: number | null | undefined): readonly TaskType[] {
  const [tasks, setTasks] = useState<readonly TaskType[]>(() => (parkId != null ? cache.get(parkId)?.tasks ?? EMPTY : EMPTY));
  useEffect(() => {
    if (parkId == null) { setTasks(EMPTY); return undefined; }
    const hit = cache.get(parkId);
    if (hit) setTasks(hit.tasks);
    if (hit && Date.now() - hit.at < FRESH_MS) return undefined;
    let live = true;
    getLimitedTasks(parkId).then(list => {
      const clean = Array.isArray(list) ? list : EMPTY;
      cache.set(parkId, { at: Date.now(), tasks: clean });
      if (live) setTasks(clean);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [parkId]);
  return tasks;
}
