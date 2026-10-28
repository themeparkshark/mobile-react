import { useRung } from '../../services/reveal/revealLadder';

/**
 * The Pins door on Profile (core loop 5.9, rung 8, FEEDS_CORE). For the Profile
 * owner (shelf-words) to import: `show` is true while Pin of the Day is on or
 * the player owns a pin (pins you own never hide); `isNew` is the door's one
 * NEW tag at level 3; Pins clears it when it opens (PinsScreen calls markSeen).
 */
export function usePinsDoor(): { show: boolean; isNew: boolean; markSeen(): void } {
  const { open, isNew, markSeen } = useRung('pins');
  return { show: open, isNew, markSeen };
}
