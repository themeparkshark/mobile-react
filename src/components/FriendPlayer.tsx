import { Image } from 'expo-image';
import { useContext, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as RootNavigation from '../RootNavigation';
import config from '../config';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import useCompliment from '../hooks/useCompliment';
import useFriends from '../hooks/useFriends';
import { PlayerType } from '../models/player-type';
import Avatar from './Avatar';
import Button from './Button';

const tapSound = require('../../assets/sounds/tap.mp3');

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
  const { playSound } = useContext(SoundEffectContext);
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0.5],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity
        onPress={() => {
          playSound(tapSound);
          if (isFriend) {
            removeFriend(player, async () => {
              await onRemove?.();
            });
          } else if (isPending) {
            acceptFriend(player, async () => {
              await onAccept?.();
            });
          } else {
            addFriend(player);
          }
          swipeableRef.current?.close();
        }}
        style={{
          backgroundColor: isFriend ? '#ef4444' : '#22c55e',
          justifyContent: 'center',
          alignItems: 'center',
          width: 80,
          borderRadius: 16,
          marginBottom: 10,
          marginLeft: 6,
        }}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Image
            source={
              isFriend
                ? require('../../assets/images/screens/friends/remove_friend.png')
                : require('../../assets/images/screens/friends/add_friend.png')
            }
            style={{ width: 28, height: 28 }}
            contentFit="contain"
          />
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 11,
              color: 'white',
              marginTop: 4,
            }}
          >
            {isFriend ? 'Remove' : isPending ? 'Accept' : 'Add'}
          </Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderLeftActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [0, 80],
      outputRange: [0.5, 1],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity
        onPress={async () => {
          playSound(tapSound);
          await complimentPlayer(player);
          swipeableRef.current?.close();
        }}
        style={{
          backgroundColor: '#f59e0b',
          justifyContent: 'center',
          alignItems: 'center',
          width: 80,
          borderRadius: 16,
          marginBottom: 10,
          marginRight: 6,
        }}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Image
            source={require('../../assets/images/screens/player/compliment.png')}
            style={{ width: 28, height: 28 }}
            contentFit="contain"
          />
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 11,
              color: 'white',
              marginTop: 4,
            }}
          >
            Compliment
          </Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      overshootRight={false}
      overshootLeft={false}
      friction={2}
    >
      <TouchableOpacity
        key={player.id}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderRadius: 16,
          padding: 12,
          marginBottom: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 2,
        }}
        onPress={() => {
          playSound(tapSound);
          RootNavigation.navigate('Player', {
            player: player.id,
          });
        }}
      >
        {/* Avatar with level badge */}
        <View
          style={{
            borderWidth: 2.5,
            borderColor: config.secondary,
            borderRadius: 999,
            padding: 2,
            backgroundColor: config.secondary,
          }}
        >
          <View style={{ borderRadius: 999, overflow: 'hidden' }}>
            <Avatar size="md" player={player} showLevel />
          </View>
        </View>

        {/* Name + level text */}
        <View
          style={{
            paddingLeft: 14,
            flex: 1,
          }}
        >
          <Text
            style={{
              fontFamily: 'Shark',
              fontSize: 16,
              textTransform: 'uppercase',
              color: '#1a1a2e',
            }}
            numberOfLines={1}
          >
            {player.screen_name}
          </Text>
          {player.experience_level && (
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 13,
                color: '#94a3b8',
                marginTop: 2,
              }}
            >
              Level {player.experience_level.level}
            </Text>
          )}
        </View>

        {/* Action buttons (still visible, swipe is bonus) */}
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <Button
            onPress={async () => {
              playSound(tapSound);
              await complimentPlayer(player);
            }}
          >
            <Image
              source={require('../../assets/images/screens/player/compliment.png')}
              style={{
                width: 36,
                aspectRatio: 1,
              }}
              contentFit="contain"
            />
          </Button>
          <Button
            onPress={() => {
              playSound(tapSound);
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
                width: 36,
                aspectRatio: 1,
              }}
              contentFit="contain"
            />
          </Button>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}
