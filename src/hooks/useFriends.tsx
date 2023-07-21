import { Alert } from 'react-native';
import { vsprintf } from 'sprintf-js';
import acceptFriendRequest from '../api/endpoints/me/users/accept-friend-request';
import sendFriendRequest from '../api/endpoints/me/users/send-friend-request';
import unfriend from '../api/endpoints/me/users/unfriend';
import { UserType } from '../models/user-type';
import useCrumbs from './useCrumbs';

export default function useFriends() {
  const { messages, prompts } = useCrumbs();

  return {
    addFriend: (user: UserType) => {
      Alert.alert(
        '',
        vsprintf(prompts.send_friend_request, [user.screen_name]),
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Ok',
            onPress: async () => {
              await sendFriendRequest(user);

              Alert.alert('', messages.friend_request_sent, [
                {
                  text: 'Ok',
                },
              ]);
            },
          },
        ]
      );
    },
    acceptFriend: (user: UserType, onPress?: () => void) => {
      Alert.alert(
        '',
        vsprintf(prompts.accept_friend_request, [user.screen_name]),
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Ok',
            onPress: async () => {
              await acceptFriendRequest(user);
              await onPress();

              Alert.alert('', messages.friend_request_accepted, [
                {
                  text: 'Ok',
                },
              ]);
            },
          },
        ]
      );
    },
    removeFriend: (user: UserType, onPress: () => void) => {
      Alert.alert('', vsprintf(prompts.remove_friend, [user.screen_name]), [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Ok',
          onPress: async () => {
            await unfriend(user);
            await onPress();

            Alert.alert(
              '',
              vsprintf(messages.friend_removed, [user.screen_name]),
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
