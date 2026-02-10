import { Image } from 'expo-image';
import { useContext, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as RootNavigation from '../RootNavigation';
import markAsRead from '../api/endpoints/me/notifications/markAsRead';
import deleteNotification from '../api/endpoints/me/notifications/deleteNotification';
import config from '../config';
import { NotificationContext } from '../context/NotificationProvider';
import dayjs from '../helpers/dayjs';
import { NotificationType } from '../models/notification-type';

/**
 * Backend screen names / param keys don't always match the navigator.
 * Translate them here so tapping a notification actually navigates correctly.
 */
function resolveRoute(route: NotificationType['content']['route']) {
  if (!route?.screen) return null;

  const screen = route.screen;
  const params = route.params ?? {};

  // User → Player, and { user: id } → { player: id }
  if (screen === 'User') {
    return {
      screen: 'Player',
      params: { player: params.user ?? params.player, ...params },
    };
  }

  // Park sends { user: id } but ParkScreen expects { player: id }
  if (screen === 'Park' && params.user && !params.player) {
    return {
      screen: 'Park',
      params: { ...params, player: params.user },
    };
  }

  return { screen, params };
}

export default function Notification({
  notification,
  onDelete,
}: {
  readonly notification: NotificationType;
  readonly onDelete?: (id: string) => void;
}) {
  const [hasRead, setHasRead] = useState<boolean>(!!notification.read_at);
  const [deleting, setDeleting] = useState(false);
  const { refreshNotificationCount } = useContext(NotificationContext);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const swipeRef = useRef<Swipeable>(null);

  const isUnread = !hasRead;

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.97,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 300,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!hasRead) {
      try {
        await markAsRead(notification.id);
        await refreshNotificationCount();
        setHasRead(true);
      } catch {
        // Silently fail — still try to navigate
      }
    }

    const resolved = resolveRoute(notification.content?.route);
    if (resolved) {
      try {
        RootNavigation.navigate(resolved.screen, resolved.params);
      } catch {
        // Screen doesn't exist — silently ignore rather than crash
      }
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await deleteNotification(notification.id);
      if (isUnread) await refreshNotificationCount();
      onDelete?.(notification.id);
    } catch {
      swipeRef.current?.close();
      setDeleting(false);
    }
  };

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, -40, 0],
      outputRange: [1, 0.8, 0.5],
      extrapolate: 'clamp',
    });

    return (
      <Pressable
        onPress={handleDelete}
        style={{
          backgroundColor: '#ef4444',
          justifyContent: 'center',
          alignItems: 'center',
          width: 80,
          borderRadius: 16,
          marginRight: 16,
          marginLeft: -8,
          marginBottom: 8,
        }}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Image
            source={require('../../assets/images/screens/notifications/mark_all_as_read.png')}
            style={{ width: 24, height: 24, tintColor: 'white', marginBottom: 4 }}
            contentFit="contain"
          />
          <Text
            style={{
              fontFamily: 'Shark',
              fontSize: 11,
              color: 'white',
              textTransform: 'uppercase',
            }}
          >
            Delete
          </Text>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={60}
      overshootRight={false}
      onSwipeableOpen={(direction) => {
        if (direction === 'right') handleDelete();
      }}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={{ paddingHorizontal: 16, marginBottom: 8 }}
      >
        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isUnread ? '#eef6ff' : 'white',
            borderRadius: 16,
            padding: 14,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isUnread ? 0.1 : 0.05,
            shadowRadius: 6,
            elevation: isUnread ? 3 : 1,
            borderWidth: isUnread ? 1 : 0,
            borderColor: isUnread ? 'rgba(59,130,246,0.15)' : 'transparent',
            transform: [{ scale: scaleAnim }],
          }}
        >
          {/* Avatar */}
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              overflow: 'hidden',
              borderWidth: 2,
              borderColor: isUnread ? config.secondary : '#e2e8f0',
            }}
          >
            <Image
              source={
                notification.content?.image ?? require('../../assets/icon.png')
              }
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          </View>

          {/* Content */}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text
              style={{
                fontFamily: isUnread ? 'Shark' : 'Knockout',
                fontSize: isUnread ? 14 : 15,
                color: isUnread ? config.primary : '#334155',
                lineHeight: 20,
              }}
              numberOfLines={3}
            >
              {notification.content?.message ?? ''}
            </Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 12,
                color: '#94a3b8',
                marginTop: 4,
              }}
            >
              {dayjs(notification.created_at).startOf('second').fromNow()}
            </Text>
          </View>

          {/* Unread dot */}
          {isUnread && (
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: config.secondary,
                marginLeft: 8,
                shadowColor: config.secondary,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.4,
                shadowRadius: 4,
              }}
            />
          )}

          {/* Arrow for actionable notifications */}
          {notification.content?.route && hasRead && (
            <Text
              style={{
                fontSize: 16,
                color: '#cbd5e1',
                marginLeft: 8,
              }}
            >
              ›
            </Text>
          )}
        </Animated.View>
      </Pressable>
    </Swipeable>
  );
}
