import { Image } from 'expo-image';
import { useContext, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import markAsRead from '../api/endpoints/me/notifications/markAsRead';
import config from '../config';
import { NotificationContext } from '../context/NotificationProvider';
import dayjs from '../helpers/dayjs';
import { NotificationType } from '../models/notification-type';

export default function Notification({
  notification,
}: {
  readonly notification: NotificationType;
}) {
  const [hasRead, setHasRead] = useState<boolean>(!!notification.read_at);
  const { refreshNotificationCount } = useContext(NotificationContext);

  return (
    <TouchableOpacity
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        paddingLeft: 16,
        paddingRight: 16,
      }}
      onPress={async () => {
        if (!hasRead) {
          await markAsRead(notification.id);
          await refreshNotificationCount();
          setHasRead(true);
        }

        if (notification.data.route) {
          RootNavigation.navigate(
            notification.data.route.screen,
            notification.data.route.params
          );
        }
      }}
    >
      <View
        style={{
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: 3,
          },
          shadowRadius: 0,
          shadowOpacity: 0.4,
          width: 50,
          height: 50,
          position: 'relative',
        }}
      >
        <View
          style={{
            borderWidth: 3,
            borderColor: 'white',
            overflow: 'hidden',
            borderRadius: 50,
            width: 50,
            height: 50,
          }}
        >
          <Image
            source={notification.data.image ?? require('../../assets/icon.png')}
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          />
        </View>
      </View>
      <View
        style={{
          flex: 1,
          marginLeft: 16,
        }}
      >
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 16,
            marginBottom: 16,
          }}
        >
          {notification.data.message}
        </Text>
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 16,
          }}
        >
          {dayjs(notification.created_at).startOf('second').fromNow()}
        </Text>
      </View>
      <View
        style={{
          marginLeft: 16,
        }}
      >
        <View
          style={{
            backgroundColor: hasRead ? 'transparent' : config.primary,
            width: 12,
            height: 12,
            borderRadius: 8,
          }}
        />
      </View>
    </TouchableOpacity>
  );
}
