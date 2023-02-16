import { useContext } from 'react';
import { Alert } from 'react-native';
import acceptFriendRequest from '../api/endpoints/me/users/accept-friend-request';
import sendFriendRequest from '../api/endpoints/me/users/send-friend-request';
import unfriend from '../api/endpoints/me/users/unfriend';
import { FriendContext } from '../context/FriendProvider';
import { UserType } from '../models/user-type';

export default function useFriends() {
  const { refreshFriends } = useContext(FriendContext);

  return {
    addFriend: (user: UserType) => {
      Alert.alert(
        '',
        `Would you like to add ${user.screen_name} to your friends list?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Ok',
            onPress: async () => {
              await sendFriendRequest(user);

              Alert.alert('', 'Friend request sent.', [
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
        `${user.screen_name} has asked to be your friend. Do you accept?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Ok',
            onPress: async () => {
              await acceptFriendRequest(user);

              Alert.alert('', 'Friend request accepted.', [
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
    removeFriend: (user: UserType) => {
      Alert.alert(
        '',
        `Would you like to remove ${user.screen_name} from your friends list?`,
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

              Alert.alert(
                '',
                `${user.screen_name} has been removed from your friends list.`,
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
