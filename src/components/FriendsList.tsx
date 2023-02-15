import { Image } from 'expo-image';
import { useContext } from 'react';
import {Alert, Text, TouchableOpacity, View} from 'react-native';
import acceptFriendRequest from '../api/endpoints/me/users/accept-friend-request';
import sendFriendRequest from '../api/endpoints/me/users/send-friend-request';
import unfriend from '../api/endpoints/me/users/unfriend';
import { AuthContext } from '../context/AuthProvider';
import { UserType } from '../models/user-type';
import Avatar from './Avatar';
import Button from './Button';
import * as RootNavigation from '../RootNavigation';

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
              <TouchableOpacity
                key={user.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingTop: 16,
                }}
                onPress={() => {
                  RootNavigation.navigate('User', {
                    user: user.id,
                  });
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
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}
