import { Image } from 'expo-image';
import { Text, TouchableOpacity, View } from 'react-native';
import useCompliment from '../hooks/useCompliment';
import useFriends from '../hooks/useFriends';
import { UserType } from '../models/user-type';
import * as RootNavigation from '../RootNavigation';
import Avatar from './Avatar';
import Button from './Button';

export default function FriendUser({
  isFriend,
  isPending,
  onAccept,
  onRemove,
  user,
}: {
  readonly isFriend?: boolean;
  readonly isPending?: boolean;
  readonly onAccept?: () => void;
  readonly onRemove?: () => void;
  readonly user: UserType;
}) {
  const { acceptFriend, addFriend, removeFriend } = useFriends();
  const { complimentUser } = useCompliment();

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
        <Avatar size="md" user={user} />
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
          flexDirection: 'row',
        }}
      >
        <View
          style={{
            paddingRight: 8,
          }}
        >
          <Button
            onPress={async () => {
              await complimentUser(user);
            }}
          >
            <Image
              source={require('../../assets/images/screens/user/compliment.png')}
              style={{
                width: 40,
                aspectRatio: 1,
              }}
              contentFit="contain"
            />
          </Button>
        </View>
        <Button
          onPress={() => {
            if (isPending && !isFriend) {
              acceptFriend(user, async () => {
                await onAccept?.();
              });
              return;
            }

            if (!isFriend) {
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
              !isFriend
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
