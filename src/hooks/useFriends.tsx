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
import {
  SurfaceContext, adjustPendingIncoming, getOverrides, markJustFriended, setHearted, setStatus, wasHearted,
} from '../screens/social/socialStore';
import { confirmGame, gameAlert } from '../ui';

const FAILED = 'Check your connection and try again.';

type Target = Pick<PlayerType, 'id' | 'screen_name'> & Partial<Pick<PlayerType, 'friend_status' | 'is_friend' | 'has_friend_request_from'>>;

/** Requests in flight, per player: a second tap while one is running does nothing. */
const inFlight = new Set<number>();

/**
 * Every friend action in one place, optimistic: the button changes the moment
 * it is tapped, every screen agrees through the social store, and a failure
 * puts it back and says so in the game dialog.
 *
 * One tap for the happy paths (Add, Yes, No, Heart). A confirm only where a
 * mistake hurts: taking a request back, removing a friend, blocking. A tap
 * that would not change anything (a double tap) never reaches the network.
 */
export function useFriendActions() {
  const { refreshPlayer, player: viewer } = useContext(AuthContext);
  const viewerId = viewer?.id ?? null;
  const surface = useContext(SurfaceContext);

  const run = useCallback(async (player: Target, verb: FriendVerb, call: () => Promise<unknown>, onError: string) => {
    const before = getOverrides().get(player.id) ?? statusOf(player);
    const after = nextStatus(before, verb);
    if (after === before || inFlight.has(player.id)) return null;
    inFlight.add(player.id);
    setStatus(player.id, after);
    if (after === 'friends') markJustFriended(player.id, surface);
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
    } finally {
      inFlight.delete(player.id);
    }
  }, [refreshPlayer, surface]);

  return useMemo(() => ({
    /** Add (or, if they already asked, this is a Yes). */
    add: async (player: Target): Promise<FriendStatus | null> => {
      const result = await run(player, 'add', () => sendFriendRequest(player as PlayerType), "Couldn't send that");
      if (result === 'outgoing') { playSfx('whoosh'); haptic('hitSoft'); }
      if (result === 'friends') { playSfx('win'); haptic('success'); }
      return result;
    },
    accept: async (player: Target): Promise<FriendStatus | null> => {
      const result = await run(player, 'accept', () => acceptFriendRequest(player as PlayerType), "Couldn't say yes");
      if (result) { playSfx('win'); haptic('success'); }
      return result;
    },
    decline: async (player: Target): Promise<FriendStatus | null> => {
      const result = await run(player, 'decline', () => denyFriendRequest(player), "Couldn't answer that");
      if (result) { playSfx('tap'); haptic('tapLight'); }
      return result;
    },
    cancel: async (player: Target): Promise<FriendStatus | null> => {
      if (!(await confirmGame({ title: `Take back your request to ${player.screen_name}?`, confirmLabel: 'Take back', cancelLabel: 'Keep it', icon: 'timer' }))) return null;
      return run(player, 'cancel', () => cancelFriendRequest(player), "Couldn't take it back");
    },
    remove: async (player: Target): Promise<FriendStatus | null> => {
      if (!(await confirmGame({ title: `Remove ${player.screen_name} from your friends?`, confirmLabel: 'Remove', cancelLabel: 'Keep', destructive: true }))) return null;
      return run(player, 'remove', () => unfriend(player as PlayerType), "Couldn't remove friend");
    },
    block: async (player: Target, skipConfirm = false): Promise<FriendStatus | null> => {
      if (!skipConfirm && !(await confirmGame({
        title: `Block ${player.screen_name}?`,
        message: 'They will not be able to find you, add you or send you anything. They will not be told.',
        confirmLabel: 'Block',
        destructive: true,
      }))) return null;
      return run(player, 'block', () => blockPlayer(player), "Couldn't block");
    },
    unblock: async (player: Target): Promise<FriendStatus | null> =>
      run(player, 'unblock', () => unblockPlayer(player), "Couldn't unblock"),
    hearted: (id: number) => wasHearted(viewerId, id),
    /** A heart for a friend: sends them 5 coins, once a day. */
    cheer: async (player: Target): Promise<boolean> => {
      if (wasHearted(viewerId, player.id) || inFlight.has(-player.id)) return true;
      inFlight.add(-player.id);
      setHearted(viewerId, player.id, true);
      playSfx('coin');
      haptic('success');
      try {
        await createCompliment(player.id);
        return true;
      } catch (error: any) {
        const message = String(error?.response?.data?.message ?? '');
        // "Already today" is still a sent heart; anything else puts it back.
        if (error?.response?.status === 422 && !/friends/i.test(message)) return true;
        setHearted(viewerId, player.id, false);
        playSfx('fail');
        gameAlert(/friends/i.test(message) ? 'Hearts are for friends' : "Couldn't send the heart",
          /friends/i.test(message) ? 'Add them as a friend first.' : FAILED);
        return false;
      } finally {
        inFlight.delete(-player.id);
      }
    },
  }), [run, viewerId]);
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
