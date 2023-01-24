import { UserType } from '../models/user-type';
import { Alert, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthProvider';
import Button from './Button';
import * as RootNavigation from '../RootNavigation';
import unfriend from '../api/endpoints/me/users/unfriend';
import sendFriendRequest from '../api/endpoints/me/users/send-friend-request';
import acceptFriendRequest from '../api/endpoints/me/users/accept-friend-request';

export default function FriendsList({
  users,
  onAccept,
  onUnfriend,
}: {
  readonly users: UserType[];
  readonly onAccept?: () => void;
  readonly onUnfriend?: () => void;
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
                  <Image
                    source={{
                      uri: user.avatar_url,
                    }}
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 10,
                    }}
                    resizeMode="cover"
                  />
                </View>
                <View
                  style={{
                    paddingLeft: 16,
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
                  <View
                    style={{
                      paddingRight: 16,
                    }}
                  >
                    <Button
                      onPress={() => {
                        RootNavigation.navigate('User', {
                          user: user.id,
                        });
                      }}
                    >
                      <Image
                        source={require('../../assets/images/screens/profile/view.png')}
                        style={{
                          width: 50,
                          height: 50,
                        }}
                        resizeMode="contain"
                      />
                    </Button>
                  </View>
                  {user.is_friend && onUnfriend && (
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
                                  await onUnfriend();

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
                          source={require('../../assets/images/screens/explore/base.png')}
                          style={{
                            width: 50,
                            height: 50,
                          }}
                          resizeMode="contain"
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
                            width: 50,
                            height: 50,
                          }}
                          resizeMode="contain"
                        />
                      </Button>
                    </View>
                  )}
                  {user.has_friend_request_from && onAccept && (
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
                                  await onAccept();
                                },
                              },
                            ]
                          );
                        }}
                      >
                        <Image
                          source={require('../../assets/images/screens/explore/base.png')}
                          style={{
                            width: 50,
                            height: 50,
                          }}
                          resizeMode="contain"
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
