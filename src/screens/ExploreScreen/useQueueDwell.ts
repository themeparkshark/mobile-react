import { useEffect, useState } from 'react';
import { currentRideDwell } from '../../services/RideDetectionService';

export interface QueueDwell { readonly rideId: number; readonly rideName: string; readonly parkId: number }

/**
 * Polls the ride detector for a 90 s dwell at one attraction in this park.
 * The line always moves, so the dwell only has to stay inside the ride's zone,
 * not still. Stops when the map is not focused.
 */
export default function useQueueDwell(parkId: number | null, enabled: boolean, read = currentRideDwell, everyMs = 10_000): QueueDwell | null {
  const [dwell, setDwell] = useState<QueueDwell | null>(null);
  useEffect(() => {
    if (!enabled || !parkId) { setDwell(null); return; }
    const check = () => {
      const now = read();
      setDwell(previous => {
        if (!now || now.parkId !== parkId) return null;
        return previous?.rideId === now.rideId ? previous : { rideId: now.rideId, rideName: now.rideName, parkId: now.parkId };
      });
    };
    check();
    const timer = setInterval(check, everyMs);
    return () => clearInterval(timer);
  }, [parkId, enabled, read, everyMs]);
  return dwell;
}
