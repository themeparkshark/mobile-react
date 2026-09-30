/**
 * useSessionRestore: read back the exact state a game was holding when the
 * app was backgrounded (or killed in a pocket), so the run continues where it
 * stopped. Pair with GameShellV2's sessionKey + getSnapshot props.
 *
 *   const { snapshot, ready } = useSessionRestore<WhackState>(sessionKey);
 *   useEffect(() => { if (ready && snapshot) restoreWhack(snapshot.state, snapshot.simMs); }, [ready]);
 */

import { useCallback, useEffect, useState } from 'react';
import type { SessionSnapshot } from '../core/session';
import { clearSnapshot, loadSnapshot } from './snapshotStore';

export function useSessionRestore<T = unknown>(sessionKey?: string | null): {
  snapshot: SessionSnapshot<T> | null;
  ready: boolean;
  clear: () => void;
} {
  const [snapshot, setSnapshot] = useState<SessionSnapshot<T> | null>(null);
  const [ready, setReady] = useState(!sessionKey);

  useEffect(() => {
    let live = true;
    if (!sessionKey) {
      setSnapshot(null);
      setReady(true);
      return undefined;
    }
    setReady(false);
    void loadSnapshot<T>(sessionKey).then((snap) => {
      if (!live) return;
      setSnapshot(snap);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [sessionKey]);

  const clear = useCallback(() => {
    setSnapshot(null);
    if (sessionKey) void clearSnapshot(sessionKey);
  }, [sessionKey]);

  return { snapshot, ready, clear };
}
