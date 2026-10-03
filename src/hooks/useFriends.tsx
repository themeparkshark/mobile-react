import { useCallback, useContext, useMemo } from 'react';
import acceptFriendRequest from '../api/endpoints/players/accept-friend-request';
import cancelFriendRequest from '../api/endpoints/players/cancel-friend-request';
import denyFriendRequest from '../api/endpoints/players/deny-friend-request';
import sendFriendRequest from '../api/endpoints/players/send-friend-request';
import unfriend from '../api/endpoints/players/unfriend';
import { blockPlayer, unblockPlayer } from '../api/endpoints/players/block';
import createCompliment from '../api/endpoints/compliments/create';
import { AuthContext } from '../context/AuthProvider';
import { haptic } from '../gamekit/Haptics';
import { playSfx } from '../gamekit/SFX';
import { PlayerType } from '../models/player-type';
import { nextStatus, statusOf, type FriendStatus, type FriendVerb } from '../screens/social/socialModel';
import { adjustPendingIncoming, getOverrides, setStatus } from '../screens/social/socialStore';
import { confirmGame, gameAlert } from '../ui';

const FAILED = 'Check your connection and try again.';

type Target = Pick<PlayerType, 'id' | 'screen_name'> & Partial<Pick<PlayerType, 'friend_status' | 'is_friend' | 'has_friend_request_from'>>;

/** Players cheered this session (the server allows one per player per day). */
const cheeredToday = new Set<number>();

export function wasCheered(id: number): boolean {
  return cheeredToday.has(id);
}

/**
 * Every friend action in one place, optimistic: the button changes the moment
 * it is tapped, every screen agrees through the social store, and a failure
 * puts it back and says so in the game dialog.
 *
 * One tap for the happy paths (Add, Yes, No, Cheer). A confirm only where a
 * mistake hurts: taking a request back, removing a friend, blocking.
 */
export function useFriendActions() {
  const { refreshPlayer } = useContext(AuthContext);

  const run = useCallback(async (player: Target, verb: FriendVerb, call: () => Promise<unknown>, onError: string) => {
    const before = getOverrides().get(player.id) ?? statusOf(player);
    const after = nextStatus(before, verb);
    setStatus(player.id, after);
    if (before === 'incoming' && after !== 'incoming') adjustPendingIncoming(-1);
    try {
      await call();
      if (after === 'friends' || before === 'friends') void refreshPlayer?.().catch(() => undefined);
      return after;
    } catch {
      setStatus(player.id, before);
      if (before === 'incoming' && after !== 'incoming') adjustPendingIncoming(1);
      playSfx('fail');
      haptic('failBuzz');
      gameAlert(onError, FAILED);
      return null;
    }
  }, [refreshPlayer]);

  return useMemo(() => ({
    /** Add (or, if they already asked, this is a Yes). */
    add: async (player: Target): Promise<FriendStatus | null> => {
      playSfx('whoosh');
      haptic('hitSoft');
      const result = await run(player, 'add', () => sendFriendRequest(player as PlayerType), "Couldn't send that");
      if (result === 'friends') { playSfx('win'); haptic('success'); }
      return result;
    },
    accept: async (player: Target): Promise<FriendStatus | null> => {
      playSfx('win');
      haptic('success');
      return run(player, 'accept', () => acceptFriendRequest(player as PlayerType), "Couldn't say yes");
    },
    decline: async (player: Target): Promise<FriendStatus | null> => {
      playSfx('tap');
      haptic('tapLight');
      return run(player, 'decline', () => denyFriendRequest(player), "Couldn't answer that");
    },
    cancel: async (player: Target): Promise<FriendStatus | null> => {
      if (!(await confirmGame({ title: `Take back your request to ${player.screen_name}?`, confirmLabel: 'Take back', cancelLabel: 'Keep it', icon: 'shark' }))) return null;
      return run(player, 'cancel', () => cancelFriendRequest(player), "Couldn't take it back");
    },
    remove: async (player: Target): Promise<FriendStatus | null> => {
      if (!(await confirmGame({ title: `Remove ${player.screen_name} from your friends?`, confirmLabel: 'Remove', cancelLabel: 'Keep', destructive: true }))) return null;
      return run(player, 'remove', () => unfriend(player as PlayerType), "Couldn't remove friend");
    },
    block: async (player: Target): Promise<FriendStatus | null> => {
      if (!(await confirmGame({
        title: `Block ${player.screen_name}?`,
        message: 'They will not be able to find you, add you or send you anything. They will not be told.',
        confirmLabel: 'Block',
        destructive: true,
      }))) return null;
      return run(player, 'block', () => blockPlayer(player), "Couldn't block");
    },
    unblock: async (player: Target): Promise<FriendStatus | null> =>
      run(player, 'unblock', () => unblockPlayer(player), "Couldn't unblock"),
    /** A heart for a friend's shark: sends them 5 coins, once a day. */
    cheer: async (player: Target): Promise<boolean> => {
      if (cheeredToday.has(player.id)) return true;
      cheeredToday.add(player.id);
      playSfx('coin');
      haptic('success');
      try {
        await createCompliment(player.id);
        return true;
      } catch (error: any) {
        // 422 means "already today": that is still a sent heart.
        if (error?.response?.status === 422) return true;
        cheeredToday.delete(player.id);
        playSfx('fail');
        gameAlert("Couldn't send the heart", FAILED);
        return false;
      }
    },
  }), [run]);
}

/**
 * Legacy shape kept for older callers. Each now goes through the optimistic
 * actions above (so the button changes state and a double tap can't repeat).
 */
export default function useFriends() {
  const actions = useFriendActions();
  return {
    addFriend: async (player: PlayerType) => { await actions.add(player); },
    acceptFriend: async (player: PlayerType, onPress?: () => void) => {
      if ((await actions.accept(player)) === 'friends') await onPress?.();
    },
    removeFriend: async (player: PlayerType, onPress: () => void) => {
      if ((await actions.remove(player)) === 'none') await onPress();
    },
  };
}
