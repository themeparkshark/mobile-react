import { useRung } from '../../services/reveal/revealLadder';

/**
 * Shark Events arrive on their rung (core loop blueprint 4.4, rung 9): only
 * while an event is scheduled and after Daily 3 has unlocked. Until then the
 * chips, banners, toasts and Star Ride badges stay hidden (the server keeps
 * counting points). The dev preview screen (EXPO_PUBLIC_LIVE_EVENT_PREVIEW)
 * always shows them.
 */
export function useEventsOpen(): boolean {
  const open = useRung('events').open;
  return open || (__DEV__ && !!process.env.EXPO_PUBLIC_LIVE_EVENT_PREVIEW);
}
