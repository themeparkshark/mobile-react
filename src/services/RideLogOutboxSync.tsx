import { useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthProvider';
import { drainRideLogs, setRideLogOutboxPlayer } from './rideLogOutbox';

/**
 * Tells the ride outbox who is signed in, and sends that player's rides kept on
 * the phone (logged in a dead zone) as soon as they sign in, even if the Ride
 * Tracker is never reopened. After that the outbox also retries each time the
 * app comes back to the front. Signed out, nothing is sent.
 */
export default function RideLogOutboxSync() {
  const { player } = useContext(AuthContext);
  const playerId = player?.id ?? null;
  useEffect(() => {
    setRideLogOutboxPlayer(playerId);
    if (playerId !== null) void drainRideLogs().catch(() => undefined);
    return () => setRideLogOutboxPlayer(null);
  }, [playerId]);
  return null;
}
