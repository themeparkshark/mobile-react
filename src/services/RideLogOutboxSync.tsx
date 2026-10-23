import { useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthProvider';
import { drainRideLogs } from './rideLogOutbox';

/**
 * Sends rides kept on the phone (logged in a dead zone) once a player is signed
 * in, even if the Ride Tracker is never reopened. After that the outbox also
 * retries each time the app comes back to the front.
 */
export default function RideLogOutboxSync() {
  const { player } = useContext(AuthContext);
  useEffect(() => {
    if (player?.id) void drainRideLogs().catch(() => undefined);
  }, [player?.id]);
  return null;
}
