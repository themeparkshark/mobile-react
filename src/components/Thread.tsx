import {Text, TouchableOpacity, View} from 'react-native';
import Avatar from './Avatar';
import dayjs from '../helpers/dayjs';
import {truncate} from 'lodash';
import {ThreadType} from '../models/thread-type';
import * as RootNavigation from '../RootNavigation';
import config from '../config';

export default function Thread({ thread } : {
  readonly thread: ThreadType;
}) {
  return (
    <TouchableOpacity
      key={thread.id}
      onPress={() => {
        RootNavigation.navigate('Thread', {
          thread: thread.id,
        });
      }}
      style={{
        flexDirection: 'row',
        borderLeftWidth: 2,
        borderLeftColor: thread.pinned_at ? config.primary : 'transparent',
        paddingLeft: 16,
        paddingRight: 16,
        alignItems: 'center',
      }}
    >
      <View>
        <Avatar size={60} user={thread.user} />
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
            fontSize: 22,
            paddingBottom: 8,
          }}
        >
          {thread.title}
        </Text>
        {thread.latest_comment && !thread.pinned_at && (
          <>
            <Text
              style={{
                paddingBottom: 8,
              }}
            >
              {thread.latest_comment.user.screen_name} replied{' '}
              {dayjs(thread.latest_comment.updated_at)
              .startOf('second')
              .fromNow()}{' '}
              ago
            </Text>
            <Text
              style={{
                opacity: 0.5,
              }}
            >
              {truncate(thread.latest_comment.content, {
                length: 100,
              })}
            </Text>
          </>
        )}
      </View>
      <View
        style={{
          paddingLeft: 16,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            backgroundColor: 'rgba(0, 0, 0, .05)',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 16,
          }}
        >
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 18,
            }}
          >
            {thread.comments_count}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
