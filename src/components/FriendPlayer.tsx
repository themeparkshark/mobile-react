import { Image } from 'expo-image';
import { Text, TouchableOpacity, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import useCompliment from '../hooks/useCompliment';
import useFriends from '../hooks/useFriends';
import { PlayerType } from '../models/player-type';
import Avatar from './Avatar';
import Button from './Button';

export default function FriendPlayer({
  isFriend,
  isPending,
  onAccept,
  onRemove,
  player,
}: {
  readonly isFriend?: boolean;
  readonly isPending?: boolean;
  readonly onAccept?: () => void;
  readonly onRemove?: () => void;
  readonly player: PlayerType;
}) {
  const { acceptFriend, addFriend, removeFriend } = useFriends();
  const { complimentPlayer } = useCompliment();

  return (
    <TouchableOpacity
      key={player.id}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 16,
      }}
      onPress={() => {
        RootNavigation.navigate('Player', {
          player: player.id,
        });
      }}
    >
      <View>
        <Avatar size="md" player={player} />
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
          {player.screen_name}
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
              await complimentPlayer(player);
            }}
          >
            <Image
              source={require('../../assets/images/screens/player/compliment.png')}
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
              acceptFriend(player, async () => {
                await onAccept?.();
              });
              return;
            }

            if (!isFriend) {
              addFriend(player);
              return;
            }

            removeFriend(player, async () => {
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
