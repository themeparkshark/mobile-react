import { useContext } from 'react';
import { Alert } from 'react-native';
import { vsprintf } from 'sprintf-js';
import acceptFriendRequest from '../api/endpoints/me/users/accept-friend-request';
import sendFriendRequest from '../api/endpoints/me/users/send-friend-request';
import unfriend from '../api/endpoints/me/users/unfriend';
import { CrumbContext } from '../context/CrumbProvider';
import { FriendContext } from '../context/FriendProvider';
import { UserType } from '../models/user-type';

export default function useFriends() {
  const { refreshFriends } = useContext(FriendContext);
  const { crumbs } = useContext(CrumbContext);

  return {
    addFriend: (user: UserType) => {
      Alert.alert(
        '',
        vsprintf(crumbs.prompts.send_friend_request, [user.screen_name]),
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Ok',
            onPress: async () => {
              await sendFriendRequest(user);

              Alert.alert('', crumbs.messages.friend_request_sent, [
                {
                  text: 'Ok',
                  style: 'cancel',
                },
              ]);
            },
          },
        ]
      );
    },
    acceptFriend: (user: UserType) => {
      Alert.alert(
        '',
        vsprintf(crumbs.prompts.accept_friend_request, [user.screen_name]),
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Ok',
            onPress: async () => {
              await acceptFriendRequest(user);

              Alert.alert('', crumbs.messages.friend_request_accepted, [
                {
                  text: 'Ok',
                  style: 'cancel',
                },
              ]);
            },
          },
        ]
      );
    },
    removeFriend: (user: UserType, onPress: () => void) => {
      Alert.alert(
        '',
        vsprintf(crumbs.prompts.remove_friend, [user.screen_name]),
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Ok',
            onPress: async () => {
              await unfriend(user);
              await refreshFriends();
              await onPress();

              Alert.alert(
                '',
                vsprintf(crumbs.messages.friend_removed, [user.screen_name]),
                [
                  {
                    text: 'Ok',
                    style: 'cancel',
                  },
                ]
              );
            },
          },
        ]
      );
    },
  };
}
