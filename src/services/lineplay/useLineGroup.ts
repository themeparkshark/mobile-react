import { useCallback, useEffect, useRef, useState } from 'react';
import type { LineGroup } from './lineGroup';
import { loadLastCrew, loadWaitGroup, saveWaitGroup } from './lineGroupStore';

export interface LineGroupState {
  /** Storage answered for this wait (so the opener never flashes on a restore). */
  readonly loaded: boolean;
  /** "Who's in line?" was answered for this wait (solo counts). */
  readonly chosen: boolean;
  readonly group: LineGroup | null;
  /** The crew from an earlier ride today, offered as one tap. */
  readonly lastCrew: LineGroup | null;
  readonly choose: (group: LineGroup | null) => void;
  readonly update: (change: (group: LineGroup) => LineGroup) => void;
}

/** Local-only crew for the current wait. `waitKey` is null until the wait has started. */
export function useLineGroup(playerId: number | null, waitKey: string | null): LineGroupState {
  const [state, setState] = useState<{ key: string | null; loaded: boolean; chosen: boolean; group: LineGroup | null }>(
    { key: null, loaded: false, chosen: false, group: null });
  const [lastCrew, setLastCrew] = useState<LineGroup | null>(null);
  const groupRef = useRef<LineGroup | null>(null);
  const target = useRef<{ playerId: number | null; waitKey: string | null }>({ playerId, waitKey });
  target.current = { playerId, waitKey };

  useEffect(() => {
    groupRef.current = null;
    setState({ key: waitKey, loaded: false, chosen: false, group: null });
    if (!waitKey) return;
    // No account yet (preview builds): the crew lives in memory for this wait.
    if (playerId == null) { setState({ key: waitKey, loaded: true, chosen: false, group: null }); return; }
    let alive = true;
    void Promise.all([loadWaitGroup(playerId, waitKey), loadLastCrew(playerId)]).then(([saved, crew]) => {
      if (!alive) return;
      groupRef.current = saved.group;
      setLastCrew(crew);
      setState({ key: waitKey, loaded: true, chosen: saved.chosen, group: saved.group });
    });
    return () => { alive = false; };
  }, [playerId, waitKey]);

  const persist = useCallback((group: LineGroup | null) => {
    const { playerId: id, waitKey: key } = target.current;
    groupRef.current = group;
    setState({ key, loaded: true, chosen: true, group });
    if (id != null && key) void saveWaitGroup(id, key, group);
  }, []);

  const update = useCallback((change: (group: LineGroup) => LineGroup) => {
    const current = groupRef.current;
    if (!current) return;
    const next = change(current);
    if (next !== current) persist(next);
  }, [persist]);

  const sameWait = state.key === waitKey;
  return {
    loaded: sameWait && state.loaded,
    chosen: sameWait && state.chosen,
    group: sameWait ? state.group : null,
    lastCrew,
    choose: persist,
    update,
  };
}
