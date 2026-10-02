/**
 * useRally: owns one rally transport for the live Rally mode (design 11.3).
 * Returns the live room state (lobby, round, results) and the transport.
 */
import { useEffect, useMemo, useState } from 'react';
import { INITIAL_RACE_STATE, LabRaceTransport, type RaceState, type RaceTransport } from './raceTransport';

export function useRally(url: string | null, rideId: number, name: string): { transport: RaceTransport | null; state: RaceState } {
  const transport = useMemo(() => (url ? new LabRaceTransport(url) : null), [url]);
  const [state, setState] = useState<RaceState>(INITIAL_RACE_STATE);
  useEffect(() => {
    if (!transport) return undefined;
    const off = transport.subscribe(setState);
    transport.join(rideId, name);
    return () => {
      off();
      transport.close();
    };
  }, [transport, rideId, name]);
  return { transport, state };
}
