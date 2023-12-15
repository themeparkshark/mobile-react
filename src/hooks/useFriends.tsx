import { Alert } from 'react-native';
import { vsprintf } from 'sprintf-js';
import acceptFriendRequest from '../api/endpoints/me/players/accept-friend-request';
import sendFriendRequest from '../api/endpoints/me/players/send-friend-request';
import unfriend from '../api/endpoints/me/players/unfriend';
import { PlayerType } from '../models/player-type';
import useCrumbs from './useCrumbs';

export default function useFriends() {
  const { messages, prompts } = useCrumbs();

  return {
    addFriend: (player: PlayerType) => {
      Alert.alert(
        vsprintf(prompts.send_friend_request, [player.screen_name]),
        '',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Ok',
            onPress: async () => {
              await sendFriendRequest(player);

              Alert.alert(messages.friend_request_sent, '', [
                {
                  text: 'Ok',
                },
              ]);
            },
          },
        ]
      );
    },
    acceptFriend: (player: PlayerType, onPress?: () => void) => {
      Alert.alert(
        vsprintf(prompts.accept_friend_request, [player.screen_name]),
        '',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Ok',
            onPress: async () => {
              await acceptFriendRequest(player);
              await onPress?.();

              Alert.alert(messages.friend_request_accepted, '', [
                {
                  text: 'Ok',
                },
              ]);
            },
          },
        ]
      );
    },
    removeFriend: (player: PlayerType, onPress: () => void) => {
      Alert.alert(vsprintf(prompts.remove_friend, [player.screen_name]), '', [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Ok',
          onPress: async () => {
            await unfriend(player);
            await onPress();

            Alert.alert(
              vsprintf(messages.friend_removed, [player.screen_name]),
              '',
              [
                {
                  text: 'Ok',
                },
              ]
            );
          },
        },
      ]);
    },
  };
}
