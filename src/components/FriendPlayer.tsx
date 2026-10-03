/**
 * Legacy entry point (Profile's friend preview). Draws the Social v2 row: the
 * player's real shark, their name and level, and one action that matches
 * where you stand with them. Remove and Block live on the profile.
 */
import PlayerRow from '../screens/social/PlayerRow';
import { effectiveStatus, type FriendStatus } from '../screens/social/socialModel';
import { useFriendOverrides } from '../screens/social/socialStore';
import { PlayerType } from '../models/player-type';

export default function FriendPlayer({
  isFriend,
  isPending,
  player,
  inset,
}: {
  readonly isFriend?: boolean;
  readonly isPending?: boolean;
  /** @deprecated rows no longer remove friends; kept so callers compile. */
  readonly onAccept?: () => void;
  /** @deprecated rows no longer remove friends; kept so callers compile. */
  readonly onRemove?: () => void;
  readonly player: PlayerType;
  /** Inside a card that already has its own padding. */
  readonly inset?: boolean;
}) {
  const overrides = useFriendOverrides();
  const fallback: FriendStatus = isFriend ? 'friends' : isPending ? 'incoming' : 'none';
  return <PlayerRow player={player} status={effectiveStatus(player, overrides, fallback)} inset={inset} />;
}
