import { Image } from 'expo-image';
import { Text, TouchableOpacity, View } from 'react-native';
import useFriends from '../hooks/useFriends';
import { UserType } from '../models/user-type';
import * as RootNavigation from '../RootNavigation';
import Avatar from './Avatar';
import Button from './Button';

export default function FriendUser({
  isSuggestion = false,
  onRemove,
  user,
}: {
  readonly isSuggestion?: boolean;
  readonly onRemove?: () => void;
  readonly user: UserType;
}) {
  const { addFriend, removeFriend } = useFriends();

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
      <View>
        <Button
          onPress={() => {
            if (isSuggestion) {
              addFriend(user);
              return;
            }

            removeFriend(user, async () => {
              await onRemove?.();
            });
          }}
        >
          <Image
            source={
              isSuggestion
                ? require('../../assets/images/screens/friends/add_friend.png')
                : require('../../assets/images/screens/friends/remove_friend.png')
            }
            style={{
              width: 40,
              aspectRatio: 1,
            }}
            contentFit="contain"
          />
        </Button>
      </View>
    </TouchableOpacity>
  );
}
