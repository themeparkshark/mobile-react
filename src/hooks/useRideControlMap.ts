import { useCallback, useEffect, useRef, useState } from 'react';
import { getRideControl, type RideControlPark } from '../api/endpoints/parks/rideControl';
import { isRideControlFrame, preferFreshRideControl } from '../services/boss/mapImpact';

/** Every response belongs to its player/park; explicit result refreshes supersede older polls. */
export default function useRideControlMap({ playerId, parkId }: { playerId: number | null; parkId: number | null }) {
  const key = `${playerId}:${parkId}`;
  const current = useRef(key), mounted = useRef(false), request = useRef(0);
  const frame = useRef<{ key: string; control: RideControlPark } | null>(null);
  current.current = key;
  const [selection, setSelection] = useState<typeof frame.current>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current += 1; }; }, []);
  const refresh = useCallback(async (): Promise<RideControlPark | null> => {
    if (!parkId || !playerId) return null;
    const generation = ++request.current;
    try {
      const incoming = await getRideControl(parkId);
      if (!mounted.current || current.current !== key || request.current !== generation || !isRideControlFrame(incoming)) return null;
      const control = preferFreshRideControl(frame.current?.key === key ? frame.current.control : null, incoming);
      frame.current = { key, control };
      setSelection(frame.current);
      return control;
    } catch { return null; }
  }, [key, parkId, playerId]);
  useEffect(() => {
    request.current += 1;
    void refresh();
    if (!parkId || !playerId) return;
    const timer = setInterval(() => { void refresh(); }, 20000);
    return () => { clearInterval(timer); request.current += 1; };
  }, [refresh, key]);
  return { control: selection?.key === key ? selection.control : null, refresh };
}
