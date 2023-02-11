import { Image } from 'expo-image';
import { useContext } from 'react';
import { Alert, Text, View } from 'react-native';
import acceptFriendRequest from '../api/endpoints/me/users/accept-friend-request';
import sendFriendRequest from '../api/endpoints/me/users/send-friend-request';
import unfriend from '../api/endpoints/me/users/unfriend';
import { AuthContext } from '../context/AuthProvider';
import { UserType } from '../models/user-type';
import Avatar from './Avatar';
import Button from './Button';

export default function FriendsList({
  users,
  onSuccess,
}: {
  readonly users: UserType[];
  readonly onSuccess?: () => void;
}) {
  const { refreshUser } = useContext(AuthContext);

  return (
    <View>
      {users.length > 0 && (
        <View>
          {users.map((user) => {
            return (
              <View
                key={user.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingTop: 16,
                }}
              >
                <View>
                  <Avatar size={60} user={user} />
                </View>
                <View
                  style={{
                    paddingLeft: 32,
                    flex: 1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 18,
                    }}
                  >
                    {user.screen_name}
                  </Text>
                </View>
                <View
                  style={{
                    paddingLeft: 16,
                    alignItems: 'center',
                    flexDirection: 'row',
                  }}
                >
                  {user.is_friend && onSuccess && (
                    <View>
                      <Button
                        onPress={async () => {
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
                                  await onSuccess();

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
                        }}
                      >
                        <Image
                          source={require('../../assets/images/screens/friends/remove_friend.png')}
                          style={{
                            width: 35,
                            height: 35,
                          }}
                          contentFit="contain"
                        />
                      </Button>
                    </View>
                  )}
                  {!user.is_friend && !user.has_friend_request_from && (
                    <View>
                      <Button
                        onPress={async () => {
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
                        }}
                      >
                        <Image
                          source={require('../../assets/images/screens/explore/base.png')}
                          style={{
                            width: 35,
                            height: 35,
                          }}
                          contentFit="contain"
                        />
                      </Button>
                    </View>
                  )}
                  {user.has_friend_request_from && onSuccess && (
                    <View>
                      <Button
                        onPress={async () => {
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
                                  await refreshUser();
                                  await onSuccess();
                                },
                              },
                            ]
                          );
                        }}
                      >
                        <Image
                          source={require('../../assets/images/screens/explore/base.png')}
                          style={{
                            width: 35,
                            height: 35,
                          }}
                          contentFit="contain"
                        />
                      </Button>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
