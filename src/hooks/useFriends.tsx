import { vsprintf } from 'sprintf-js';
import acceptFriendRequest from '../api/endpoints/players/accept-friend-request';
import sendFriendRequest from '../api/endpoints/players/send-friend-request';
import unfriend from '../api/endpoints/players/unfriend';
import { PlayerType } from '../models/player-type';
import { confirmGame, gameAlert } from '../ui';
import useCrumbs from './useCrumbs';

const FAILED = 'Check your connection and try again.';

/**
 * Friend actions with the game dialog: confirm, do it, then say what happened.
 * A failed request says so instead of silently leaving the dialog closed.
 */
export default function useFriends() {
  const { messages, prompts } = useCrumbs();

  return {
    addFriend: async (player: PlayerType) => {
      if (!(await confirmGame({ title: vsprintf(prompts.send_friend_request, [player.screen_name]), confirmLabel: 'Send', icon: 'shark' }))) return;
      try {
        await sendFriendRequest(player);
        gameAlert(messages.friend_request_sent, undefined, undefined, { icon: 'check', haptic: 'success' });
      } catch {
        gameAlert("Couldn't send the request", FAILED);
      }
    },
    acceptFriend: async (player: PlayerType, onPress?: () => void) => {
      if (!(await confirmGame({ title: vsprintf(prompts.accept_friend_request, [player.screen_name]), confirmLabel: 'Accept', icon: 'shark' }))) return;
      try {
        await acceptFriendRequest(player);
        await onPress?.();
        gameAlert(messages.friend_request_accepted, undefined, undefined, { icon: 'check', haptic: 'success' });
      } catch {
        gameAlert("Couldn't accept the request", FAILED);
      }
    },
    removeFriend: async (player: PlayerType, onPress: () => void) => {
      if (!(await confirmGame({ title: vsprintf(prompts.remove_friend, [player.screen_name]), confirmLabel: 'Remove', destructive: true }))) return;
      try {
        await unfriend(player);
        await onPress();
        gameAlert(vsprintf(messages.friend_removed, [player.screen_name]));
      } catch {
        gameAlert("Couldn't remove friend", FAILED);
      }
    },
  };
}
